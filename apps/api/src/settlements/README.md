# 정산·현황·환율 (`settlements`, `fx`)

기능명세 4-4(정산)·4-5(환율)·4-6(예산)·4-9(지표), FR-601~604·701~705·806~808. 응답 타입은 `@yeojeong/shared`의 `api/settlements.ts`·`api/fx.ts`.

## 엔드포인트

| 메서드 | 경로 | 권한·단계 | 응답 | 에러 |
| --- | --- | --- | --- | --- |
| GET | `/api/trips/:tripId/summary` | 멤버, 진행 중·종료 | `TripSummary` | 404, 409 `TRIP_PHASE_INVALID`(시작 전) |
| GET | `/api/trips/:tripId/settlement` | 멤버, 종료 | `SettlementView`(없으면 지연 생성) | 404, 409 |
| GET | `/api/trips/:tripId/settlement/members/:membershipId/expenses` | 멤버, 종료 | `SettlementMemberExpenses` | 404(정산 대상 아님·UUID 아님), 409 |
| POST | `/api/trips/:tripId/settlement/recompute` | 그룹장, 종료 | `SettlementView` | 403 `NOT_LEADER`, 409 |
| GET | `/api/fx?base=JPY&date=2026-11-13` | 로그인 | `FxRateView` | 400, 503 `FX_RATE_UNAVAILABLE` |
| GET | `/api/trips/:tripId/fx-policy` | 멤버 | `TripFxView` | 404 |
| PATCH | `/api/trips/:tripId/fx-policy` | 그룹장, 시작 전·진행 중 | `{ fx: TripFxView, recalculatedCount }` | 400, 403, 409 `FX_POLICY_LOCKED`·`VERSION_CONFLICT`(`details.current`) |
| POST | `/api/internal/jobs/fx` | 내부 잡 | `FxJobResult` | 403, 503, 500(재계산 일부 실패) |
| POST | `/api/internal/jobs/settlements` | 내부 잡 | `SettlementSweepResult` | 403, 500(일부 실패) |
| POST | `/api/internal/jobs/settlements/recompute` `{ tripId }` | 내부 잡 | `SettlementRecomputeResult` | 403, 404, 409 |

## 정산 스냅샷: 여정당 정확히 1건

- 만드는 함수는 `SettlementSnapshotService.ensureSettlement(tripId)` 하나다. 이미 있으면 no-op, 없으면 Trip 행 `FOR UPDATE` 트랜잭션에서 다시 확인하고 만든다(`settlements.trip_id` UNIQUE가 최종 방어).
- 부르는 곳: `trip.ended` 리스너, `GET …/settlement`(지연 생성), `POST /api/internal/jobs/settlements`(빠진 정산 복구).
- 다시 계산은 `recompute`(그룹장 또는 내부 잡)로만 한다. 같은 트랜잭션에서 지우고 다시 만든다.
- 정산 대상 M = 종료 시각에 활성인 멤버 ∪ 공동 결제의 결제자·부담 인원인 나간 멤버. `isLeft`는 `leftAt ≤ endedAt` 기준이라 언제 만들어도 결과가 같다.
- `personalCount`는 PERSONAL + PENDING(종료 때 개인이 되는 건) 건수. 금액은 읽지 않는다.
- 검산(Σ netKrw = 0)이 깨지면 `SettlementImbalanceError`로 롤백하고 아무것도 저장하지 않는다.

### `trip.ended` 이벤트 (계약은 `src/trips/events.ts`의 `TRIP_EVENTS.ENDED`·`TripEndedEvent`)

- S2A가 종료 커밋 **후** `DomainEventPublisher`(emitAsync)로 보낸다. 받을 때 Trip은 이미 ENDED다.
- 리스너 `SettlementSnapshotService.onTripEnded`는 `ensureSettlement(tripId)`만 부른다. 재발행(`redelivered`)·중복 전달도 같은 결과(1건).
- 실패는 발행자에게 던지지 않는다(S2A 계약). 원인과 tripId를 error 로그로 남기고, 정산이 없는 종료 여정은 ① 자동 종료 잡의 재발행 ② `GET …/settlement` 지연 생성 ③ `POST /api/internal/jobs/settlements`가 다시 만든다. 종료되지 않았거나 없는 여정의 이벤트는 warn만 남긴다.
- expenses의 `trip.ended` 리스너(미확정 → 개인)와 순서가 정해져 있지 않다. 그래서 `personalCount`는 PENDING도 센다.

### 다른 모듈이 쓰는 함수

| 함수 | 위치 | 쓰는 곳 |
| --- | --- | --- |
| `computeSettlement(input, { assertBalanced })` | `compute.ts` | 순수·결정적·정수. 현황·스냅샷·종료 미리보기 |
| `SettlementSnapshotService.preview(tripId)` | `settlement-snapshot.service.ts` | trips `end-preview`(저장 안 함) |
| `SettlementSnapshotService.ensureSettlement(tripId)` | 〃 | 종료 응답에 settlementId가 필요할 때(커밋 후 호출) |
| `convertToKrw(input)` | `../fx/convert.ts` | 결제 한 건 환산(KRW·SPOT·CARD_BILLED·FIXED). 순수 |
| `FxRatesService.convertForTrip(tripPolicy, expense, tx?)` | `../fx/fx-rates.service.ts` | 인입(S2B): 직전 고시를 찾아 환산. 고시가 없으면 503 |
| `FxRecalcService.recalculateTrip(tx, trip, actor)` | `../fx/fx-recalc.service.ts` | Trip 행을 잠근 트랜잭션에서 여정 전체 재환산 |
| `fxRateLabel`·`displayRate` | `../fx/convert.ts` | "100엔 = 919.20원" |

## 계산 규칙

- 금액은 모두 정수(원). 외화 → 원화는 10원 단위 half-up(`toKrw`와 같은 bigint 계산), KRW 결제는 그대로.
- **환율 저장 단위 = 원통화 1단위당 원(KRW per 1 unit, Decimal(18,6))**: `ExchangeRate.rate`, `Expense.fxRate`, `convertToKrw`의 `spot.rate`·`ConvertResult.rate` 모두 JPY `9.192000`처럼 1엔당 원이다. `fxRateUnit`에는 고시 단위(JPY 100)를 넣는다. 고시 단위 표기(100엔 = 919.20원)는 `GET /api/fx`·`…/fx-policy` 응답(`displayRate`·`label`)과 화면에서만 만든다(`displayRate(rate, unit)`).
- 예외는 그룹장 입력값 하나: `Trip.fxFixedRate`는 고시 단위당 원(919.20, 스키마 주석). 환산할 때 `ratePerUnit(fixed, unit)`로 1단위당으로 바꿔 `Expense.fxRate`에 넣는다.
- SPOT: `effectiveAt ≤ occurredAt`인 가장 최근 고시. 고시를 모으기 전 결제는 가장 이른 고시.
- CARD_BILLED: 청구 확정 원화 → 제공자 원화 → 매매기준율(임시, `provisional`).
- FIXED: 금액 × 고정 환율 ÷ 고시 단위. 고정 환율은 고시 단위당 원, 소수 둘째 자리까지.
- 재계산은 원화가 바뀐 결제만 쓰고 version을 올린다. 부모 순액 = max(0, 부모 + Σ자식), SHARED는 같은 부담 인원으로 `splitEvenly` 재분할, 이력 `FX_RECALCULATED`, `changedAfterShared`는 그대로.
- 예산 상태는 정수 비교(`spent × 10 < budget × 8` → NORMAL, `spent ≤ budget` → CAUTION, 그 위 OVER). `budgetRatio`는 표시용 소수 넷째 자리.
- N빵 1인 = round_half_up(total / N). 송금 권장안은 명세 4-4 그리디(재정렬 없음, 최대 N−1건).

## 통합 예정(S2B-2)

- 기간 외 결제 등 인입 환산은 임시 `krw.ts` 대신 `FxRatesService.convertForTrip`(DB 고시 조회 포함) 또는 순수 함수 `convertToKrw`로 바꾼다.
- 멤버별 내역·개인 건수는 지금 Prisma로 직접 읽는다(`settlements.service.ts`, `ledger.ts`의 `countPersonalByMember`). expenses 모듈의 `ExpenseQueryService.paymentsByPayer`·`ExpenseStatsService.personalCountsByPayer`가 들어오면 그쪽으로 바꾼다.

## 가시성

- 현황: 남의 PERSONAL·PENDING은 금액도 건수도 읽지 않는다.
- 멤버별 내역: 남의 개인 결제는 `personalCount`만, `personalPayments`는 본인일 때만 목록, 남이면 `null`.
- 나간 멤버는 MembershipGuard가 404로 막는다(Q-09). 정산 행·멤버별 내역에는 남는다.

## 내부 잡

- `@Public()` + `InternalJobGuard`(`../fx/internal-job.guard.ts`): 헤더 `x-internal-job-secret` = env `INTERNAL_JOB_SECRET`(32자 이상). 없으면 모두 403.
- 전역 `CsrfGuard`가 먼저 돌아 POST에 `Origin`(허용 목록) 또는 `Sec-Fetch-Site: same-origin`이 필요하다. 운영 Scheduler가 헤더를 붙이거나 common에서 `/api/internal/*`를 제외해야 한다(OIDC 도입 때 함께 정리).
- 환율 소스: env `FX_RATE_SOURCE` = `demo`(기본, 고정 샘플 값, 출처 "데모 매매기준율") | `koreaexim`(한국수출입은행 OpenAPI, 뼈대만 — 잡이 503). `KOREAEXIM_API_KEY`는 Secret Manager.
- 환율 잡은 같은 (통화, 출처, 고시 시각)을 한 번만 저장하고, 진행 중 외화 여정(SPOT·CARD_BILLED)을 다시 환산한다.

## 테스트

- 단위: `compute.spec.ts`, `summary-math.spec.ts`, `views.spec.ts`, `../fx/convert.spec.ts`, `../fx/fx-sources.spec.ts`.
- e2e: `test/settlements.e2e-spec.ts`, `test/fx.e2e-spec.ts`. 실제 DB 부분은 `apps/api/.env`의 DB에 붙고, DB가 없으면(CI) 건너뛴다. 공유 로컬 DB라 무작위 ID로 만들고 만든 행만 지운다.

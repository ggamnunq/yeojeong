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
| `effectiveFxPolicy(tripPolicy, tripCurrency, currency)` | `../fx/convert.ts` | 결제 한 건에 실제로 적용할 기준(C-32: 여정 통화·KRW는 여정 정책, 그 밖의 외화는 `SPOT_AT_PAYMENT`). 순수 |
| `FxRatesService.convertForTrip(tripPolicy, expense, tx?)` | `../fx/fx-rates.service.ts` | 인입(S2B)·직접 입력·지갑 자동 연결: 직전 고시를 찾아 환산. `tripPolicy.currency`(여정 통화) 필수. 고시가 없으면 503 |
| `FxRecalcService.recalculateTrip(tx, trip, actor)` | `../fx/fx-recalc.service.ts` | Trip 행을 잠근 트랜잭션에서 여정 전체 재환산 |
| `fxRateLabel`·`displayRate` | `../fx/convert.ts` | "100엔 = 919.20원" |

## 계산 규칙

- 금액은 모두 정수(원). 외화 → 원화는 10원 단위 half-up(`toKrw`와 같은 bigint 계산), KRW 결제는 그대로.
- **환율 저장 단위 = 원통화 1단위당 원(KRW per 1 unit, Decimal(18,6))**: `ExchangeRate.rate`, `Expense.fxRate`, `convertToKrw`의 `spot.rate`·`ConvertResult.rate` 모두 JPY `9.192000`처럼 1엔당 원이다. `fxRateUnit`에는 고시 단위(JPY 100)를 넣는다. 고시 단위 표기(100엔 = 919.20원)는 `GET /api/fx`·`…/fx-policy` 응답(`displayRate`·`label`)과 화면에서만 만든다(`displayRate(rate, unit)`).
- 예외는 그룹장 입력값 하나: `Trip.fxFixedRate`는 고시 단위당 원(919.20, 스키마 주석). 환산할 때 `ratePerUnit(fixed, unit)`로 1단위당으로 바꿔 `Expense.fxRate`에 넣는다.
- SPOT: `effectiveAt ≤ occurredAt`인 가장 최근 고시. 고시를 모으기 전 결제는 가장 이른 고시.
- CARD_BILLED: 청구 확정 원화 → 제공자 원화 → 매매기준율(임시, `provisional`).
- FIXED: 금액 × 고정 환율 ÷ 고시 단위. 고정 환율은 고시 단위당 원, 소수 둘째 자리까지.
- **여정 통화 외 외화(C-32, S7c)**: 위 세 정책은 KRW·여정 통화 결제에만 쓴다. 여정 통화도 KRW도 아닌 외화(일본 여정의 USD 결제 등)는 여정 정책(고정 환율·카드사 원화)과 무관하게 결제 시점 시장 환율(SPOT: 수출입은행 우선, 고시하지 않는 통화는 보조 소스 ExchangeRate-API)로 환산한다(`effectiveFxPolicy`). 스냅샷은 `fxPolicyApplied = SPOT_AT_PAYMENT`, `fxRate` = 고시 1단위당 원, `fxRateUnit` = 그 통화 고시 단위, `fxRateSource` = 고시 출처명(`ExchangeRate.source`), `fxRateAt` = 고시 시각. 고정 환율 여정이라도 그 결제의 `fxPolicyApplied`가 `SPOT_AT_PAYMENT`이면 시장 환율로 계산한 것이다. 고시가 하나도 없으면 기존대로 `FX_RATE_UNAVAILABLE`(인입은 다음 동기화로 미룸). 적용 경로: 계좌·카드 인입(AUTO), 지갑 → 여정 자동 연결, 기간 외 추가(`expenses/krw.ts`), 환율 기준 변경 재계산(`FxRecalcService`, 정책 변경 때 예전에 여정 정책으로 저장된 제3통화 결제도 시장 환율로 고친다). 여정에서 직접 추가하는 화면은 KRW·여정 통화만 고르게 한다(서버는 지원 통화면 받고 같은 규칙으로 환산).
- 재계산은 원화가 바뀐 결제만 쓰고 version을 올린다. 부모 순액 = max(0, 부모 + Σ자식), SHARED는 같은 부담 인원으로 `splitEvenly` 재분할, 이력 `FX_RECALCULATED`, `changedAfterShared`는 그대로.
- 예산 상태는 정수 비교(`spent × 10 < budget × 8` → NORMAL, `spent ≤ budget` → CAUTION, 그 위 OVER). `budgetRatio`는 표시용 소수 넷째 자리.
- N빵 1인 = round_half_up(total / N). 송금 권장안은 명세 4-4 그리디(재정렬 없음, 최대 N−1건).

## 통합 예정(S2B-2)

- 기간 외 결제 등 인입 환산은 임시 `krw.ts` 대신 `FxRatesService.convertForTrip`(DB 고시 조회 포함) 또는 순수 함수 `convertToKrw`로 바꾼다.
- 멤버별 내역·개인 건수는 expenses 모듈의 `ExpenseQueryService.paymentsByPayer`와 `ExpenseStatsService.personalCountsByPayer`를 사용한다.

## 가시성

- 현황: 남의 PERSONAL·PENDING은 금액도 건수도 읽지 않는다.
- 멤버별 내역: 남의 개인 결제는 `personalCount`만, `personalPayments`는 본인일 때만 목록, 남이면 `null`.
- 나간 멤버는 MembershipGuard가 404로 막는다(Q-09). 정산 행·멤버별 내역에는 남는다.

## 내부 잡

- `@InternalJob()` 공통 가드: 운영은 Cloud Scheduler OIDC, 로컬·테스트는 `x-internal-job-secret` 대체 인증을 쓴다.
- `@InternalJob()` 라우트는 전역 CSRF·Cloudflare origin lock 대신 내부 잡 인증으로 방어한다.
- 환율 소스: env `FX_RATE_SOURCE` = `demo`(고정 샘플 값, 출처 "데모 매매기준율") | `koreaexim`(한국수출입은행 현재환율 OpenAPI만, 출처 "한국수출입은행 매매기준율") | `erapi`(ExchangeRate-API만) | `koreaexim+erapi`(한국수출입은행 + 빠진 통화만 ExchangeRate-API). 비우면 `EXIM_API_KEY`가 있을 때 `koreaexim+erapi`(운영 기본), 없으면 `demo`(개발·테스트). `koreaexim`·`koreaexim+erapi`인데 키가 없거나 모르는 값이면 서버가 뜨지 않는다. `EXIM_API_KEY`는 Secret Manager이고 로그·오류 메시지에 남기지 않는다.
- 출처는 고시마다 저장한다(`ExchangeRate.source`). 합친 소스는 통화별 실제 출처를 붙이고, 조회 응답 `source`가 그대로 화면 "{source} · HH:mm 갱신"이 된다.
- 한국수출입은행(`src/fx/korea-exim-fx-rate-source.ts`):
  - KST 오늘 날짜(`searchdate`)로 부르고, 빈 배열(주말·공휴일·11시 고시 전)이면 하루씩 최대 7일 거슬러 첫 고시를 쓴다. 8일 모두 비면 아무것도 저장하지 않는다(직전 고시 유지).
  - `cur_unit` "JPY(100)"의 괄호 값이 고시 단위, `deal_bas_r`(쉼표 포함)을 단위로 나눠 1단위당 원(소수 6자리, half-up)으로 저장한다. 고시 시각은 고시일 11:00 KST로 둔다.
  - 역외 위안 `CNH`를 `CNY`로 쓴다. 대만 달러(TWD)·베트남 동(VND)·필리핀 페소(PHP)는 고시하지 않는다(→ 보조 소스).
  - 요청당 5초, 네트워크 오류·5xx·JSON 아님은 2번까지 다시 부른다(전체 20초 안, 스케줄러 제한 30초). 결과 코드 2(DATA 코드)·3(인증키)·4(일일 한도)는 바로 실패해 잡이 503을 돌려주고 저장된 고시는 그대로 둔다.
- 보조 소스 ExchangeRate-API(`src/fx/exchange-rate-api-fx-rate-source.ts`, 키 없음):
  - `GET https://open.er-api.com/v6/latest/USD` 한 번으로 전 통화를 받는다. 1단위당 원 = (KRW/USD) ÷ (통화/USD)를 bigint로 계산해 소수 6자리 half-up, 고시 단위는 `currencies.ts`(VND·IDR·JPY = 100). 고시 시각은 응답 `time_last_update_unix`(하루 1회, UTC 00시 무렵).
  - 약관(https://www.exchangerate-api.com/docs/free): 환율을 쓰는 화면에 "Rates By Exchange Rate API" 링크 표기 필수, 재배포 금지. 그래서 출처명을 그 문구로 저장하고 조회 응답 `sourceUrl`(https://www.exchangerate-api.com)을 내려 환율 화면(HF-29)이 출처를 링크로 단다. 한 시간에 한 번 넘게 부르면 429(20분 제한)라 수집 잡(하루 두 번)으로 충분하다.
  - 요청당 5초, 네트워크 오류·5xx·JSON 아님은 한 번만 다시 부른다(전체 8초). 429·`result: "error"`·형식 오류는 바로 실패.
- 합친 소스(`src/fx/composite-fx-rate-source.ts`): 한국수출입은행과 ExchangeRate-API를 동시에 부르고, 통화별로 한국수출입은행 값이 있으면 그것을, 없을 때만 ExchangeRate-API 값을 쓴다(지금은 TWD·VND·PHP, 그날 한국수출입은행이 빠뜨린 통화도). 한국수출입은행 실패는 기존처럼 잡 503(저장된 고시 유지), ExchangeRate-API 실패는 경고만 남기고 한국수출입은행 값만 저장한다(빠진 통화는 직전 고시 유지).
- 이상값 방어(`FxJobService`): 통화마다 새 고시 시각 이전의 가장 최근 저장 고시(출처 무관)와 비교해 20% 넘게 다르면 저장하지 않고 경고 로그를 남긴다(잡 결과 `rejected`). 직전 고시가 없거나 14일 넘게 오래됐으면 비교하지 않는다(실제로 크게 움직인 통화가 영영 막히지 않게).
- 환율 잡은 같은 (통화, 출처, 고시 시각)을 한 번만 저장하고, 진행 중 외화 여정(SPOT·CARD_BILLED)을 다시 환산한다.

## 테스트

- 단위: `compute.spec.ts`, `summary-math.spec.ts`, `views.spec.ts`, `../fx/convert.spec.ts`, `../fx/fx-sources.spec.ts`, `../fx/korea-exim-fx-rate-source.spec.ts`, `../fx/exchange-rate-api-fx-rate-source.spec.ts`, `../fx/composite-fx-rate-source.spec.ts`(지원 통화 커버리지 포함), `../fx/fx-job.service.spec.ts`(이상값 방어).
- e2e: `test/settlements.e2e-spec.ts`, `test/fx.e2e-spec.ts`. 실제 DB 부분은 `apps/api/.env`의 DB에 붙고, DB가 없으면(CI) 건너뛴다. 공유 로컬 DB라 무작위 ID로 만들고 만든 행만 지운다.

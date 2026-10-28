# 결제수단·거래 인입 (`payment-methods`, `transactions`)

토스 연결(지갑)과 거래 동기화·인입. 기능명세 3-3, 4-1, 4-2, 5-4(FR-401~408), 5-8(FR-801~804·809), 6-3 "지갑", 7-2, 8-1~8-4.

| 폴더                             | 모듈                                          | 하는 일                                                                               |
| -------------------------------- | --------------------------------------------- | ------------------------------------------------------------------------------------- |
| `src/payment-methods/`           | `PaymentMethodsModule`(app.module에 이 한 줄) | 연결 시도·콜백·후보·확정, 결제수단 목록·해제, 수동 동기화                             |
| `src/payment-methods/providers/` | `PaymentProvidersModule`                      | 제공자 어댑터(env로 선택), 토큰 암호화, 금융 접근 로그                                |
| `src/transactions/`              | `TransactionsModule`                          | 동기화(SyncRun)·인입·환불 매칭·중복 제거, 여정 전 거래 보관, S2A 이벤트 구독, 내부 잡 |

## 엔드포인트

| 메서드 | 경로                                                       | 권한                                     | 응답 · 에러                                                                                                                                                                                                                                                   |
| ------ | ---------------------------------------------------------- | ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/api/payment-methods`                                     | 로그인                                   | `PaymentMethodsResponse`(REMOVED 제외, 마스킹 값만)                                                                                                                                                                                                           |
| POST   | `/api/payment-methods/sync`                                | 로그인                                   | 202 `{ syncRunIds, startedAt, skipped: null }` · 진행 중 여정이 없으면 **200** `skipped: 'NO_ACTIVE_TRIP'`(제공자를 부르지 않고 동기화 시각도 그대로 — 아무 작업도 시작하지 않았으니 202가 아니다) · 429 `SYNC_RATE_LIMITED`(60초) · 409 `CONNECTION_EXPIRED` |
| DELETE | `/api/payment-methods/:paymentMethodId?purgeImported=true` | 본인                                     | 204 · 404 · 400(마지막이 아닌데 purge)                                                                                                                                                                                                                        |
| POST   | `/api/payment-connections`                                 | 로그인 + 연동 동의 3건, Strict           | 201 `{ attemptId, authUrl, expiresAt }` · 403 `CONSENT_REQUIRED` · 503 `PROVIDER_UNAVAILABLE`                                                                                                                                                                 |
| GET    | `/api/payment-connections/callback/toss`                   | 공개(state 해시로 시도 식별)             | 302 `/wallet/connect/select?attempt=…` 또는 `/wallet/connect/toss?attempt=…&error=invalid\|expired\|cancelled\|provider`                                                                                                                                      |
| GET    | `/api/payment-connections/attempts/:attemptId`             | 본인                                     | `{ attemptId, status, purpose, expiresAt }` · 410 `ATTEMPT_EXPIRED`                                                                                                                                                                                           |
| GET    | `/api/payment-connections/attempts/:attemptId/candidates`  | 본인                                     | `ConnectionCandidate[]` · 410                                                                                                                                                                                                                                 |
| POST   | `/api/payment-connections/attempts/:attemptId/confirm`     | 본인 + 연동 동의                         | 201 `{ accounts, cards }` · 400 · 410                                                                                                                                                                                                                         |
| POST   | `/api/internal/jobs/sync`                                  | `@Public` + 헤더 `x-internal-job-secret` | 200 `SyncJobResult` · 403                                                                                                                                                                                                                                     |

타입은 `@yeojeong/shared`의 `api/payment-methods.ts`. 내부 잡은 전역 CsrfGuard 뒤에 있어서 호출 측(Cloud Scheduler)이 `Origin: <WEB_BASE_URL>`을 붙여야 한다(공통 쪽에서 나중에 정리).

## env

| 이름                        | 기본                       | 설명                                                                                      |
| --------------------------- | -------------------------- | ----------------------------------------------------------------------------------------- |
| `PAYMENT_PROVIDER`          | 운영 `toss`, 그 밖 `demo`  | `demo` = DemoTossAdapter, `toss` = TossPaymentAdapter(미구현, 503)                        |
| `TOKEN_ENCRYPTION_KEY`      | 로컬·테스트는 고정 개발 키 | 32바이트(base64 44자 또는 hex 64자). 운영에서 없으면 부팅은 되지만 연결·동기화가 실패한다 |
| `INTERNAL_JOB_SECRET`       | 없음(항상 403)             | 내부 잡 공유 비밀                                                                         |
| `DEMO_ANCHOR_DATE`          | `2026-11-12`               | 데모 샘플 기준일(사용자에게 여정이 없을 때만)                                             |
| `PAYMENT_CALLBACK_BASE_URL` | `WEB_BASE_URL`             | 콜백 주소의 origin. 로컬에서 Vite 프록시 없이 API에 직접 붙일 때 `http://localhost:3000`  |

## 제공자 어댑터 (`providers/payment-provider.adapter.ts`)

`PaymentProviderAdapter`(abstract class = DI 토큰): `buildAuthorizeUrl({state, redirectUri, hint})` → `exchangeCode({code, redirectUri})` → `refreshTokens(tokens)` → `listPaymentMethods(tokens)` → `listTransactions(tokens, {methodRef, from, to, cursor})` → `revoke(tokens)`. 오류는 `ProviderError(code)`: `AUTH_EXPIRED`·`CONSENT_REVOKED`(갱신 1회 후 연결 EXPIRED), `RATE_LIMITED`·`UNAVAILABLE`(SyncRun FAILED, 다음 주기), `INVALID_REQUEST`(그 결제수단만 건너뜀), `AUTH_FAILED`(콜백 실패).

마스킹 규칙(명세 v0.5.1): 카드는 끝 4자리만(`**** **** **** 1934`, 앞자리는 저장·응답 모두 금지, `last4` = 1934, 표시 "토스뱅크 체크카드 1934"), 계좌는 앞 4·끝 3(`3333-**-****821`, `last4` = 821).

어댑터 약속: 번호는 마스킹 값만(`masking.ts`, 서버가 저장 전에 `isSafelyMasked`로 한 번 더 거른다), 실번호 ref는 `TokenCipher.hmacRef`, 적요의 송금 상대방 이름 제거, 입금은 넘기지 않음.

### DEMO (`providers/demo/`)

- 인증은 즉시 성공: `authUrl`이 바로 콜백으로 돌아온다(code에 페르소나).
- 페르소나: 닉네임 준용·민지·태현·수빈이면 그 사람, 아니면 사용자 ID로 고정 배정.
- 거래는 그 사용자의 여정 시작일(진행 중 → 예정 → 최근 종료, `prismaDemoAnchor`)을 D1로 놓고 `demo-dataset.ts`에서 결정적으로 만든다. ref에 기준일이 들어간다.
- 준용: 통장·체크카드(통장에 원화 출금 미러)·신한카드·세이프박스, 기간 내 6건 + 여정 전 4건(아고다·제주항공·KKday·장기주차 D-1 23:50). 민지 4건(오사카성 10:31 포함), 태현 3건 + 주유패스 같은 날 전액 취소, 수빈 2건(오사카성 10:30). 환율 9.192원/엔.

## 동기화·인입 규칙

- **대상**: 활성 멤버인 ONGOING 여정이 있는 사용자의 ACTIVE 연결만(최소 수집). 연결당 하나만 돈다(`pg_try_advisory_xact_lock` + 진행 중 SyncRun, 5분 지나면 STALE).
- **조회 창**(`sync-window.ts`): `[max(lastSyncedAt − 72h, 가장 이른 startAt − 60일), now]`. 새 결제수단이 있으면 가장 이른 startAt − 60일부터. 소급 트리거는 요청 시작까지. 진행 중 여정 기간과 그 전 60일(기간 외 후보) 밖은 가져오지 않는다.
- **자가 복구**: 성공(OK) SyncRun의 `[fromAt, toAt]` 구간들이 각 여정 `[startAt, min(now, autoEndAt)]`을 덮지 못하면 처음 덮이지 않은 시각부터 넓힌다. TRIP_START·JOIN만이 아니라 모든 성공 구간을 쓴다(따라잡은 주기 실행도 덮은 것으로 쳐야 매번 전체를 다시 가져오지 않는다). 스키마 변경 없음.
- **저장**: `Transaction` upsert 키 `(paymentMethodId, externalRef)`. 취소는 음수, 원문은 AES-256-GCM(`rawPayloadEnc`).
- **동일 사용자 중복 제거**: 계좌 출금 ↔ 그 계좌에 연결된 체크카드 승인(같은 원화·±2분) → 계좌 쪽 `sameUserDuplicateOfId`. 계좌 쪽이 이미 확정됐으면 반대로 카드 쪽을 뺀다.
- **취소 매칭**: 원 승인 ref → 같은 결제수단·가맹점 키·통화·잔여 금액(정확히 같은 금액 → 최근 순).
- **장부 반영**(`ImportService.importIntoTrip`, Trip·Membership `FOR SHARE`): ONGOING + 활성 멤버일 때만. 여정 기간 안의 승인 → `Expense(PENDING, AUTO)`(`(tripId, transactionId)` 유니크, `skipDuplicates`). 이번 창이 아니라 여정 기간 전체를 보므로 앞선 실패로 빠진 것도 채운다. 원 결제가 여정에 있는 취소 → 자식 Expense(부모 환율로 계산, 상태·결제자 = 부모), 부모 순액 재계산, 공동이면 같은 부담 인원으로 다시 나눔 + `REFUND_ATTACHED` + 중복 의심 재판정.
- **원화**(`krw.ts`, S2C가 fx를 만들면 교체): KRW 그대로 / FIXED / CARD_BILLED(청구 → 제공자 원화 → SPOT) / SPOT(직전 ExchangeRate, 없으면 제공자 원화). `Expense.fxRate` = 원통화 1단위당 원, `fxRateUnit` = 고시 단위(표시용).
- **가시성**: 인입은 PENDING만 만들고 결제자 외 응답은 하지 않는다. 결제수단·거래 원본은 본인 API에서만, 로그에는 ID만.

## 이벤트 (`transactions/trip-events.listener.ts`)

계약은 S2A `src/trips/events.ts`(`TRIP_EVENTS`, 페이로드 타입)를 그대로 import한다.

| 이벤트              | 처리                                                                        |
| ------------------- | --------------------------------------------------------------------------- |
| `trip.started`      | 전 멤버 소급(TRIP_START, `[startAt, now]`). 백그라운드로 돌고 바로 돌아온다 |
| `membership.joined` | DB에서 여정이 ONGOING이면 그 멤버 소급(JOIN)                                |
| `membership.left`   | 할 일 없음(인입 판정이 `leftAt`을 본다). 순번만 기록                        |
| `trip.auto-ending`  | FINAL 동기화, 끝날 때까지(최대 55초) 기다림                                 |

실패하면 error 로그(`event, listener, tripId, errorCode`) + SyncRun FAILED로 남고, 10분 잡이 위 자가 복구로 따라잡는다. `eventSeq`가 이미 본 것 이하면 버린다(인스턴스 메모리).

## S2B-2(expenses)와의 경계

- **기간 외 결제**: 후보·추가 API(`GET …/out-of-period-candidates`, `POST …/out-of-period-expenses`)는 S2B-2가 **저장된 Transaction**에서 고른다. 그래서 동기화가 진행 중 여정의 시작 60일 전(`OUT_OF_PERIOD_LOOKBACK_DAYS`)부터 가져와 **Transaction으로만 보관**한다(장부 Expense는 사용자가 추가할 때 S2B-2가 만든다). 이 구간도 성공 SyncRun 커버리지로 판정해 한 번 덮이면 다시 가져오지 않는다.
- **중복 의심**: 인입이 공동 결제의 순액을 바꾸면(환불 첨부) `DuplicateFlagger`를 부르고, 기본 구현은 `expenses/duplicates.ts`의 `flagDuplicates`다(`duplicate-flagger.ts`).
- `ImportService.lockTrip(tx, tripId)`: Trip `FOR SHARE` + 환율 정책.

## 테스트

- 단위: `import-rules.spec.ts`(중복 제거·취소 매칭·자식 원화·중복 의심), `krw.spec.ts`, `sync-window.spec.ts`, `masking.spec.ts`, `token-cipher.spec.ts`, `demo-toss.adapter.spec.ts`, `event-seq.spec.ts`
- e2e(DB 없이, CI): `test/payment-methods.e2e-spec.ts` — 동의 403, 로그인, 잡 시크릿·CSRF
- e2e(실DB, `PAYMENT_TEST_DATABASE_URL`이 있을 때만, DB 이름은 `_test`로 끝나야 함 · S2A의 `TEST_DATABASE_URL`은 시작 때 TRUNCATE하므로 다른 DB): `test/payment-flow.e2e-spec.ts` — 연결 → 선택 → 목록 → PENDING → 수동 동기화 → 해제 → purge, 환불, SH-2 자가 복구·이벤트 멱등·참여 소급·나간 멤버, 만료 → 재연결 소급, 여정 전 거래 보관, FINAL

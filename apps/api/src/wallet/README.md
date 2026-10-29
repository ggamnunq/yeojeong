# 내 지갑 (`wallet`)

직접 입력한 결제(`Transaction.source = MANUAL`)와 계좌·카드에서 가져온 거래를 한 목록으로 보여 주고, 직접 입력은 여정에 자동 연결한다(S7, 명세 v0.6.0 4-11). 응답 타입은 `@yeojeong/shared`의 `api/wallet.ts`. 여정 장부 쪽 규칙은 `src/expenses/README.md`, 계좌·카드 연결은 `src/payment-methods`.

## 엔드포인트

| 메서드 | 경로                                          | 응답                           | 에러                                                                      |
| ------ | --------------------------------------------- | ------------------------------ | ------------------------------------------------------------------------- |
| GET    | `/api/wallet/entries?cursor=&limit=`          | `WalletEntryListResponse`      | 400                                                                       |
| GET    | `/api/wallet/trip-candidates?at=`             | `WalletTripCandidatesResponse` | 400                                                                       |
| POST   | `/api/wallet/entries`                         | `WalletEntryMutationResponse`  | 400, 503 `FX_RATE_UNAVAILABLE`                                            |
| PATCH  | `/api/wallet/entries/:entryId`                | `WalletEntryMutationResponse`  | 400, 404, 409 `NOT_MANUAL_ENTRY`·`EXPENSE_LOCKED`·`VERSION_CONFLICT`, 503 |
| DELETE | `/api/wallet/entries/:entryId?includeShared=` | 204                            | 404, 409 `NOT_MANUAL_ENTRY`·`SHARED_DELETE_CONFIRM_REQUIRED`              |

모두 로그인 필요, 본인 항목만(`userId` 조건). 남의 항목·없는 항목은 404.

## 지갑 항목의 기준

목록·이번 달 합계·`Me.walletEntryCount`(GET `/api/users/me`, `/api/auth/session`의 `user`)는 같은 기준을 쓴다(`walletEntryWhere`): 내 거래 중 계좌·카드 양쪽에 잡힌 같은 결제의 계좌 쪽(`sameUserDuplicateOfId` 있음)을 뺀 것. 직접 입력을 지우면 행이 없어지므로 개수에서도 빠진다.

## 이번 달 합계 (S7b, Q-51)

`GET /api/wallet/entries` 응답의 `monthTotalKrw`·`monthTotalEstimated` (`wallet-summary.service.ts`).

- **기간**: 요청 시각이 속한 KST 달력 월, `occurredAt ∈ [1일 00:00 KST, 다음 달 1일 00:00 KST)`.
- **항목 원화**: 목록의 `krwAmount`와 같은 규칙 — 보여 줄 연결(활성 멤버로 남은 여정 먼저, 그중 공동 먼저)의 `Expense.krwAmount` → KRW면 금액(1원 반올림) → `billedKrwAmount` → `providerKrwAmount` → `spotKrwAmount`. 취소(`kind = CANCEL`)는 금액이 음수라 그대로 더하면 상계된다.
- **원화가 없는 항목**(연결 없음 + 외화 + 위 원화가 모두 없음): 결제 시점 매매기준율(4-5 SPOT, `FxRatesService.loadSpotTable` — 직전 고시, 없으면 가장 이른 고시)로 환산해 더한다(10원 반올림). 그 통화의 고시가 하나도 없으면 합계에서 뺀다.
- **`monthTotalEstimated = true`**: 이번 달 항목 중 하나라도 `spotKrwAmount`(연결 없는 외화의 매매기준율 추정)를 썼거나, 위처럼 환산했거나 뺐을 때. KRW·여정 결제 원화·카드사·제공자 원화만이면 `false`(이때 합계 = 이번 달 항목 `krwAmount`의 합).
- **계산**: SQL 한 번으로 합계와 원화 없는 항목만 읽는다(항목 전체를 메모리로 가져오지 않는다). 거래 → 연결 결제는 `DISTINCT ON (transaction_id)`로 하나만 고른다.
- **페이지**: 커서와 무관하게 전체 기준이고, 모든 페이지(커서 요청 포함)에 같은 값을 넣는다 — 요청마다 다시 계산한다. 목록 응답의 요약 필드는 생략하지 않는다는 기존 관례(결제 목록의 `pendingCount`)를 따랐다. 화면은 첫 페이지 값을 쓰면 된다.
- 목록의 `krwAmount` 규칙(`WalletService.krwOf`)을 바꾸면 이 SQL도 같이 바꾼다.

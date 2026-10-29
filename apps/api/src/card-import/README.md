# 카드 승인내역 불러오기 (`src/card-import`, S8)

카드사 아이디·비밀번호로 개인 카드 승인내역을 CODEF에서 **한 번** 조회해 응답으로만 돌려주고, 사용자가 고른 건만 지갑에 저장한다(`POST /api/wallet/entries/import`, `src/wallet`).
원칙: **우리 서버에는 개인정보를 남기지 않는다.** 토스 연동(`src/payment-methods`·`transactions`)과는 별개 모듈이다.

## 흐름

```
화면                                  서버(card-import)                         CODEF
GET  /api/card-import/config   ──▶  공개키·지문·카드사·기간·동의·남은 횟수
(비밀번호를 공개키로 RSA PKCS#1 v1.5 암호화 — 브라우저)
POST /api/consents (CARD_IMPORT, 최초 1회)
POST /api/card-import/fetch    ──▶  잠금(동시 1건) → 한도 → 예산 ─────────▶  approval-list(아이디 + 암호문)
                               ◀──  OK: 결과(무저장) + 항목별 itemToken  ◀──  CF-00000
                               ◀──  TWO_WAY_REQUIRED: twoWayToken(암호화) ◀──  CF-03002(문자 인증)
POST /api/card-import/fetch(+twoWay {token, code}) ─▶ 같은 본문 + is2Way·twoWayInfo·smsAuthNo ─▶
POST /api/wallet/entries/import ─▶  itemToken 검증 → CARD_IMPORT 지갑 항목 + 여정 자동 연결(S7 규칙)
```

- **direct(기본, `CODEF_LOGIN_MODE=direct`)**: 승인내역 요청에 아이디·암호문을 바로 넣는다(KR_CD_P_002 입력부: connectedId는 "로그인 파라미터를 생략할 때만 필수"). CODEF에 계정(connectedId)을 만들지 않으므로 지울 것도, 추가 인증 중 이탈해도 남는 것도 없다.
- **account(대안)**: 운영에서는 `CODEF_ALLOW_ACCOUNT_MODE=true`가 없으면 켜지지 않는다(부팅 때 error 로그 + direct로 동작). 계정 등록 → 조회 → `finally` 계정 삭제. 삭제는 요청 안에서 지수 백오프로 최대 3회, 그래도 실패하면 connectedId만 암호화해 `codef_pending_deletions`에 넣고 내부 잡(`POST /api/internal/jobs/codef-cleanup`, 10분)이 성공할 때까지 다시 지운다. 추가 인증이 필요하면 계정을 지우고 `CARD_TWO_WAY_UNSUPPORTED`(이어가기 상태에 connectedId를 담지 않는다). direct가 운영에서 막힐 때만 켠다.

  - **알려진 위험**: 계정 등록 요청이 타임아웃(10초)으로 끝나면 CODEF 쪽에서는 계정이 만들어졌는데 응답(connectedId)을 받지 못했을 수 있다. 이 경우 서버는 지울 connectedId를 모르므로 삭제 대기에도 넣지 못한다 — CODEF 콘솔(connectedId 목록)에서 운영자가 정리해야 한다. direct 모드에는 이 위험이 없다.
  - 삭제 대기 행은 30일 보관 상한(파기 배치 `CODEF_PENDING_DELETIONS`, 넘으면 버리고 error 로그), 남은 행이 있으면 매일 error 로그로 알린다.

## 저장하지 않는 것

| 값 | 어디에도 안 남는다 | 근거 |
|---|---|---|
| 카드사 아이디(`loginId`) | DB·로그·접근 기록·응답·에러 | 요청 지역 변수로 CODEF에만 전달. 로거 redaction(`common/logging/logger.ts` `SENSITIVE_BODY_KEYS`), 검증 에러는 값을 되돌리지 않는다(`validationError.value=false`), e2e로 확인 |
| 비밀번호 | 서버는 원문을 받지 않는다. 암호문도 저장·로그 안 함 | 브라우저 암호화(`apps/web/src/features/card-import/crypto.ts`) |
| 카드번호 전체·카드 비밀번호(현대·하나) | 1차는 받지 않는다(`CARD_NUMBER_LOGIN_ENABLED = false` — 두 카드사를 config에서 빼고 fetch는 400). 켜면 비밀번호와 같은 규칙 | `codef/codef.constants.ts` |
| 조회 결과(가맹점·금액·승인번호·승인 일시) | DB·로그 | 응답으로만. 로그는 건수·결과 코드만 |
| 승인번호 원문·카드번호·가맹점 주소·사업자번호 | 응답에도 없다 | `approval-normalizer.ts`가 버린다. 중복 판정은 `importKey`(HMAC) |
| connectedId | DB·로그 | direct는 만들지 않음. account는 지역 변수. **예외**: 삭제 3회 실패분만 암호화해 삭제 대기 큐(삭제 재시도에만 쓰고 조회에 쓰지 않음, 사용자 ID 없음) |
| 추가 인증 상태·인증번호 | 서버 메모리·DB | 이어갈 상태는 암호화 토큰(`two-way-token.ts`)으로 화면이 들고 있다 |
| 카드사·부분 취소액(C-27) | 지갑 항목 | 저장은 승인 일시·순액·통화·가맹점명·카드사 원화(`providerKrwAmount`)·importKey(`externalRef`)만 |

남는 것: 사용자가 고른 지갑 항목(`transactions.source = CARD_IMPORT`), 동의 이력(`CARD_IMPORT`), 접근 기록(`FETCH_CARD_APPROVALS`·`IMPORT_CARD_APPROVALS` — 기관 코드·건수·결과 코드·단계만, 1년), 호출 보호 카운터(사용자·기관·날짜·개수만, 7일).

## API 계약

| 메서드·경로 | 요청 | 응답 | 에러 |
|---|---|---|---|
| `GET /api/card-import/config` | — | `CardImportConfig { enabled, publicKey, publicKeyFingerprint, organizations[{code,name,maxRangeDays,maxLookbackDays,requiresCardNo}](7곳 — 현대·하나 제외), maxRangeDays: 92, maxLookbackDays: 365, defaultRange{from,to,basis,tripId}, consent, twoWayTimeoutSeconds: 160, remainingToday }` | 404(꺼짐) |
| `POST /api/card-import/fetch` | `{ organization, loginId, encryptedPassword, from, to, loginCardNo?, encryptedCardPassword?, twoWay?: {token, code} }` | 200 `{status:'OK', organization, from, to, items: CardApprovalItem[]}` · 200 `{status:'TWO_WAY_REQUIRED', twoWayToken, method:'SMS', expiresAt}` | 400 `VALIDATION_FAILED`·`CARD_LOGIN_FAILED{failedAttempts}`·`CARD_TWO_WAY_INVALID`·`CARD_PASSWORD_ENCRYPTION_INVALID`, 403 `CONSENT_REQUIRED`·`CSRF_REJECTED`, 404, 409 `CARD_IMPORT_IN_PROGRESS`·`CARD_ACCOUNT_ACTION_REQUIRED`·`CARD_TWO_WAY_UNSUPPORTED`, 410 `CARD_TWO_WAY_EXPIRED`, 429 `CARD_IMPORT_RATE_LIMITED`·`CARD_IMPORT_LOGIN_COOLDOWN`(`details{retryAfter(ISO UTC), retryAfterSec}` + `Retry-After`), 502 `CARD_IMPORT_FAILED`, 503 `CARD_COMPANY_UNAVAILABLE`·`CARD_IMPORT_DAILY_LIMIT` |
| `POST /api/wallet/entries/import` | `{ items: [{importKey, itemToken, occurredAt, amount, currency, merchantName, krwAmount, tripId?}] }`(1~200) | 201 `{ items[{importKey, created, entry: WalletEntry}], created, skipped, linked }` | 400 `VALIDATION_FAILED`, 403, 404, 410 `CARD_IMPORT_RESULT_EXPIRED{invalidIndexes}`, 503 `FX_RATE_UNAVAILABLE` |
| `GET /api/consents/status?stage=CARD_IMPORT` · `POST /api/consents {stage:'CARD_IMPORT', screen:'HF-51'}` | 기존 동의 API | `ConsentStatusResponse` | 동의 ID별 게이트: FIN_* = accountLink, CARD_IMPORT = 이 사용자의 cardImport(꺼지면 404) |
| `GET /api/consents/revocable` | — | `RevocableConsent[] {consentId, title, version, agreedAt, docUrl}` | 플래그와 무관 |
| `POST /api/consents/:consentId/withdraw` | — | 204(멱등, `withdrawChannel = HF-58`, 지갑 항목 유지) | 404(철회 불가 항목) |

`CardApprovalItem`: `importKey, approvedAt, amount(취소 줄은 음수), currency, krwAmount, estimatedKrwAmount, merchantName(40자), overseas, organization, organizationName, cardLast4, cardName, status(NEW|ALREADY_IMPORTED|SIMILAR|CANCELLED|PARTIAL_CANCEL), cancelState(NONE|PARTIAL|CANCELLED|ORPHAN_CANCEL), partialCancelAmount, alreadyImported, similarManualEntryId, inTripId, selectable, defaultSelected, blockReason, itemToken`.

- `importKey` = HMAC-SHA256(**전용 키 `IMPORT_KEY_HMAC_KEY`**, "card-import:v1|사용자|기관|승인번호|승인일시|원 승인금액|통화") hex(`import-key.ts`). 교체 금지("추가됨" 판정이 끊긴다), 다른 키를 교체해도 영향 없음. 중복 저장은 `transactions_card_import_ref_key`(부분 유니크 user_id·external_ref WHERE source = CARD_IMPORT).
- `itemToken` = `"<만료 epoch 초>.<HMAC-SHA256>"`, 재료 = 사용자 + importKey + 승인 일시 + 금액 + 통화 + 가맹점명 + 카드사 원화 + 만료(30분). 저장은 서명이 맞는 항목만(위변조·임의 항목 주입 방지, 서버 무상태).
- 저장한 CARD_IMPORT 항목은 지갑에서 직접 입력과 같은 규칙(수정·삭제·여정 바꾸기)이고 여정 결제는 `origin = MANUAL`(작성자 = 나).

## 추가 인증 토큰

- `twoWayToken`: AES-256-GCM(키 = TOKEN_ENCRYPTION_KEY HKDF `card-import:two-way:v1`), AAD = 사용자 ID. 내용 = 기관·기간·아이디 HMAC·**무작위 nonce**·CODEF twoWayInfo·만료(160초).
- 서버에는 nonce의 SHA-256만 `card_import_two_way_sessions`에 둔다(사용자 ID·시도 수·남은 예약 호출 수·만료). 같은 토큰은 **3번까지**(원자적 UPDATE … WHERE attempts < 3), 결과를 받거나 끝나는 오류면 **바로 지운다**(재사용 410). 인증번호만 틀렸으면(CF-12872) 남은 시도 안에서 다시 보낼 수 있다. 만료된 행은 파기 배치가 지운다.

## 입력 검사

- 암호문(`encryptedPassword`·`encryptedCardPassword`)은 base64를 풀었을 때 **공개키 모듈러스 길이(2048비트 = 256바이트)**와 같을 때만 받는다(평문·다른 키로 만든 값 거절). 공개키가 RSA SPKI가 아니면 부팅을 멈춘다.
- `loginCardNo`·`encryptedCardPassword`는 그 카드사가 요구하고(`requiresCardNo`) `CARD_NUMBER_LOGIN_ENABLED`일 때만 받는다. 아니면 400.
- CODEF 응답 본문은 5MB까지만 읽는다(넘으면 `CARD_IMPORT_FAILED`).

## 로그 마스킹

pino `redact` 경로 목록에 더해 `common/logging/mask.ts`가 **키 이름으로 깊이 제한 없이** 가린다(`formatters.log` + `err` 직렬화기): loginId·password·encrypted*·twoWay*·smsCode·connectedId·loginCardNo·cardPassword·itemToken 등과 어느 깊이의 `body`(`*.body`, `err.body`, `err.cause.request.body`), CODEF 본문 문맥의 `id`(상위 키에 codef·accountList가 있거나 같은 객체에 loginType·organization·password·connectedId가 있을 때). 에러는 원인(cause)까지 펼쳐서 가린다.

## 호출 보호

| 규칙 | 값 | 저장 | 응답 |
|---|---|---|---|
| 사용자당 동시 1건 | 조회 요청 동안(최대 3분) | `card_import_locks`(user_id, expires_at) | 409 `CARD_IMPORT_IN_PROGRESS` |
| 사용자 횟수 | 10분 3회, KST 하루 10회. 새 조회만 센다(추가 인증 이어가기·우리 서버가 거절한 요청은 안 셈, CODEF까지 간 실패는 셈). **잠금 안에서 CODEF 호출 전에** START 기록을 쓰고, 기록 실패면 조회하지 않는다(fail closed). 결과(건수·결과 코드)는 끝난 뒤 같은 행에 채운다(실패하면 결과를 돌려주지 않는다) | 접근 기록 `FETCH_CARD_APPROVALS` `details.step = START` | 429 `CARD_IMPORT_RATE_LIMITED` |
| 로그인 연속 실패 | 같은 사용자·기관 30분 안 3회째 실패 응답부터 30분 | `card_import_login_failures`(user_id, organization, failures, last_failed_at) | 400 `CARD_LOGIN_FAILED{failedAttempts}` → 429 `CARD_IMPORT_LOGIN_COOLDOWN` |
| 서비스 일일 CODEF 예산 | `CODEF_DAILY_CALL_BUDGET`(기본 100). 새 조회마다 4(조회 1 + 이어가기 3, 또는 등록 1 + 조회 1)를 **원자적으로 예약**(`INSERT … ON CONFLICT DO UPDATE … WHERE calls + 4 <= budget RETURNING`)하고, 끝나면 쓰지 않은 만큼 돌려준다. 이어가기는 예약 범위에서 1씩 쓴다. 계정 삭제는 예약과 무관하게 늘 보내고 따로 센다 | `codef_daily_usage`(day, calls), 이어가기 `card_import_two_way_sessions.calls_left` | 503 `CARD_IMPORT_DAILY_LIMIT` |
| remainingToday | min(10 − 오늘 시작한 조회 수, floor(남은 예산 / 4)) | — | config |
| OAuth 토큰 | 메모리 캐시(1주일 유효, 만료 1시간 전 재발급) | — | — |

카운터는 파기 배치 `CARD_IMPORT_COUNTERS`가 7일 뒤 지운다(만료된 잠금·이어가기 행 포함).

## CODEF 에러 매핑 (`codef/codef.constants.ts`)

| CODEF | 뜻 | 우리 코드 |
|---|---|---|
| CF-12800·12801·12803·12861·12877·12899 | 아이디·비밀번호 오류, 로그인 실패 | `CARD_LOGIN_FAILED`(400) |
| CF-12802·12834·12207·12830·12833·12108 | 비밀번호 오류 횟수 초과·잠김·반복 로그인 제한·1일 횟수 초과·재설정·카드 소지 확인 | `CARD_ACCOUNT_ACTION_REQUIRED`(409) |
| CF-12041·12003·12100·12101·12104·12106·12202 | 이용 시간 아님(점검)·기관 오류·접속 폭주·일시 제한·통신 시간 초과 | `CARD_COMPANY_UNAVAILABLE`(503) |
| CF-12001·03003·12102 | 입력 시간 초과·2-way 정보 불일치·추가 인증 취소 | `CARD_TWO_WAY_EXPIRED`(410) |
| CF-12872 | 인증 미완료 | `CARD_TWO_WAY_INVALID`(400) |
| CF-04020 | 비밀번호 복호화 실패 | `CARD_PASSWORD_ENCRYPTION_INVALID`(400) |
| 그 밖·통신 실패·형식 오류 | | `CARD_IMPORT_FAILED`(502) |

CODEF가 준 메시지는 화면에 넘기지 않는다. 로그는 경로·결과 코드·소요 시간만(`codef.client.ts`).

## env

| 이름 | 기본 | 설명 |
|---|---|---|
| `FEATURE_CARD_IMPORT` | `off` | `off` · `allowlist` · `on`. CODEF 키 세 개가 모두 있어야 켜진다 |
| `CARD_IMPORT_ALLOWED_USER_IDS` | 빈 값 | allowlist 사용자 UUID(쉼표). tfvars로만 |
| `CODEF_ENV` | `sandbox` | `sandbox`(고정 샘플) · `development`(데모) · `production` |
| `CODEF_LOGIN_MODE` | `direct` | `direct` · `account` |
| `CODEF_ALLOW_ACCOUNT_MODE` | — | 운영에서 account 모드를 쓰려면 `true`(없으면 direct로 동작, error 로그) |
| `CODEF_CLIENT_ID` · `CODEF_CLIENT_SECRET` · `CODEF_PUBLIC_KEY` | — | Secret Manager `yeojeong-codef-client-id`·`-client-secret`·`-public-key`(infra `enable_codef`) |
| `CODEF_DAILY_CALL_BUDGET` | `100` | 서비스 전체 일일 CODEF 호출 예산 |
| `IMPORT_KEY_HMAC_KEY` | 로컬·테스트 고정 개발 키 | importKey 전용 HMAC 키(32자 이상). 운영 Secret Manager `yeojeong-import-key-hmac-key`(Terraform `random_password`, prevent_destroy). 운영에서 없으면 기능이 꺼진다. 교체 금지 |
| `TOKEN_ENCRYPTION_KEY` | (기존) | twoWayToken·itemToken·삭제 대기 암호화 키를 HKDF로 용도별 파생 |

## CODEF 확인 사실(출처)

- 호스트: OAuth `https://oauth.codef.io/oauth/token`, sandbox `https://sandbox.codef.io`, development `https://development.codef.io`, production `https://api.codef.io` — easycodef-java `EasyCodefConstant.java`, easycodefpy `properties.py`.
- 요청 본문 URL 인코딩 JSON, 응답은 URL 디코딩 뒤 JSON(샌드박스는 JSON 그대로) — `EasyCodefConnector.java`. 성공 `CF-00000`.
- 경로: `/v1/account/create`·`/v1/account/delete`(EasyCodefConstant), 승인내역 `/v1/kr/card/p/account/approval-list`(KR_CD_P_002).
- 비밀번호: RSA PKCS#1 v1.5, base64 — easycodefpy `util.py`(`PKCS1_v1_5`), codef-node(`RSA_PKCS1_PADDING`, SPKI 공개키).
- 기관 코드·카드사별 기간: KR_CD_P_002 입력부 안내, CODEF "파라미터 상세보기" 시트(`codef/codef.constants.ts` 주석).
- 추가 인증: CF-03002 + `data.method`·`jobIndex`·`threadIndex`·`jti`·`twoWayTimestamp`, 이어가기 = 원래 파라미터 + `is2Way`·`twoWayInfo` + 인증값(add-auth 가이드, easycodef-node `TwoWayProductTest.js`). 이 상품은 문자(`smsAuthNo`)뿐, 2-way 타임아웃 170초. 샌드박스는 추가 인증을 지원하지 않는다.
- 샌드박스: 입력과 무관한 고정 응답(값 마스킹) — 테스트 fixture `test/fixtures/codef-approvals.ts`. 테스트는 실제 네트워크를 쓰지 않는다(`test/fakes/codef-http.ts`).

# 거래 내역 파일 가져오기 (`src/file-import`, W10)

위챗페이 "개인 대조용(用于个人对账)" 거래 내역 파일(xlsx, 예전 CSV)을 **브라우저에서만** 읽고, 사용자가 고른 결제만 지갑에 저장한다(`Transaction.source = FILE_IMPORT`). 파서는 공급자별 모듈(`apps/web/src/features/file-import`)이고 알리페이는 같은 구조로 `FILE_IMPORT_PROVIDER_VALUES`·`providers.ts`에 더한다.
별도 동의는 받지 않는다(직접 입력과 같은 성격 — 처리방침에 수집 항목·방법 반영).

## 흐름

```
화면(브라우저)                                   서버(file-import)
파일 선택 → 파싱·필터(支出 + 가맹점 결제 + 성공)   — 파일·원문 행은 서버로 가지 않는다
txnDigest = SHA-256("{provider}:{交易单号}")
POST /api/wallet/entries/file-import/check ──▶ importKey 계산 → 이미 저장했는지 · 자동 연결될 여정
POST /api/wallet/entries/file-import       ──▶ 검사(S7 규칙) → 지갑 저장 + 여정 자동 연결(WalletService), 이미 있으면 건너뜀
```

## API 계약

| 메서드·경로 | 요청 | 응답 | 에러 |
|---|---|---|---|
| `POST /api/wallet/entries/file-import` | `{ provider: 'WECHAT', items: [{ txnDigest, occurredAt, amount, currency: 'CNY', merchantName }] }`(1~200) | 201 `{ items[{created, entryId}], created, skipped, linked }`(요청 순서) | 400 `VALIDATION_FAILED`, 404(꺼짐), 429 `RATE_LIMITED`, 503 `FX_RATE_UNAVAILABLE` |
| `POST /api/wallet/entries/file-import/check` | `{ provider, items: [{ txnDigest, occurredAt }] }`(1~500) | 200 `{ items[{imported, inTripId}] }`(요청 순서) | 400, 404, 429 |

- 타입: `@yeojeong/shared` `api/file-import.ts`. 계약 밖 필드(상품·결제 수단·가맹점 주문 번호·비고·거래 번호 원문·clientRequestId 등)는 400(전역 ValidationPipe `forbidNonWhitelisted`). 검증 오류는 값을 되돌리지 않는다.
- `txnDigest`: 소문자 hex 64자. `occurredAt`: 오프셋이 있는 ISO 8601만(없으면 400 — 서버 시간대로 읽히지 않게).
- 검사(하나라도 걸리면 아무것도 저장하지 않는다): 시각 범위(미래 불가·365일 이내 — `occurredAtError`), 가맹점 정리 뒤 40자(`memoError`), 금액(양수, 소수 2자리 — `manualAmountError`), 원화 1억 상한(저장 때), 공급자 통화(WECHAT = CNY), 같은 요청 안 중복 `txnDigest`(`items.N.txnDigest` `duplicate`).
- 같은 거래(사용자 + 공급자 + txnDigest)는 한 번만 저장한다: 이미 있으면 `created=false`(skipped). 동시에 같은 건을 저장하면 부분 유니크 `transactions_file_import_ref_key`가 막고 먼저 들어간 항목을 돌려준다. 그래서 다시 보내도 안전하다(요청 단위 clientRequestId는 두지 않는다).
- 여정 연결은 직접 입력과 같다: 결제 시각이 기간 안인 예정·진행 중 여정에 미확정(PENDING)으로. `check`의 `inTripId`가 같은 규칙의 미리 보기다. 저장한 항목은 지갑에서 직접 입력처럼 고치고 지운다.
- 호출 제한: 저장 1분 20회, 확인 1분 30회(IP 기준 `@Throttle`, 넘으면 429 `RATE_LIMITED`). 화면은 200건·500건 넘으면 나눠 보낸다(요청 본문 100kb).

## 저장하는 것 · 하지 않는 것

| 값 | 처리 |
|---|---|
| 결제 시각·금액(부분 환불은 순액)·통화(CNY)·가맹점(交易对方, 40자) | 지갑 항목(`transactions`)에 저장 |
| `importKey` | `externalRef` = HMAC-SHA256(**`IMPORT_KEY_HMAC_KEY`**, `file-import:v1\|{provider}\|{userId}\|{txnDigest}`) hex. 사용자마다 다르다 |
| 거래 번호(交易单号) 원문 | 서버로 오지 않는다(브라우저가 SHA-256 다이제스트만 보낸다) |
| `txnDigest` | DB·로그·응답 어디에도 없다. HMAC 재료로만 쓰고 버린다(로그 마스킹 키 `txnDigest`·`txnNo`·`txnNos`) |
| 商品·支付方式·商户单号·备注·收/支·当前状态·파일 자체 | 서버로 오지 않는다(받으면 400) |
| 접근 기록 | `IMPORT_FILE_ENTRIES` — `details = { provider, requested, created, linked }`(금액·가맹점·거래 번호 없음) |

- `IMPORT_KEY_HMAC_KEY`는 카드 불러오기와 같은 전용 키다. **교체 금지**(바꾸면 "추가됨" 판정이 끊기고 같은 거래를 다시 저장할 수 있다). 재료 형식(`file-import:v1|…`)도 바꾸지 않는다.

## 시각 규칙

- 위챗 파일의 `交易时间`("2026-10-01 12:34:56")은 **중국 표준시(UTC+8, 서머타임 없음)** 로 본다. 화면이 `+08:00`을 붙여 보낸다("2026-10-01T12:34:56+08:00").
- 서버는 그 순간(instant)을 그대로 저장하고, 지갑·여정은 KST로 보여 준다 → 한국 시각은 **1시간 뒤**(13:34:56 KST). 날짜 경계: 중국 23:00~23:59 결제는 KST로 다음 날 00시대다.

## 기능 플래그

| env | 기본 | 설명 |
|---|---|---|
| `FEATURE_FILE_IMPORT` | `off` | `off` · `on`(그 밖이면 부팅 실패). 운영에서는 `IMPORT_KEY_HMAC_KEY`가 없으면 off. 세션 `features.fileImport`. 꺼져 있으면 두 경로 모두 404(`FileImportGuard`) |

Terraform `feature_file_import`(infra/envs/prod, 기본 `"off"`).

## 화면 파서(`apps/web/src/features/file-import/parsers`)

- 읽기: 5MB·데이터 2만 행 상한. zip 머리면 xlsx(첫 시트, `fflate` 압축 해제 + 브라우저 `DOMParser` — 선언 크기 상한, DOCTYPE·ENTITY 거절), xlsx가 아닌 zip·OLE(암호 Excel)는 "압축을 풀고 올려 주세요"(HF-66c), 그 밖은 CSV(UTF-8 BOM · UTF-8 · GB18030 자동 감지). 요약 블록 줄 수는 세지 않고 첫 칸이 `交易时间`인 헤더 행을 찾아 열을 이름으로 고른다. 파서 묶음은 파일을 고를 때 지연 로딩한다.
- 가져오는 것: `收/支 = 支出` + 가맹점 결제 유형(`商户消费`·`扫二维码付款`·`二维码付款`·`付款码支付`) + 성공(`支付成功` 등). 전액 환불(`已全额退款`)은 "환불됨"으로 보이고 고를 수 없다. 부분 환불(`已退款(￥x)`·`部分退款`)은 순액, 환불액을 못 읽으면 원 금액 + "부분 환불".
- 빼는 것: 홍바오·이체·群收款 등 사람 사이 거래(결과 화면 "송금·홍바오 N건은 제외했어요"), 충전·출금·중성(`/`)·그 밖의 수입·실패·모르는 유형·1년 넘은 결제(조용히).
- 읽지 않는 열: `支付方式`·`商户单号`·`备注`. `商品`은 `交易对方`이 비었을 때 가맹점 이름 대신으로만 쓴다. 거래 번호는 파싱하면서 바로 다이제스트로 바꾸고 원문은 화면 메모리에도 남기지 않는다.

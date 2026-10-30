# 관리자 페이지 (`src/admin`, ADMIN)

운영자 한 명이 쓰는 관리자 API. 기능은 세 가지다: **회원 관리**(목록·상세·탈퇴 처리), **CODEF 호출 현황**(읽기 전용), **기능 권한**(회원 × 기능 — 카드 불러오기 · 위챗페이 파일 · 알리페이 파일 — 을 allowlist 단계에서 부여·회수). 화면은 `apps/web/src/features/admin`(`/admin/*`).

공유 타입은 `@yeojeong/shared`의 `api/admin.ts`, 에러 코드는 `ADMIN_ERRORS`(`errors.ts`).

## 켜고 끄기

env `ADMIN_USERNAME` · `ADMIN_PASSWORD_HASH` · `ADMIN_TOTP_SECRET`가 **셋 다** 있을 때만 켜진다. 하나라도 비면 `/api/admin/*` 전체가 **없는 라우트와 똑같은 404**다(`AdminGateMiddleware` — 가드보다 먼저 돌아서 CSRF 403·관리자 헤더로도 경로가 드러나지 않는다). 운영 기본은 꺼짐(Terraform `enable_admin = false`).

값이 있는데 형식이 틀리면 부팅을 멈춘다(값은 메시지에 넣지 않는다).

| env                   | 형식                                          | 운영                                          |
| --------------------- | --------------------------------------------- | --------------------------------------------- |
| `ADMIN_USERNAME`      | 영문·숫자·`._@-` 3~64자                       | Secret Manager `yeojeong-admin-username`      |
| `ADMIN_PASSWORD_HASH` | `scrypt$<N>$<r>$<p>$<salt>$<hash>`(base64url) | Secret Manager `yeojeong-admin-password-hash` |
| `ADMIN_TOTP_SECRET`   | base32(128비트 이상, `admin:totp`는 160비트)  | Secret Manager `yeojeong-admin-totp-secret`   |

### 자격 증명 등록(운영자가 직접, 파일 없이 파이프로)

```bash
# 1. 아이디(처음 한 번)
printf '%s' '<관리자 아이디>' | gcloud secrets create yeojeong-admin-username \
  --replication-policy=user-managed --locations=asia-northeast3 --data-file=-

# 2. 비밀번호 해시(12자 이상). 화면에 보이지 않게 두 번 묻고(안내는 표준에러) 해시만 표준출력 → 그대로 gcloud로
pnpm --silent --filter @yeojeong/api admin:hash | gcloud secrets create yeojeong-admin-password-hash \
  --replication-policy=user-managed --locations=asia-northeast3 --data-file=-

# 3. TOTP 시크릿. 표준출력(시크릿)은 gcloud로, 표준에러에 나오는 otpauth:// URI를 인증 앱(Google Authenticator·1Password 등)에 등록
pnpm --silent --filter @yeojeong/api admin:totp '<관리자 아이디>' | gcloud secrets create yeojeong-admin-totp-secret \
  --replication-policy=user-managed --locations=asia-northeast3 --data-file=-

# 4. terraform.tfvars에 enable_admin = true → terraform apply(Cloud Run env 연결 + 런타임 계정 읽기 권한)
```

- 바꿀 때는 같은 파이프에서 `gcloud secrets create … --replication-policy=… --locations=…` 대신 `gcloud secrets versions add <시크릿> --data-file=-`를 쓰고 Cloud Run을 새 리비전으로 배포한다. 아이디·해시·TOTP 시크릿 중 하나라도 바뀌면 **기존 관리자 세션과 장치 쿠키가 모두 무효**가 된다(자격 증명 지문을 묶는다).
- URI에는 시크릿이 들어 있다. 터미널에서 바로 인증 앱에 옮기고 파일·채팅·스크린샷으로 남기지 않는다(QR이 필요하면 신뢰할 수 있는 로컬 도구로).
- 끄려면 `enable_admin = false`로 apply(시크릿은 남아도 env가 빠져 404).
- 로컬: `.env`에 같은 세 값을 넣는다. 쿠키가 `__Host-`(Secure)라 `http://localhost`를 보안 컨텍스트로 보는 Chrome·Firefox에서 연다.

## API 계약

모두 응답 헤더 `Cache-Control: no-store` · `X-Robots-Tag: noindex, nofollow`(에러 포함). 시각은 ISO 8601 KST.

| 메서드·경로                              | 인증                   | 요청                                                   | 응답                                                                                 | 에러                                                                                                                                                                                                  |
| ---------------------------------------- | ---------------------- | ------------------------------------------------------ | ------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /api/admin/login`                  | 없음(CSRF·origin lock) | `{ username, password, totp(6자리) }`                  | 200 `AdminSessionView { authenticated, expiresAt, idleExpiresAt }` + 세션·장치 쿠키  | 400 `VALIDATION_FAILED`, 401 `ADMIN_LOGIN_FAILED`(일반 문구), 403 `CSRF_REJECTED`, 429 `ADMIN_LOGIN_RATE_LIMITED`(`details{retryAfter, retryAfterSec}` + `Retry-After`), 429 `RATE_LIMITED`(1분 10회) |
| `POST /api/admin/logout`                 | 관리자                 | —                                                      | 204(서버에서 폐기 + 쿠키 삭제)                                                       | 401 `ADMIN_UNAUTHENTICATED`, 403 `CSRF_REJECTED`                                                                                                                                                      |
| `GET /api/admin/session`                 | 관리자                 | —                                                      | 200 `AdminSessionView`                                                               | 401                                                                                                                                                                                                   |
| `GET /api/admin/users`                   | 관리자                 | `?q=&sort=createdAt\|lastLoginAt&cursor=&limit=1~50`   | 200 `AdminUserListResponse { items[], nextCursor }`                                  | 400(커서·정렬 불일치), 401                                                                                                                                                                            |
| `GET /api/admin/users/:userId`           | 관리자                 | —                                                      | 200 `AdminUserDetail`                                                                | 401, 404                                                                                                                                                                                              |
| `POST /api/admin/users/:userId/withdraw` | 관리자                 | `{ reason(2~200자), confirmNickname, password, totp }` | 200 `AdminWithdrawUserResponse { status:'DELETED', accountDeletionId, completedAt }` | 400 `ADMIN_CONFIRM_MISMATCH`·`VALIDATION_FAILED`, 401, 403 `ADMIN_STEP_UP_FAILED`·`CSRF_REJECTED`, 404, 429 `ADMIN_STEP_UP_RATE_LIMITED`                                                              |
| `GET /api/admin/codef-usage`             | 관리자                 | —                                                      | 200 `AdminCodefUsage`                                                                | 401                                                                                                                                                                                                   |
| `GET /api/admin/feature-grants`         | 관리자                 | `?q=`(닉네임 부분 · 사용자 ID 정확, 36자)              | 200 `AdminFeatureGrantList { asOf, features[], cardImportDailyLimit, items[], truncated }` | 400(검색어 길이), 401                                                                                                                                                                             |
| `POST /api/admin/feature-grants`        | 관리자                 | `{ userId(UUID), feature, note?(100자) }`              | 201 `AdminFeatureGrantRow`(그 회원의 줄 전체)                                        | 400 `VALIDATION_FAILED`(모르는 기능 포함), 401, 403 `CSRF_REJECTED`, 404(없는·탈퇴 회원), 409 `ADMIN_FEATURE_GRANT_EXISTS`                                                                            |
| `DELETE /api/admin/feature-grants/:userId/:feature` | 관리자     | —                                                      | 204                                                                                  | 401, 403 `CSRF_REJECTED`, 404(관리자 권한 없음 · UUID·기능 키가 아님), 409 `ADMIN_FEATURE_GRANT_ENV_ONLY`(env에만 있음)                                                                                |

- 회원 목록 항목: 사용자 ID · 닉네임 · 가입일 · 최근 로그인 · 참여 여정 수(나가지 않았고 삭제되지 않은 그룹) · 지갑 항목 수(`walletEntryWhere` — 내 지갑과 같은 기준) · 상태(`ACTIVE` | `DELETION_REQUESTED` = 처리 전 탈퇴 요청이 남음. 요청 코드 FR-108은 L-1에서 없앴다) · 카드 불러오기(`allowlisted` = env allowlist 포함, `granted` = 관리자 페이지 권한 있음, `enabled` = 지금 켜짐).
- 검색: `q`가 UUID 모양이면 ID 정확 일치, 아니면 닉네임 부분 일치(대소문자 무시). 커서는 `(정렬 값, id)` 불투명 문자열이라 정렬이 다르면 400.
- 상세: 위 + 카카오 회원번호 **끝 4자리** · 처리 전 탈퇴 요청 · 동의 이력(종류·버전·동의/철회 일시·철회 경로) · 그룹/여정(이름·단계·기간·역할·나감·삭제) · **건수만**(결제자인 여정 결제, 지갑 항목, 결제수단, 활성 세션). 결제 내용·금액·가맹점은 읽지도 않는다(최소 열람).
- 탈퇴 처리: 서비스 내 탈퇴와 **같은 파이프라인**(`AccountDeletionService.deleteAccount`, 경로 `SUPPORT` — 고객센터 요청 처리와 같다)을 그대로 부른다. 새 파기 로직은 없다. 탈퇴를 막는 기존 규칙(정산 미완료 등)은 파이프라인에 없어서(그룹장 승계·"탈퇴한 멤버"로 기록 유지) 관리자 처리에도 없다. 처리 전 탈퇴 요청이 있으면 함께 완료된다. 순서: 없는 회원 404 → 닉네임 재입력 비교(서버도) → **재인증(step-up: 관리자 비밀번호 + 지금 TOTP, 로그인 때 쓴 코드는 다시 못 쓴다 — 세션당 15분 5번)** → 탈퇴.
- 기능 권한(아래 "기능 권한")은 화면 탭 `/admin/features`(옛 `/admin/card-import`는 여기로 보낸다)와 회원 상세의 "기능 권한" 칸에서 쓴다. 회원 목록·상세의 `cardImport`(`allowlisted`·`granted`·`enabled`)는 그대로 카드 불러오기만 보인다.
- CODEF 현황: S8 카운터를 **읽기만** 한다(`src/card-import/README.md` "호출 보호"). 값을 바꾸는 API는 없다(예산·플래그는 Terraform/env로만).

| 항목                          | 출처                                                                                                                                                         |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 오늘 호출 수 · 예산 · 남은 수 | `codef_daily_usage.calls`(예약 포함) · `CODEF_DAILY_CALL_BUDGET` · max(0, 예산 − 호출)                                                                       |
| 예약 중 · 진행 중             | 오늘 예산으로 연 추가 인증 이어가기의 남은 예약(`card_import_two_way_sessions.calls_left`) · 만료 전 조회 잠금 수(`card_import_locks`, 조회마다 최대 4 예약) |
| 최근 14일                     | 호출 수는 `codef_daily_usage`(7일 보관이라 그 전 날은 `null`), 조회 시작·성공·실패는 접근 기록 `FETCH_CARD_APPROVALS`(1년)                                   |
| 오늘 결과 코드별 · 카드사별   | 접근 기록 `details.step`·`result`·`organization` 집계(카드사는 기관 코드별 건수만)                                                                           |
| 사용자별 오늘 횟수 상위 10    | 접근 기록 `step = START` 사용자별 건수 + 닉네임(탈퇴했으면 `null`), 한도 `CARD_IMPORT_FETCH_LIMIT.DAILY`                                                     |
| 로그인 쿨다운 중              | `card_import_login_failures`에서 30분 안 3회 이상 실패하고 쿨다운이 안 끝난 사용자 수                                                                        |
| 삭제 대기                     | `codef_pending_deletions` 행 수 · 가장 오래된 `created_at`                                                                                                   |
| 기능 플래그                   | `FEATURE_CARD_IMPORT` 값 · 실제 단계(CODEF 키 없으면 off) · `CODEF_ENV` · `CODEF_LOGIN_MODE` · allowlist **인원 수**(ID는 내보내지 않는다)                   |

성공 = 결과 `OK`(추가 인증 이어가기 포함), 실패 = `OK`·`TWO_WAY_REQUIRED`·`PENDING` 밖의 결과.

### 기능 권한(ADMIN3)

회원 × 기능 키(`FEATURE_KEY_VALUES`: `CARD_IMPORT` · `FILE_IMPORT_WECHAT` · `FILE_IMPORT_ALIPAY`)마다 한 행(`feature_grants`, PK `(user_id, feature)`). 권한은 **그 기능의 실제 단계가 `allowlist`일 때만** 쓴다 — `on`은 모두, `off`는 아무도(권한 행과 무관). 판정은 `FeatureAccess`(`common/features.ts`)가 한 곳에서 하고, 세션 응답 `features`, 서버 가드, 회원 목록·상세의 `enabled`, 이 표의 `enabled`가 같은 판정을 쓴다.

| 기능 키 | 단계 env | allowlist에서 켜지는 회원 | 서버가 막는 곳(꺼진 회원은 404) |
| --- | --- | --- | --- |
| `CARD_IMPORT` | `FEATURE_CARD_IMPORT`(CODEF 키 없으면 off) | env `CARD_IMPORT_ALLOWED_USER_IDS` **∪** 이 권한 | `CardImportGuard`(카드 불러오기 API·`POST /api/wallet/entries/import`), 동의 API(`stage=CARD_IMPORT`) |
| `FILE_IMPORT_WECHAT` · `FILE_IMPORT_ALIPAY` | `FEATURE_FILE_IMPORT`(운영 importKey 키 없으면 off) + `FILE_IMPORT_PROVIDERS` | 그 공급자 권한이 있고 **그 공급자가 `FILE_IMPORT_PROVIDERS`에 있을 때만**(env 목록 없음) | `FileImportGuard`(켜진 공급자가 없으면 두 경로 모두) + `FileImportController`(요청 공급자별, 확인·저장 모두) |

- **즉시 반영**: 인스턴스 캐시 없이 요청마다 그 회원의 권한 행을 읽는다(같은 요청 안에서는 `req`에 묶어 한 번만 — 세션·가드·컨트롤러가 나눠 쓴다). 부여하면 다음 요청부터 켜지고, 회수하면 다음 요청부터 404.
- **표**: 기본은 권한(관리자·env)이 있는 회원 전부(최근에 받은 순 → env에만 있는 항목). `q`가 있으면 권한과 무관하게 닉네임 부분 일치·사용자 ID 정확 일치(가입 최신 순, 최대 `ADMIN_FEATURE_GRANT_SEARCH_LIMIT` = 20명, 넘으면 `truncated`). 칸마다 출처(`ADMIN`·`ENV`)·부여 시각·부여자·메모·지금 켜짐. 카드 불러오기 참고로 CARD_IMPORT 동의(`ConsentChecker`)·오늘 새 조회 수(접근 기록 `FETCH_CARD_APPROVALS` step `START`)를 함께 준다.
- **기능별 상태(읽기 전용)**: 설정 값(`configuredMode`) · 실제 단계(`effectiveMode`) · 꺼진 이유(`CODEF_KEYS_MISSING` · `IMPORT_KEY_MISSING` · `PROVIDER_DISABLED`) · env 목록 인원(카드만). 단계·env 목록·공급자 목록은 Terraform/env로만 바꾼다.
- **env 항목**: `sources: ['ENV']`로 보이고 회수할 수 없다(409 `ADMIN_FEATURE_GRANT_ENV_ONLY` — tfvars `card_import_allowed_user_ids`에서 빼고 apply). env에도 있는 회원에게 관리자 권한을 더할 수 있고(`['ADMIN', 'ENV']`), 회수하면 관리자 권한만 지워진다.
- **부여**: 없는 회원(탈퇴 포함)은 404, 이미 있으면 409 `ADMIN_FEATURE_GRANT_EXISTS`. 단계가 allowlist가 아니어도 줄 수 있다(미리 준비해 두고 allowlist로 바꾸면 바로 켜진다).
- 부여·회수는 되돌릴 수 있어 **재인증(step-up)을 받지 않는다**. 화면은 둘 다 확인 다이얼로그를 거친다. CSRF(Origin)·관리자 세션은 그대로.
- **탈퇴**: 탈퇴 파이프라인(`AccountDeletionService`)이 권한 행을 지운다(+ FK `ON DELETE CASCADE`). 처리 건수 `counts.featureGrants`(옛 표 `counts.cardImportGrants`).
- 메모는 100자, **권한 행에만** 남는다(접근 기록에는 적었는지만 `noteGiven`). 그래도 개인정보를 적지 않는다.
- 기능 키를 더할 때: `FEATURE_KEY_VALUES`(shared) · Prisma enum `FeatureKey`(`ALTER TYPE feature_key ADD VALUE` 마이그레이션) · `FeatureAccess`의 판정 · 화면 `FEATURE_LABEL`·`FEATURE_ENV_NAME`.

#### 옛 `card_import_grants`(ADMIN2)에서 옮긴 방법

- 마이그레이션 `20261030100000_create_feature_grants`가 새 enum·표를 만들고 옛 행을 `CARD_IMPORT`로 복사한다(`ON CONFLICT DO NOTHING` — 다시 돌려도 안전, `test/feature-grants-migration.e2e-spec.ts`가 같은 문장을 실DB에서 돌려 본다).
- 배포 워크플로는 마이그레이션을 새 리비전보다 **먼저** 적용한다. 그 사이 옛 리비전은 옛 표만 읽고 쓰므로 새 표가 생겨도 영향이 없다. 그래서 **옛 표는 이번에 지우지 않는다**: 새 코드는 옛 표를 읽지도 쓰지도 않고, `CARD_IMPORT` 회수·탈퇴 때만 옛 행도 함께 지운다(옛 리비전으로 되돌려도 회수한 권한이 되살아나지 않게 — fail closed). 되돌린 동안 새 화면에서 준 권한은 옛 리비전에 보이지 않는다(덜 열리는 쪽).
- 한계: 마이그레이션이 끝난 뒤 새 리비전이 트래픽을 받기 전(보통 1~2분)에 **옛 화면에서 준** 카드 권한은 복사되지 않는다. 배포 중에는 권한을 바꾸지 않고, 바꿨다면 새 화면에서 다시 준다.
- 옛 표 삭제는 옛 리비전이 더는 돌지 않는 것을 확인한 뒤 별도 마이그레이션으로 한다. 옛 접근 기록 값(`ADMIN_*_CARD_IMPORT*`, `CARD_IMPORT_GRANT`)은 1년 보존 중인 행이 있어 목록에 남겨 둔다.

## 보안 설계

### 세션

- **사용자 세션과 완전히 분리**: 쿠키 `__Host-yj_admin`(HttpOnly · Secure · SameSite=Strict · Path=/ · Domain 없음), 테이블 `admin_sessions`. 값은 256bit 난수이고 DB에는 SHA-256만 둔다.
- 관리자 라우트(`@AdminOnly()`·`@AdminPublic()`)는 메타데이터 `IS_ADMIN_ROUTE_KEY`로 전역 `AuthGuard`·`ConsentGuard`를 건너뛰고(사용자 세션 `yj_session`을 읽지 않는다) `AdminSessionGuard`가 관리자 쿠키만 본다. 그래서 **일반 세션으로 관리자 API는 401 `ADMIN_UNAUTHENTICATED`**, 일반 API는 관리자 쿠키를 모르므로 **관리자 세션으로 일반 API는 401 `UNAUTHENTICATED`**.
- 401 코드를 사용자 쪽(`UNAUTHENTICATED`)과 나눠 화면의 전역 401 처리기(카카오 로그인으로 보냄)가 반응하지 않게 했다.
- 만료: 유휴 30분(`last_seen_at`, 1분 간격으로 갱신) · 절대 8시간(`expires_at`, 쿠키 Max-Age도 8시간) 중 먼저. 로그아웃은 서버에서 `revoked_at`을 채워 같은 쿠키를 다시 써도 401. 자격 증명(아이디·해시·TOTP 시크릿)을 바꾸면 지문(`credential_tag`)이 달라져 기존 세션이 모두 무효.
- **로그인에 성공하면 기존 관리자 세션을 전부 폐기**하고 새 토큰을 준다(다른 브라우저 포함 — 동시에 살아 있는 관리자 세션은 하나, 세션 고정 방지).
- 끝난 세션과 오래된 시도 제한 행은 파기 배치 `ADMIN_SESSIONS`가 지운다(`src/retention/README.md`).

### 로그인 · 2단계 인증

- **비밀번호**: Node 내장 `crypto.scrypt`(새 해시 N = 2^17, r = 8, p = 1, 솔트 16바이트, 키 32바이트) 해시만 env로 받는다(의존성 0, `password-hash.ts`). 비용 값이 해시 안에 있어 예전 N = 2^15 해시도 그대로 확인된다(하위 호환). 비용 범위는 묶어서 잘못된 env로 메모리를 크게 쓰지 못한다.
  - 메모리: N = 2^17이면 확인 한 번에 128MiB, 약 0.2초. Cloud Run은 인스턴스당 512Mi라 `ScryptGate`(`admin-config.ts`)가 인스턴스 안에서 **한 번에 1개만** 돌리고 대기열 8개를 넘으면 429 `RATE_LIMITED`로 끊는다(시도 제한은 횟수만 막고 동시에 몰리는 것은 못 막기 때문).
- **아이디**: SHA-256 다이제스트끼리 `timingSafeEqual`, 아이디가 틀려도 scrypt를 끝까지 돌린다(응답 시간으로 아이디가 맞았는지 드러나지 않게).
- **TOTP(필수)**: RFC 6238(HMAC-SHA1, 30초, 6자리), 앞뒤 1창 허용, 비교는 상수 시간(`totp.ts`, 의존성 0). **같은 코드 재사용 금지**: 관리자마다 마지막으로 받은 창 번호를 `admin_totp_counters`에 두고 더 큰 창만 원자적으로 받는다(인스턴스가 여럿이어도, 같은 코드를 동시에 보내도 한 번만 성공). 비밀번호·아이디가 맞을 때만 창을 차지한다.
- 실패 문구는 무엇이 틀렸든 **하나** — "아이디, 비밀번호 또는 인증 코드가 맞지 않아요". 이유(`BAD_CREDENTIALS`·`BAD_TOTP`·`TOTP_REPLAY`)는 접근 기록에만 남는다(`BAD_TOTP`·`TOTP_REPLAY`는 비밀번호 유출 신호).
- **시도 제한**(`admin_login_throttles`, DB — 인스턴스가 여럿이어도 같다): **비밀번호 확인 전에** `INSERT … ON CONFLICT DO UPDATE … RETURNING`으로 원자적으로 센다.
  - 장치 쿠키 없는 요청: IP당 15분 고정 창에 5번(**IPv6는 /64 접두어로 묶는다** — `rateLimitAddress`), 전체(모든 IP) 성공 없이 15분에 20번. 넘으면 창이 끝날 때까지 429(맞는 자격 증명이어도).
  - **장치 쿠키**(OWASP device cookie, `admin-device.ts`): 로그인에 성공한 브라우저에 `__Host-yj_admin_dev`(HttpOnly · Secure · SameSite=Strict, 90일)를 준다. 값 = 무작위 장치 ID + 서버 HMAC(`SESSION_SECRET` HKDF, 용도에 자격 증명 지문 — 자격 증명을 바꾸면 무효). 유효한 장치 쿠키가 있는 로그인은 **전체 잠금에서 빠지고** 그 장치만 15분 5번. 그래서 공격자가 전체 잠금을 계속 걸어도 운영자 브라우저는 막히지 않는다. 장치 쿠키는 인증 수단이 아니다(로그인은 여전히 비밀번호 + TOTP).
  - 한도를 넘은 요청의 접근 기록(`RATE_LIMITED`, `scope`)은 **키·창마다 처음 한 번만** 쓰고, 나머지는 카운터(`attempts` — 넘긴 수 = attempts − 한도, 1일 보관)로만 센다(기록 폭주 방지).
  - 성공하면 그 요청의 키(IP·전체 또는 장치)를 지운다. 키는 IP 원문 대신 HMAC(`AUDIT_HMAC_KEY`).
  - 그 위에 전역 Throttler `@StrictThrottle()`(1분 10회)도 걸린다.
- **비상 해제**: 장치 쿠키가 없는 새 브라우저(새 기기, 쿠키 삭제)는 전체 잠금에 막힐 수 있다. 15분 기다려도 계속 막히면(잠금 공격이 이어지는 경우) 운영자 DB 접속 절차(사유 입력 스크립트, 접속 기록이 남는다)로 `admin_login_throttles`의 행을 지운 뒤 바로 로그인한다. 로그인에 성공하면 그 브라우저는 장치 쿠키를 받아 이후 전체 잠금에서 빠진다.
- **재인증(step-up)**: 탈퇴 처리처럼 되돌릴 수 없는 조치는 세션이 있어도 관리자 비밀번호 + 지금 TOTP(재사용 금지)를 다시 받는다. 세션마다 15분 5번(`stepup:<세션 ID>`), 넘으면 429 `ADMIN_STEP_UP_RATE_LIMITED`. 실패는 403 `ADMIN_STEP_UP_FAILED` 한 가지 문구.
- CSRF: 전역 `CsrfGuard`(Origin = `WEB_BASE_URL`)가 로그인·로그아웃·탈퇴 처리(POST)에 그대로 걸리고, 쿠키가 SameSite=Strict다. 운영은 Cloudflare origin lock도 그대로(`/api/admin/`은 예외가 아니다).

### 접근 기록(개인정보취급자 접속 기록)

모든 관리자 열람·조치는 `access_logs`(1년 보존)에 남는다. 관리자는 `users` 행이 없어서 `user_id` = **관리자 행위자 ID**(아이디에서 만든 결정적 UUID, `actorIdOf` — 아이디 원문은 남기지 않는다). 요청 ID·UA와 **접속지 정보**를 남긴다: 원 IP(`client_ip`, 운영자 본인의 접속이라 1년 보관 — 「개인정보의 안전성 확보조치 기준」 접속기록, 로그인 실패·시도 제한도 공격 추적용) + `ip_hash`. 일반 사용자 접근 기록은 `ip_hash`만이고 DB CHECK(`access_logs_client_ip_admin_only_check`)가 `ADMIN_*` 행에만 `client_ip`를 허용한다.

| action                   | resource         | details                                                                                                                                                                                                                                    |
| ------------------------ | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `ADMIN_LOGIN`            | `ADMIN`          | —                                                                                                                                                                                                                                          |
| `ADMIN_LOGIN_FAILED`     | `ADMIN`          | `reason`: `BAD_CREDENTIALS` \| `BAD_TOTP` \| `TOTP_REPLAY` \| `RATE_LIMITED`(+`scope` IP·GLOBAL·DEVICE, 키·창마다 처음 한 번) · `device: TRUSTED`(장치 쿠키 요청). 입력한 아이디·코드는 남기지 않는다                                      |
| `ADMIN_LOGOUT`           | `ADMIN`          | —                                                                                                                                                                                                                                          |
| `ADMIN_VIEW_USERS`       | `USER`           | `count` · `query`(`NONE`\|`NICKNAME`\|`USER_ID` — 검색어 원문은 남기지 않는다) · `sort` · `page`(`FIRST`\|`NEXT`) · `userIds`(반환한 회원 ID 목록)                                                                                         |
| `ADMIN_VIEW_USER`        | `USER` + 회원 ID | `result`: `OK` \| `NOT_FOUND`(없는 회원 조회도 남긴다. UUID가 아니면 resourceId NULL)                                                                                                                                                      |
| `ADMIN_WITHDRAW_USER`    | `USER` + 회원 ID | `reason`(입력한 사유) · `result`(`PENDING` → `DELETED` \| `NOT_FOUND` \| `ADMIN_CONFIRM_MISMATCH` \| `ADMIN_STEP_UP_FAILED:<이유>` \| `ADMIN_STEP_UP_RATE_LIMITED` \| 그 밖의 에러 코드) · `accountDeletionId` — 실패한 시도도 모두 남는다 |
| `ADMIN_VIEW_CODEF_USAGE` | `CODEF_USAGE`    | —                                                                                                                                                                                                                                          |
| `ADMIN_VIEW_FEATURE_GRANTS` | `FEATURE_GRANT` | `count` · `query`(`NONE`\|`NICKNAME`\|`USER_ID` — 검색어 원문은 남기지 않는다) · `userIds`(표에 보인 회원 ID — env 항목 포함)                                                                                                     |
| `ADMIN_GRANT_FEATURE` | `USER` + 회원 ID | `feature` · `result`(`PENDING` → `GRANTED` \| `NOT_FOUND` \| `ADMIN_FEATURE_GRANT_EXISTS` \| 그 밖의 에러 코드) · `noteGiven`(`YES`\|`NO` — 메모 내용은 남기지 않는다) — 실패한 시도도 남는다                                       |
| `ADMIN_REVOKE_FEATURE` | `USER` + 회원 ID | `feature` · `result`(`PENDING` → `REVOKED` \| `NOT_FOUND` \| `ADMIN_FEATURE_GRANT_ENV_ONLY` \| 그 밖의 에러 코드) · `grantedAt`(회수한 권한의 부여 시각, UTC ISO) — 권한 행은 지워지므로 누가 언제 줬는지는 부여 기록에서 본다 |

- 열람 기록은 **응답 전에** 쓰고, 쓰지 못하면 요청을 500으로 실패시킨다(fail closed — 기록 없는 열람이 없다). 탈퇴 처리·기능 권한 부여·회수는 시도(`PENDING`)를 먼저 기록하고(실패하면 처리하지 않는다) 끝나면 결과를 같은 행에 채운다. 로그인 실패 기록만 응답을 바꾸지 않는다(오류 로그).
- 애플리케이션 로그(Cloud Logging)에는 행위·대상만 남기고 `details`(탈퇴 사유)는 남기지 않는다.
- 로거 마스킹에 `username`·`passwordHash`·`totp`·`totpSecret`을 더했다(`password`는 원래 있다 — `common/logging/mask.ts`, `logger.ts`). 요청 본문은 원래 로그에 남지 않는다.

### 화면

- `/admin/*`는 `<meta name="robots" content="noindex, nofollow">` + `public/_headers`의 `X-Robots-Tag`·`Cache-Control: no-store`. 일반 화면 어디서도 링크하지 않고 `robots.txt`에도 적지 않는다(경로를 알리지 않으려고).
- 관리자 화면은 라우트 지연 로딩으로 일반 앱 번들과 다른 청크이고, 자기 QueryClient를 써서 앱의 전역 에러 처리(카카오 로그인 이동·토스트)를 타지 않는다.

## 테스트

- 단위: `password-hash.spec.ts`(형식·솔트·비용 범위·N = 2^17 기본·예전 해시 호환), `totp.spec.ts`(RFC 6238 벡터·±1창·base32·URI), `admin-login-throttle.spec.ts`(IPv6 /64), `admin-config.spec.ts`(셋 다 있어야 켜짐·형식 오류·확인·scrypt 동시 실행 1개·지문), `common/logging/logger.spec.ts`(관리자 자격 증명 마스킹).
- e2e `test/admin.e2e-spec.ts`(실DB): 미설정 404(없는 라우트와 같은 본문·헤더, CSRF 403 아님) · 일반 실패 문구(아이디·비밀번호·코드) · TOTP 필수·재사용 금지(동시 요청 포함) · 새 로그인이 기존 세션 폐기 · IP당 429 + `Retry-After` + 기록 1회 · IPv6 /64 · 전체 잠금 · 장치 쿠키(전체 잠금 제외·장치 한도·위조·자격 증명 교체) · 재인증(비밀번호·코드·재사용·세션당 한도) · 실패한 탈퇴·없는 회원 조회 기록 · 쿠키 속성 · 세션 분리(양방향) · 유휴·절대 만료 · 로그아웃 폐기 · CSRF · 자격 증명 교체 무효 · 목록 검색·정렬·커서 · 상세에 결제 내용 없음 · 탈퇴(닉네임 불일치·사유·CSRF·파이프라인·기록) · 기록 실패 시 500 · CODEF 집계 · 파기 배치 · 로그에 아이디·비밀번호·토큰·사유 없음.
- e2e `test/admin-feature-grants.e2e-spec.ts`(실DB, 실제 기능 플래그 카드 allowlist + CODEF 키 · 파일 allowlist + WECHAT·ALIPAY): 카드 권한 부여 즉시 세션 `features.cardImport`·`GET /api/card-import/config` 200 · 회수 즉시 404(옛 `card_import_grants` 행도 삭제) · 위챗 권한이면 위챗 확인 200·알리페이 확인·저장 404 · 권한 없는 회원은 확인·저장 모두 404 · 회원 목록·상세 `granted`·`enabled` · 표(기능별 단계·env 인원·기본 목록·닉네임·ID 검색) · 409·404·400 · env 항목 표시·회수 409·env + 관리자 동시 · 탈퇴하면 권한 행 삭제 · 접근 기록(기능 키·결과, 메모·검색어 원문 없음, `client_ip`) · 일반 세션으로 401 `ADMIN_UNAUTHENTICATED` · CSRF 403.
- e2e `test/feature-grants-migration.e2e-spec.ts`(실DB): 마이그레이션의 복사 문장 — 옛 행이 그대로 옮겨지고, 이미 있는 행은 덮어쓰지 않고, 다시 돌려도 안전.
- 단위 `common/features.spec.ts`: `FeatureAccess`(카드 env·권한 합집합, 파일 공급자별 권한 ∩ `FILE_IMPORT_PROVIDERS`, off·on은 DB를 보지 않음, 요청당 한 번 조회, 다음 요청은 다시 읽음) · `CardImportGuard` · `FileImportGuard` · `FEATURE_FILE_IMPORT` off·allowlist·on.

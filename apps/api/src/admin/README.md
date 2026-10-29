# 관리자 페이지 (`src/admin`, ADMIN)

운영자 한 명이 쓰는 관리자 API. 기능은 두 가지다: **회원 관리**(목록·상세·탈퇴 처리)와 **CODEF 호출 현황**(읽기 전용). 화면은 `apps/web/src/features/admin`(`/admin/*`).

공유 타입은 `@yeojeong/shared`의 `api/admin.ts`, 에러 코드는 `ADMIN_ERRORS`(`errors.ts`).

## 켜고 끄기

env `ADMIN_USERNAME`과 `ADMIN_PASSWORD_HASH`가 **둘 다** 있을 때만 켜진다. 하나라도 비면 `/api/admin/*` 전체가 **없는 라우트와 똑같은 404**다(`AdminGateMiddleware` — 가드보다 먼저 돌아서 CSRF 403·관리자 헤더로도 경로가 드러나지 않는다). 운영 기본은 꺼짐(Terraform `enable_admin = false`).

값이 있는데 형식이 틀리면 부팅을 멈춘다(값은 메시지에 넣지 않는다).

| env                   | 형식                                          | 운영                                                                  |
| --------------------- | --------------------------------------------- | --------------------------------------------------------------------- |
| `ADMIN_USERNAME`      | 영문·숫자·`._@-` 3~64자                       | Secret Manager `yeojeong-admin-username`(사용자가 gcloud로 생성)      |
| `ADMIN_PASSWORD_HASH` | `scrypt$<N>$<r>$<p>$<salt>$<hash>`(base64url) | Secret Manager `yeojeong-admin-password-hash`(사용자가 gcloud로 생성) |

### 자격 증명 등록(운영자가 직접)

```bash
# 1. 비밀번호 해시 만들기(12자 이상). 화면에 보이지 않게 두 번 묻고 해시만 표준출력에 쓴다. 비밀번호 원문은 어디에도 저장하지 않는다
pnpm --silent --filter @yeojeong/api admin:hash > /tmp/admin-hash && chmod 600 /tmp/admin-hash

# 2. Secret Manager에 넣기(서울 리전 user-managed 복제 — 다른 외부 시크릿과 같다)
printf '%s' '<관리자 아이디>' | gcloud secrets create yeojeong-admin-username \
  --replication-policy=user-managed --locations=asia-northeast3 --data-file=-
gcloud secrets create yeojeong-admin-password-hash \
  --replication-policy=user-managed --locations=asia-northeast3 --data-file=/tmp/admin-hash
rm /tmp/admin-hash

# 3. terraform.tfvars에 enable_admin = true → terraform apply(Cloud Run env 연결 + 런타임 계정 읽기 권한)
```

- 비밀번호를 바꿀 때는 1번으로 새 해시를 만들어 `gcloud secrets versions add yeojeong-admin-password-hash --data-file=…` 후 Cloud Run을 새 리비전으로 배포한다. 아이디나 해시가 바뀌면 **기존 관리자 세션은 모두 무효**가 된다(세션에 자격 증명 지문을 묶는다).
- 끄려면 `enable_admin = false`로 apply(시크릿은 남아도 env가 빠져 404).
- 로컬: `.env`에 같은 두 값을 넣는다. 쿠키가 `__Host-`(Secure)라 `http://localhost`를 보안 컨텍스트로 보는 Chrome·Firefox에서 연다.

## API 계약

모두 응답 헤더 `Cache-Control: no-store` · `X-Robots-Tag: noindex, nofollow`(에러 포함). 시각은 ISO 8601 KST.

| 메서드·경로                              | 인증                   | 요청                                                 | 응답                                                                                 | 에러                                                                                                                                                                                                  |
| ---------------------------------------- | ---------------------- | ---------------------------------------------------- | ------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /api/admin/login`                  | 없음(CSRF·origin lock) | `{ username, password }`                             | 200 `AdminSessionView { authenticated, expiresAt, idleExpiresAt }` + 쿠키            | 400 `VALIDATION_FAILED`, 401 `ADMIN_LOGIN_FAILED`(일반 문구), 403 `CSRF_REJECTED`, 429 `ADMIN_LOGIN_RATE_LIMITED`(`details{retryAfter, retryAfterSec}` + `Retry-After`), 429 `RATE_LIMITED`(1분 10회) |
| `POST /api/admin/logout`                 | 관리자                 | —                                                    | 204(서버에서 폐기 + 쿠키 삭제)                                                       | 401 `ADMIN_UNAUTHENTICATED`, 403 `CSRF_REJECTED`                                                                                                                                                      |
| `GET /api/admin/session`                 | 관리자                 | —                                                    | 200 `AdminSessionView`                                                               | 401                                                                                                                                                                                                   |
| `GET /api/admin/users`                   | 관리자                 | `?q=&sort=createdAt\|lastLoginAt&cursor=&limit=1~50` | 200 `AdminUserListResponse { items[], nextCursor }`                                  | 400(커서·정렬 불일치), 401                                                                                                                                                                            |
| `GET /api/admin/users/:userId`           | 관리자                 | —                                                    | 200 `AdminUserDetail`                                                                | 401, 404                                                                                                                                                                                              |
| `POST /api/admin/users/:userId/withdraw` | 관리자                 | `{ reason(2~200자), confirmNickname }`               | 200 `AdminWithdrawUserResponse { status:'DELETED', accountDeletionId, completedAt }` | 400 `ADMIN_CONFIRM_MISMATCH`·`VALIDATION_FAILED`, 401, 403 `CSRF_REJECTED`, 404                                                                                                                       |
| `GET /api/admin/codef-usage`             | 관리자                 | —                                                    | 200 `AdminCodefUsage`                                                                | 401                                                                                                                                                                                                   |

- 회원 목록 항목: 사용자 ID · 닉네임 · 가입일 · 최근 로그인 · 참여 여정 수(나가지 않았고 삭제되지 않은 그룹) · 지갑 항목 수(`walletEntryWhere` — 내 지갑과 같은 기준) · 상태(`ACTIVE` | `DELETION_REQUESTED` = 처리 전·만료 전 FR-108 요청) · 카드 불러오기(`allowlisted` = env allowlist 포함, `enabled` = 지금 켜짐).
- 검색: `q`가 UUID 모양이면 ID 정확 일치, 아니면 닉네임 부분 일치(대소문자 무시). 커서는 `(정렬 값, id)` 불투명 문자열이라 정렬이 다르면 400.
- 상세: 위 + 카카오 회원번호 **끝 4자리** · 처리 전 탈퇴 요청 · 동의 이력(종류·버전·동의/철회 일시·철회 경로) · 그룹/여정(이름·단계·기간·역할·나감·삭제) · **건수만**(결제자인 여정 결제, 지갑 항목, 결제수단, 활성 세션). 결제 내용·금액·가맹점은 읽지도 않는다(최소 열람).
- 탈퇴 처리: 서비스 내 탈퇴와 **같은 파이프라인**(`AccountDeletionService.deleteAccount`, 경로 `SUPPORT` — 고객센터 요청 처리와 같다)을 그대로 부른다. 새 파기 로직은 없다. 탈퇴를 막는 기존 규칙(정산 미완료 등)은 파이프라인에 없어서(그룹장 승계·"탈퇴한 멤버"로 기록 유지) 관리자 처리에도 없다. 처리 전 탈퇴 요청이 있으면 함께 완료된다. 닉네임 재입력은 서버도 다시 비교한다.
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

## 보안 설계

### 세션

- **사용자 세션과 완전히 분리**: 쿠키 `__Host-yj_admin`(HttpOnly · Secure · SameSite=Strict · Path=/ · Domain 없음), 테이블 `admin_sessions`. 값은 256bit 난수이고 DB에는 SHA-256만 둔다.
- 관리자 라우트(`@AdminOnly()`·`@AdminPublic()`)는 메타데이터 `IS_ADMIN_ROUTE_KEY`로 전역 `AuthGuard`·`ConsentGuard`를 건너뛰고(사용자 세션 `yj_session`을 읽지 않는다) `AdminSessionGuard`가 관리자 쿠키만 본다. 그래서 **일반 세션으로 관리자 API는 401 `ADMIN_UNAUTHENTICATED`**, 일반 API는 관리자 쿠키를 모르므로 **관리자 세션으로 일반 API는 401 `UNAUTHENTICATED`**.
- 401 코드를 사용자 쪽(`UNAUTHENTICATED`)과 나눠 화면의 전역 401 처리기(카카오 로그인으로 보냄)가 반응하지 않게 했다.
- 만료: 유휴 30분(`last_seen_at`, 1분 간격으로 갱신) · 절대 8시간(`expires_at`, 쿠키 Max-Age도 8시간) 중 먼저. 로그아웃은 서버에서 `revoked_at`을 채워 같은 쿠키를 다시 써도 401. 자격 증명(아이디·해시)을 바꾸면 지문(`credential_tag`)이 달라져 기존 세션이 모두 무효. 다시 로그인하면 들고 온 세션을 폐기하고 새 토큰을 준다(세션 고정 방지).
- 끝난 세션과 오래된 시도 제한 행은 파기 배치 `ADMIN_SESSIONS`가 지운다(`src/retention/README.md`).

### 로그인

- 비밀번호는 Node 내장 `crypto.scrypt`(N = 2^15, r = 8, p = 1, 솔트 16바이트, 키 32바이트) 해시만 env로 받는다(의존성 0, `password-hash.ts`). 해시의 비용 값은 범위를 묶어 잘못된 env로 메모리를 크게 쓰지 못하게 한다.
- 아이디는 SHA-256 다이제스트끼리 `timingSafeEqual`, 아이디가 틀려도 scrypt를 끝까지 돌린다(응답 시간으로 아이디가 맞았는지 드러나지 않게). 실패는 어느 쪽이 틀렸든 **같은 문구** "아이디 또는 비밀번호가 맞지 않아요".
- 시도 제한(`admin_login_throttles`, DB — 인스턴스가 여럿이어도 같다): **비밀번호 확인 전에** `INSERT … ON CONFLICT DO UPDATE … RETURNING`으로 원자적으로 센다(동시 요청으로 한도를 넘겨 확인하지 못한다).
  - IP당 15분 고정 창에 5번. 넘으면 그 창이 끝날 때까지 429(맞는 비밀번호여도).
  - 전체(모든 IP) 성공 없이 15분 창에 20번. 넘으면 그 창이 끝날 때까지 모든 IP가 429 — 분산 대입을 막는 대신 운영자도 최대 15분 기다려야 한다.
  - 성공하면 그 IP와 전체 카운터를 지운다. 키는 IP 원문 대신 HMAC(`AUDIT_HMAC_KEY`).
  - 그 위에 전역 Throttler `@StrictThrottle()`(1분 10회)도 걸린다.
- CSRF: 전역 `CsrfGuard`(Origin = `WEB_BASE_URL`)가 로그인·로그아웃·탈퇴 처리(POST)에 그대로 걸리고, 쿠키가 SameSite=Strict다. 운영은 Cloudflare origin lock도 그대로(`/api/admin/`은 예외가 아니다).

### 접근 기록(개인정보취급자 접속 기록)

모든 관리자 열람·조치는 `access_logs`(1년 보존)에 남는다. 관리자는 `users` 행이 없어서 `user_id` = **관리자 행위자 ID**(아이디에서 만든 결정적 UUID, `actorIdOf` — 아이디 원문은 남기지 않는다). IP는 HMAC, 요청 ID·UA를 남긴다.

| action                   | resource         | details                                                                                                           |
| ------------------------ | ---------------- | ----------------------------------------------------------------------------------------------------------------- |
| `ADMIN_LOGIN`            | `ADMIN`          | —                                                                                                                 |
| `ADMIN_LOGIN_FAILED`     | `ADMIN`          | `reason`: `BAD_CREDENTIALS` \| `RATE_LIMITED`(입력한 아이디는 남기지 않는다)                                      |
| `ADMIN_LOGOUT`           | `ADMIN`          | —                                                                                                                 |
| `ADMIN_VIEW_USERS`       | `USER`           | `count` · `query`(`NONE`\|`NICKNAME`\|`USER_ID` — 검색어 원문은 남기지 않는다) · `sort` · `page`(`FIRST`\|`NEXT`) |
| `ADMIN_VIEW_USER`        | `USER` + 회원 ID | —                                                                                                                 |
| `ADMIN_WITHDRAW_USER`    | `USER` + 회원 ID | `reason`(입력한 사유) · `result`(`PENDING` → `DELETED` \| 에러 코드) · `accountDeletionId`                        |
| `ADMIN_VIEW_CODEF_USAGE` | `CODEF_USAGE`    | —                                                                                                                 |

- 열람 기록은 **응답 전에** 쓰고, 쓰지 못하면 요청을 500으로 실패시킨다(fail closed — 기록 없는 열람이 없다). 탈퇴 처리는 시도(`PENDING`)를 먼저 기록하고(실패하면 처리하지 않는다) 끝나면 결과를 같은 행에 채운다. 로그인 실패 기록만 응답을 바꾸지 않는다(오류 로그).
- 애플리케이션 로그(Cloud Logging)에는 행위·대상만 남기고 `details`(탈퇴 사유)는 남기지 않는다.
- 로거 마스킹에 `username`·`passwordHash`를 더했다(`password`는 원래 있다 — `common/logging/mask.ts`, `logger.ts`). 요청 본문은 원래 로그에 남지 않는다.

### 화면

- `/admin/*`는 `<meta name="robots" content="noindex, nofollow">` + `public/_headers`의 `X-Robots-Tag`·`Cache-Control: no-store`. 일반 화면 어디서도 링크하지 않고 `robots.txt`에도 적지 않는다(경로를 알리지 않으려고).
- 관리자 화면은 라우트 지연 로딩으로 일반 앱 번들과 다른 청크이고, 자기 QueryClient를 써서 앱의 전역 에러 처리(카카오 로그인 이동·토스트)를 타지 않는다.

## 테스트

- 단위: `password-hash.spec.ts`(형식·솔트·비용 범위), `admin-config.spec.ts`(꺼짐 조건·형식 오류·아이디/비밀번호 확인·행위자 ID·지문), `common/logging/logger.spec.ts`(관리자 자격 증명 마스킹).
- e2e `test/admin.e2e-spec.ts`(실DB): 미설정 404(없는 라우트와 같은 본문·헤더, CSRF 403 아님) · 일반 실패 문구(아이디·비밀번호 모두) · IP당 429 + `Retry-After` · 전체 잠금 · 쿠키 속성 · 세션 분리(양방향) · 유휴·절대 만료 · 로그아웃 폐기 · CSRF · 자격 증명 교체 무효 · 목록 검색·정렬·커서 · 상세에 결제 내용 없음 · 탈퇴(닉네임 불일치·사유·CSRF·파이프라인·기록) · 기록 실패 시 500 · CODEF 집계 · 파기 배치 · 로그에 아이디·비밀번호·토큰·사유 없음.

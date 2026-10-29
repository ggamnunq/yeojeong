# 여정 API (`apps/api`)

NestJS + Prisma 서버. 모든 경로는 `/api` 아래에 있다.

## 로컬 실행

```bash
pnpm install
cp apps/api/.env.example apps/api/.env
pnpm db:up                            # 레포 루트에서 PostgreSQL 실행
pnpm --filter @yeojeong/api dev       # http://localhost:3000/api
pnpm --filter @yeojeong/api test      # 단위 테스트
pnpm --filter @yeojeong/api test:e2e  # e2e 테스트 (DB 없이 돈다)
```

필수 env가 없으면 서버가 뜨지 않는다(`.env.example` 참고). 테스트 기본값은 `vitest.config*.ts`의 `env`에 있다.

## 모듈 추가

- 폴더 하나가 Nest 모듈 하나다: `src/<module>/<module>.module.ts`, `<module>.controller.ts`, `<module>.service.ts`, `dto/*.dto.ts`, 단위 테스트는 옆에 `*.spec.ts`, e2e는 `test/<module>.e2e-spec.ts`.
- 모듈 이름은 기능명세 1-2를 따른다: `auth`, `users`, `consents`, `trips`, `groups`, `expenses`, `imports`, `settlements`, `wallet`, `fx`, `jobs`, `audit`.
- `app.module.ts`의 `imports`에 한 줄만 추가한다(`// 기능 모듈은 아래에 한 줄씩 추가한다` 아래). 전역 가드·필터·파이프는 건드리지 않는다.
- `PrismaService`와 `common/auth`의 조회 서비스는 전역이라 모듈에서 따로 import하지 않는다.
- 응답 타입은 `@yeojeong/shared`(`packages/shared/src/api.ts`)에 interface로 두고, Swagger용 DTO 클래스가 그것을 `implements`한다.
- enum 값은 Prisma enum과 shared 상수(`TripStatus.ONGOING`, `TRIP_STATUS_VALUES`)가 같다. DTO 검증은 `@IsIn(TRIP_STATUS_VALUES)`.
- 스키마(`prisma/schema.prisma`)는 1차에서 기능명세 부록 A 전체를 넣었다. 컬럼이 더 필요하면 하위 호환 규칙(`prisma/README.md`)대로 새 마이그레이션을 만든다.

## 인증과 권한

전역 가드가 아래 순서로 모든 요청에 돈다(`app.module.ts`). 다른 모듈은 `src/common/auth/index.ts`에서만 import한다.

| 순서 | 가드              | 하는 일                                                                                                                         | 실패                                                         |
| ---- | ----------------- | ------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| 1    | `ThrottlerGuard`  | IP당 rate limit                                                                                                                 | 429 `RATE_LIMITED`                                           |
| 2    | `CsrfGuard`       | POST·PUT·PATCH·DELETE는 `Origin`이 `WEB_BASE_URL`(또는 `WEB_ORIGIN`)과 같아야 한다. `Origin`이 없으면 `Sec-Fetch-Site: same-origin`만 허용 | 403 `CSRF_REJECTED`                                          |
| 3    | `AuthGuard`       | 쿠키 `yj_session`으로 로그인 확인, `req.auth` 채움. **기본 로그인 필수**, `@Public()`만 예외                                    | 401 `UNAUTHENTICATED` / 가입 대기면 403 `SIGNUP_REQUIRED`    |
| 4    | `ConsentGuard`    | 가입 필수 동의(TOS·PRIVACY·AGE14)의 현재 버전 동의 확인, 그다음 `@RequireConsents()` 항목                                       | 403 `CONSENT_REQUIRED` `details: { missing, required }`      |
| 5    | `MembershipGuard` | 경로에 `:tripId` 또는 `:groupId`가 있으면 활성 멤버인지 확인, `req.membership`·`req.trip` 채움. `@RequireRole('LEADER')`        | 404 `NOT_FOUND`(비멤버·나간 멤버·삭제됨) / 403 `NOT_LEADER` |
| 6    | `TripStatusGuard` | `@RequireTripStatus()`가 있으면 여정 단계 확인                                                                                  | 409 `TRIP_PHASE_INVALID`(또는 지정한 코드)                   |

```ts
import {
  CurrentMembership,
  CurrentTrip,
  CurrentUser,
  Public,
  RequireConsents,
  RequireRole,
  RequireTripStatus,
  type AuthUser,
  type MembershipContext,
  type TripContext,
} from '../common/auth/index.js';

@Controller('trips/:tripId')
export class TripsController {
  @Get() // 로그인 + 이 여정의 활성 멤버(자동)
  detail(@CurrentUser() user: AuthUser, @CurrentTrip() trip: TripContext) {}

  @RequireRole('LEADER')
  @RequireTripStatus('UPCOMING')
  @Post('start') // 그룹장 + 시작 전
  start(@CurrentMembership() me: MembershipContext) {}

  @RequireTripStatus('ONGOING', { code: 'EXPENSE_LOCKED' })
  @Put('expenses/:expenseId/classification')
  classify() {}
}

@RequireConsents(FIN_LINK_REQUIRED_CONSENTS) // 결제수단 연결·재연결·지갑 추가
@Post('payment-connections')
connect() {}

@Public() // 비로그인 허용. 로그인 상태면 @CurrentUser({ optional: true })로 받는다
@Get('consents/documents')
documents() {}
```

규칙:

- **여정·그룹 ID 파라미터 이름은 `:tripId`, `:groupId`로 고정한다.** 이 이름이어야 멤버십 검사가 자동으로 걸린다. `:id`로 받지 않는다.
- 남의 리소스는 403이 아니라 404로 숨긴다. 결제처럼 여정 안의 리소스는 서비스에서 `tripId` 조건을 함께 걸어 조회한다(ID만으로 조회하지 않는다).
- 가드는 요청 시점의 값으로 막는 1차 관문이다. 상태를 바꾸는 서비스는 트랜잭션 안에서 Trip 행을 잠그고(`FOR SHARE`/`FOR UPDATE`) 단계와 멤버십을 다시 확인한다(기능명세 8-3).
- `@SkipConsentCheck()`는 재동의 전에도 열려야 하는 라우트(재동의, 탈퇴 `DELETE /api/users/me`)에만 쓴다(약관 제3조⑤ — 개정 약관에 동의하지 않아도 로그아웃·탈퇴는 할 수 있다).
- 관리자 라우트(`/api/admin/*`)는 사용자 세션과 섞지 않는다. `src/admin`의 `@AdminOnly()`·`@AdminPublic()`이 `AuthGuard`·`ConsentGuard`를 건너뛰고 관리자 쿠키(`__Host-yj_admin`)만 보는 `AdminSessionGuard`를 붙인다. 다른 모듈은 이 데코레이터를 쓰지 않는다(`src/admin/README.md`).

### 로그인·가입 (auth, users, consents 모듈)

| 메서드 | 경로                                               | 권한             | 하는 일                                                                                          |
| ------ | -------------------------------------------------- | ---------------- | ------------------------------------------------------------------------------------------------ |
| GET    | `/api/auth/kakao/start` (`/api/auth/kakao`도 같음) | 공개             | 카카오 인가 페이지로 302. `?returnTo=/trips/...`(같은 origin 화면 경로만)                         |
| GET    | `/api/auth/kakao/callback`                         | 공개, Strict     | 기존 회원: 세션 + 302 returnTo·`/`. 신규: 가입 대기 + 302 `/signup/nickname`. 취소·실패: `/login?error=cancelled\|failed`. state 불일치 400 |
| GET    | `/api/auth/session`                                | 공개             | `ANONYMOUS` / `SIGNUP_REQUIRED`(+`signupDraft`) / `AUTHENTICATED`(+`user`, `reconsentRequired`). 403을 내지 않는다 |
| POST   | `/api/auth/signup`                                 | 가입 대기, Strict | `{ nickname, agreements: [{ consentId, version, agreed }], method }` → 201 `Me`(이미 가입된 계정이면 200) |
| POST   | `/api/auth/logout`                                 | 공개             | 이 기기 세션 폐기, 204                                                                           |
| POST   | `/api/auth/reconsent`                              | 로그인           | 빠진 가입 필수 동의를 현재 버전으로, 204                                                        |
| GET    | `/api/users/me`                                    | 로그인           | `Me`(`hasProfileImage`, 결제수단 수, 만료 연결 여부)                                             |
| DELETE | `/api/users/me`                                    | 로그인           | 앱 안 탈퇴(FR-109, HF-59) `{ confirm: true }` → 204, 세션 쿠키 삭제. 재동의 전에도 허용          |
| GET    | `/api/notices/active`                              | 공개             | 게시 중인 공지(Q-57) `{ items: [{ id, title, url, startsAt, endsAt }] }`, 최신부터. `Cache-Control: private, max-age=300`(세션 연장 Set-Cookie가 실릴 수 있어 공유 캐시 금지) |
| POST   | `/api/client-errors`                               | 공개, Origin     | 화면 오류 보고 → 구조화 로그 `event=client_error`(DB 저장 없음). 204. 본문 8KB(413), IP 1분 20회·사용자 1분 10회(429). [docs/ops/client-errors.md](../../docs/ops/client-errors.md) |
| GET    | `/api/consents/documents?stage=SIGNUP\|FIN_LINK`    | 공개             | 동의 문서 현재 버전(`hidden`이면 화면에 그리지 않음)                                            |
| GET    | `/api/consents/status?stage=FIN_LINK`              | 로그인           | 연동 동의 유효 여부                                                                              |
| POST   | `/api/consents`                                    | 로그인           | 연동 동의(FIN_LINK·FIN_PRIVACY·THIRD_PARTY) 저장. 성공해야 결제수단 연결을 시작한다              |

쿠키(모두 httpOnly·SameSite=Lax, 운영은 Secure):

| 쿠키        | 값                                      | 경로              | 수명                          |
| ----------- | --------------------------------------- | ----------------- | ----------------------------- |
| `yj_session` | 32바이트 난수(DB에는 SHA-256만)         | `/`               | 30일, 7일 미만 남으면 30일로 연장 |
| `yj_signup` | SignupTicket ID 서명값                  | `/api`            | 30분                          |
| `yj_oauth`  | state·returnTo 서명값(`SESSION_SECRET`) | `/api/auth/kakao` | 10분                          |

- 카카오는 REST API 키 + 클라이언트 시크릿, 인가 코드 방식이다. 동의 항목은 닉네임(필수)·프로필 사진(선택)만 요청한다. 카카오 액세스 토큰과 회원번호는 로그에 남기지 않고, 토큰은 저장하지 않는다. PKCE는 카카오 문서에 없어 쓰지 않는다.
- 카카오 HTTP 호출은 `KakaoClient`(`src/auth/kakao/kakao.client.ts`) 뒤에 있다. 테스트는 `createTestApp([], { auth: 'real', prisma, overrides: [[KakaoClient, fake]] })`로 바꿔 끼운다(`test/auth.e2e-spec.ts`).

### 동의 판정

- 기준은 `consent_documents` 테이블이다(1분 캐시). 새 버전은 **마이그레이션으로 행을 추가**한다(지우지 않는다). 동의 이력(`user_consents`)은 append-only이고 수정할 수 있는 값은 철회 시각·경로뿐이다.
- 유효 동의 = 그 항목의 시행 중인 **정식본(`is_draft = false`)** 중 **재동의가 필요한(`reconsent_required`) 가장 최근 버전**과 그 이후 버전에 `agreed`한 행이 있고 철회되지 않음. 재동의가 필요 없는 개정은 기존 동의를 유지한다. MVP 기간 0.x는 MAJOR가 늘 0이라 버전 번호로 판단하지 않는다. 버전 비교는 문자열 정확히 일치(`0.1-draft` ≠ `0.1`).
- 구 표기: `replaces_version`(예: 0.1 행의 `'1.0'`). 그 표기로 받은 동의(`user_consents.version = '1.0'`)를 대신한 버전의 동의로 보고, 구 표기 행은 판정에서 뺀다. 동의 기록은 고치지 않는다.
- **초안 동의는 법적 유효 동의가 아니다.** 정식본이 하나도 없을 때만 초안 동의를 임시로 인정한다. 정식 약관(`TOS`·`PRIVACY`·`AGE14`, 게시 당시 `version = '1.0'` = 지금 `0.1`, 시행일 2026-10-30 00:00 KST = `effective_at`, 마이그레이션 `20261030010000_consent_documents_v1_0`·`20261030020000_consent_documents_v0_x`)이 시행되는 순간 초안에 동의한 회원 모두에게 `403 CONSENT_REQUIRED`가 나가 재동의(`POST /api/auth/reconsent`)를 받는다. `CARD_IMPORT`는 0.2 판(게시일 시행)에서 정식 0.1이 생긴다. 나머지 동의(MARKETING·FIN_*·THIRD_PARTY)는 초안만 있다.
- `version`은 문서 버전(0.1 → 0.2 …, 문서마다 따로), 시행일은 `effective_at`에 따로 둔다. `doc_hash`는 게시본(`apps/web/src/features/legal/content/v<판>/*.md`, 게시일을 채운 것) SHA-256. 0.x 행과 그 마이그레이션은 `pnpm --filter @yeojeong/web legal:sync`가 만든다(`docs/ops/legal-publishing.md`). `consent-catalog.spec.ts`가 파일로 다시 계산해 마이그레이션 값과 대조한다.
- 판정 함수와 테스트: `src/common/auth/consent-catalog.ts`, `consent-catalog.spec.ts`(초안만 / 정식 발행 후 초안 동의자 / 재동의 필요·불필요 개정 / 구 표기 1.0 = 0.1 / 정확히 일치 비교).
- 동의 기록에는 서버가 `ipHash`(origin lock이 넘긴 클라이언트 IP의 HMAC-SHA256, 키 `AUDIT_HMAC_KEY`. 평문 `ip`는 더 쓰지 않는다), `ua`(512자), `screen`, `method`, `docHash`, `userRefHash = HMAC-SHA256(userId, USER_REF_HMAC_KEY)`를 채운다. `USER_REF_HMAC_KEY`는 바꾸지 않는다.

### 탈퇴 (FR-109)

- 앱 안 탈퇴(`DELETE /api/users/me`, 화면 HF-59)는 `account` 모듈이 맡는다. 재동의 전에도 부를 수 있다.
- 이메일 탈퇴는 로그인할 수 없는 회원의 보조 경로다. 문의처는 약관·개인정보처리방침(docs/legal/v0.1 · v0.2)에 게시한 `rlawnsdyd530@gmail.com`이고, 운영자가 관리자 페이지에서 같은 파이프라인(`AccountDeletionService`, channel `SUPPORT`)으로 처리한다. 예전의 요청 코드 발급(`POST /api/users/me/deletion-request`, FR-108)과 `SUPPORT_EMAIL` env는 L-1에서 없앴다(`account_deletions.request_code_hash`·`expires_at`도 마이그레이션 `20261030010001`로 지움).

### 비밀값

`AuthConfig`(`src/common/auth/auth-config.ts`)가 시작할 때 검증한다. 하나라도 없거나 형식이 틀리면 서버가 뜨지 않는다. 운영 값은 Secret Manager(Terraform `infra/envs/prod/secrets.tf`)에 있다.

| env                                       | 운영                                   | 비고                                    |
| ----------------------------------------- | -------------------------------------- | --------------------------------------- |
| `KAKAO_CLIENT_ID`, `KAKAO_CLIENT_SECRET`  | Secret Manager(tfvars에서)             | 카카오 콘솔 값                          |
| `KAKAO_REDIRECT_URI`, `WEB_BASE_URL`      | Cloud Run 일반 env                     | 운영은 https만                          |
| `SESSION_SECRET`                          | Secret Manager(random_password)        | 32자 이상                               |
| `TOKEN_ENCRYPTION_KEY`                    | Secret Manager(random_bytes 32)        | `*_enc` 컬럼 AES-256-GCM(`TokenCipher`) |
| `USER_REF_HMAC_KEY`                       | Secret Manager(random_password)        | 교체 금지(prevent_destroy)              |
| `KAKAO_ADMIN_KEY`                         | Secret Manager(사용자가 gcloud로 생성, `yeojeong-kakao-admin-key`) | 선택. 없으면 연결 끊기 알림 404. Terraform `enable_kakao_unlink` |
| `KAKAO_APP_ID`                            | Cloud Run 일반 env(`kakao_app_id`)     | 선택. 연결 끊기 알림 app_id 확인         |
| `EXIM_API_KEY`                            | Secret Manager(사용자가 gcloud로 생성, `yeojeong-exim-api-key`) | 선택. 있으면 환율 소스 koreaexim+erapi(미고시 통화 TWD·VND·PHP는 ExchangeRate-API, 키 없음). Terraform `enable_exim_fx` |
| `ADMIN_USERNAME`, `ADMIN_PASSWORD_HASH`, `ADMIN_TOTP_SECRET` | Secret Manager(사용자가 gcloud로 생성, `yeojeong-admin-username`·`yeojeong-admin-password-hash`·`yeojeong-admin-totp-secret`) | 선택. 셋 다 있어야 관리자 페이지가 켜진다(없으면 `/api/admin/*` 404). 해시는 `admin:hash`, TOTP 시크릿은 `admin:totp`. Terraform `enable_admin`. `src/admin/README.md` |

### 내부 잡 인증

- 내부 잡 컨트롤러는 클래스에 `@InternalJob()`을 붙인다. 이 데코레이터가 `@Public()`과 CSRF 예외를 함께 적용하고, 전역 `InternalJobGuard`가 인증한다. 모듈별 가드를 만들지 않는다.
- 운영은 Cloud Scheduler가 Cloud Run URL을 직접 호출하며, `Authorization: Bearer <OIDC ID token>`의 Google JWKS 서명·`aud`·서비스 계정 `email`을 검증한다. `INTERNAL_JOB_OIDC_AUDIENCE`와 `INTERNAL_JOB_OIDC_SERVICE_ACCOUNT`가 정확히 일치해야 한다.
- 로컬·테스트만 `x-internal-job-secret` = `INTERNAL_JOB_SECRET`(32자 이상)을 대체 인증으로 허용한다. `NODE_ENV=production`에서는 이 헤더를 무시한다.
- `/api/internal/`은 Cloudflare origin lock을 건너뛴다. 이 경로의 인증 경계는 `@InternalJob()` 가드다.
- 내부 잡 목록(모두 `POST`, 본문 `{}`): `auto-end`(5분), `sync`(10분, 결제 동기화), `fx`(11:10·17:10), `settlements`(매시 15분), `purge`(04:00) — Cloud Scheduler `yeojeong-<이름>`(`infra/envs/prod/scheduler.tf`).

### 외부 서버 콜백 (`@ExternalWebhook()`)

- 브라우저가 아닌 외부 서버가 부르는 콜백(지금은 카카오 "연결 끊기 알림" `GET|POST /api/auth/kakao/unlink`)에만 붙인다. `@Public()` + CSRF 예외라 **핸들러가 호출자를 직접 인증해야 한다**(공유 비밀 상수 시간 비교).
- `/api/internal/`과 달리 origin lock은 그대로다. 카카오 → `jinyeojeong.com/api/...`(Cloudflare Worker가 `x-origin-auth`를 붙이고 `Authorization`·본문·쿼리를 그대로 넘김, `apps/web/worker/index.test.ts`) → Cloud Run.
- 카카오 연결 끊기 알림: `Authorization: KakaoAK {Admin 키}`를 `KAKAO_ADMIN_KEY`와 SHA-256 다이제스트로 상수 시간 비교, `KAKAO_APP_ID`가 있으면 `app_id`도 확인. 틀리면 본문 없는 401, 키가 없으면 404. 성공은 회원 여부와 무관하게 200 빈 본문. 처리 = 그 회원의 세션 전부 폐기 + 가입 대기 삭제 + 접근 기록 `KAKAO_UNLINKED` + 경고 로그(운영 알림). 탈퇴 여부는 미결 Q-32(기본안: 탈퇴하지 않음).

### 테스트에서 로그인 흉내 내기

`test/auth-helpers.ts`의 스텁을 `createTestApp`에 넘기면 DB 없이 가드 체인을 그대로 탄다.

```ts
const auth = createTestAuth();
const me = auth.addUser({ nickname: '준용' });
const { membership, trip } = auth.addMembership({ user: me, role: 'LEADER', tripStatus: 'ONGOING' });
auth.withoutConsent(me, 'THIRD_PARTY'); // 이 동의가 없는 사용자로 만들기(선택)

app = await createTestApp([TripsController], { auth, prisma: prismaMock });
await request(app.getHttpServer())
  .post(`/api/trips/${trip!.id}/start`)
  .set(auth.headers(me)) // 세션 쿠키 + 허용 Origin(TEST_ORIGIN)
  .expect(201);
```

- `auth.headers()`(사용자 없이)는 비로그인 + 허용 Origin이다. POST 등은 Origin이 없으면 403 `CSRF_REJECTED`라 테스트에도 붙여야 한다.
- `createTestApp`의 `prisma`에 가짜 객체를 넘기거나 `'real'`로 로컬 DB에 붙인다. 기본값은 헬스 체크만 되는 가짜다.
- 가드 단위 테스트 예시는 `src/common/auth/guards.spec.ts`, e2e 예시는 `test/auth-guards.e2e-spec.ts`.

## 에러 응답

성공 응답은 감싸지 않고 데이터를 그대로 보낸다. 에러는 모두 아래 형식이다.

```json
{
  "code": "VALIDATION_FAILED",
  "message": "입력한 내용을 다시 확인해 주세요",
  "details": {
    "fields": [{ "path": "title", "code": "maxLength", "message": "..." }]
  },
  "requestId": "3f1eb10e-c9a4-400e-bf74-00331ca9ef84"
}
```

- `code`: 대문자 스네이크 고정 문자열. 화면은 이 값으로 분기한다.
- `message`: 화면에 그대로 보여도 되는 한국어 한 문장.
- `details`: 있을 때만 온다. 검증 실패면 `fields`에 필드별·제약별 오류가 모두 담긴다(중첩은 `items.0.amount`).
- `requestId`: 응답 헤더 `x-request-id`와 같은 값. 서버 로그를 찾을 때 쓴다.

타입(`ApiErrorBody`, `ErrorCode`, `FieldError`)과 코드 목록(`ERRORS`)은 `packages/shared/src/errors.ts`에 있고 화면도 같이 쓴다.

| 상황                                    | status    | code                            |
| --------------------------------------- | --------- | ------------------------------- |
| DTO 검증 실패                           | 400       | `VALIDATION_FAILED`             |
| 잘못된 JSON, 그 밖의 형식 오류          | 400       | `BAD_REQUEST`                   |
| 인증 필요 / 권한 없음(origin lock 포함) | 401 / 403 | `UNAUTHENTICATED` / `FORBIDDEN` |
| 없는 라우트, Prisma P2025               | 404       | `NOT_FOUND`                     |
| Prisma P2002(유니크 위반)               | 409       | `CONFLICT`                      |
| 본문 100kb 초과                         | 413       | `PAYLOAD_TOO_LARGE`             |
| rate limit                              | 429       | `RATE_LIMITED`                  |
| 그 밖의 모든 오류                       | 500       | `INTERNAL_ERROR`                |

`AppException`이 아닌 예외는 원래 메시지를 버리고 코드별 기본 문구만 보낸다. 스택, 내부 메시지, DB 오류는 응답에 나가지 않는다.

### 도메인 코드

기능명세 6-2의 코드가 모듈별 맵(`AUTH_ERRORS`, `TRIP_ERRORS`, `EXPENSE_ERRORS`, `FX_ERRORS`, `WALLET_ERRORS`)으로 이미 들어 있다. 401은 명세 초안의 `AUTH_REQUIRED` 대신 공통 `UNAUTHENTICATED`를 쓴다.

새 코드가 필요하면:

1. `packages/shared/src/errors.ts`의 해당 모듈 맵에 추가한다(새 모듈이면 맵을 만들어 `ERRORS`에 펼쳐 넣는다).
   ```ts
   export const TRIP_ERRORS = {
     NOT_LEADER: { status: 403, message: '그룹장만 할 수 있어요' },
   } as const satisfies Record<string, ErrorDefinition>;
   ```
2. 코드는 한 번 정하면 바꾸지 않는다(화면이 분기에 쓴다).

### AppException 사용

```ts
import {
  AppException,
  ForbiddenError,
  NotFoundError,
} from '../common/errors/index.js';

throw AppException.of('TRIP_NOT_FOUND'); // shared의 기본 status·문구
throw AppException.of('CONFLICT', {
  message: '이미 정산이 끝난 여정이에요',
  details: { settledAt },
});
throw new ForbiddenError('이 여정의 멤버만 볼 수 있어요');
throw new NotFoundError();
```

- `message`와 `details`는 그대로 응답에 나간다. 내부 정보나 다른 사람의 개인정보를 넣지 않는다.
- 원인 예외는 `AppException.of(code, { cause })`로 넘기면 로그에만 남는다.
- P2002처럼 화면에 구체적인 안내가 필요한 DB 오류는 서비스에서 잡아 도메인 코드로 바꾼다. 잡지 않으면 공통 `CONFLICT`가 나간다.
- DTO 데코레이터에는 한국어 `message`를 단다. 달지 않으면 class-validator 기본 영어 문구가 `fields[].message`로 나간다.
- Swagger에는 `@ApiErrorResponse(404, 'TRIP_NOT_FOUND')`로 적는다.

## 로깅

`nestjs-pino`(pino-http)를 쓴다. 운영(`NODE_ENV=production`)은 JSON 한 줄이고 Cloud Logging이 읽는 `severity`, `message`, `time`을 쓴다. 로컬은 `pino-pretty`로 한 줄씩 보인다. 레벨은 `LOG_LEVEL`로 바꾼다(기본: 운영 info, 로컬 debug, 테스트 silent).

**남기는 것**: 요청마다 한 줄(method, path(쿼리 제외), status, `responseTimeMs`, `requestId`, `cfRay`, `ip`, `userAgent`, 에러면 `errorCode`). 5xx는 스택과 함께 error 한 줄을 더 남긴다. 4xx는 요청 줄의 warn 레벨과 `errorCode`로 충분하다. `/api/health`는 debug라 운영에서는 남지 않는다.

**남기지 않는 것**: 요청·응답 본문, 쿼리스트링, 헤더. `authorization`, `cookie`, `set-cookie`, `x-origin-auth`는 실수로 객체째 남겨도 `[REDACTED]`로 가린다. Prisma 오류는 코드와 모델 이름만 남기고 입력값이 섞일 수 있는 `meta`는 남기지 않는다(`errorFormat: 'minimal'`).

- 서비스 코드에서는 `new Logger(Xxx.name)`(`@nestjs/common`)을 쓴다. 요청 안에서 남긴 로그에는 `requestId`가 자동으로 붙는다.
- 금액, 카드·계좌번호, 거래 내역, 이메일, 전화번호, 토큰은 로그에 넣지 않는다. 필요하면 ID만 남긴다.
- 개인정보를 URL 경로나 쿼리에 넣지 않는다(경로는 로그에 남는다).
- 요청 ID는 서버가 요청마다 UUID v4로 만든다. 클라이언트가 보낸 `x-request-id`는 쓰지 않는다.
- 화면에서 난 오류는 `POST /api/client-errors`(`src/client-errors`)가 error 레벨 `event=client_error` 한 줄로 남긴다(경로 템플릿·가린 메시지·스택 파일 이름, 로그인 사용자는 HMAC `userRef`). 필터 예시는 [docs/ops/client-errors.md](../../docs/ops/client-errors.md).

## Swagger

로컬과 개발 환경에서만 등록된다. 운영(`NODE_ENV=production`)에서는 404다.

- UI: http://localhost:3000/api/docs
- JSON: http://localhost:3000/api/docs-json

CLI 플러그인을 쓰지 않으므로 DTO 속성마다 `@ApiProperty()`를 단다. 응답 타입은 shared의 interface를 구현한 DTO 클래스로 적는다(예: `health/health-response.dto.ts`).

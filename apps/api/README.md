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
- `@SkipConsentCheck()`는 재동의 전에도 열려야 하는 라우트(재동의, 탈퇴·삭제 요청)에만 쓴다.
- 쿠키 이름: 세션 `yj_session`, 가입 대기 `yj_signup`. 세션 발급·가입·로그아웃은 `auth` 모듈이 맡는다.

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

## Swagger

로컬과 개발 환경에서만 등록된다. 운영(`NODE_ENV=production`)에서는 404다.

- UI: http://localhost:3000/api/docs
- JSON: http://localhost:3000/api/docs-json

CLI 플러그인을 쓰지 않으므로 DTO 속성마다 `@ApiProperty()`를 단다. 응답 타입은 shared의 interface를 구현한 DTO 클래스로 적는다(예: `health/health-response.dto.ts`).

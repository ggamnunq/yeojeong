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

### 도메인 코드 추가

1. `packages/shared/src/errors.ts`에 모듈별 맵을 만들어 `ERRORS`에 펼쳐 넣는다.
   ```ts
   const TRIP_ERRORS = {
     TRIP_NOT_FOUND: { status: 404, message: '여정을 찾을 수 없어요' },
   } as const satisfies Record<string, ErrorDefinition>;

   export const ERRORS = { ...COMMON_ERRORS, ...TRIP_ERRORS } as const satisfies ...;
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

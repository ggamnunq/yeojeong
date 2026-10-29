# 화면 오류 보고 · 옛 번들 감지

휴대폰에 오래 열어 둔 탭에서 「새 여정 만들기」·「여정 정보」·「초대코드로 참여」(모두 지연 로딩 화면)를 열자 「문제가 생겼어요」가 뜨고, 탭을 새로 열면 괜찮았던 사고가 있었습니다. 그 사이 배포가 여러 번 있었고, 서버 로그에는 4xx/5xx가 하나도 없었습니다(API를 부르기 전에 화면에서 실패). 원인 메시지를 알 방법이 없어서 아래 두 가지를 만들었습니다.

1. **옛 번들 감지**: 빌드 ID를 번들과 `/version.json`에 같이 넣고, 탭이 배포된 빌드와 다르면 「새 버전이 나왔어요 · 새로고침」으로 보냅니다.
2. **화면 오류 보고**: 화면에서 난 오류를 `POST /api/client-errors`로 보내 Cloud Logging에 `event=client_error`로 남깁니다. DB에는 저장하지 않습니다.

## 1. 옛 번들 감지

| 무엇 | 어디 |
| --- | --- |
| 빌드 ID | `apps/web/vite.config.ts` `buildInfo` 플러그인. `BUILD_ID` 환경변수 → `GITHUB_SHA` 앞 12자(배포 워크플로) → 로컬 `git rev-parse` 앞 12자(+`-dirty`) → `local`. 개발 서버는 `dev`. 번들에는 `import.meta.env.VITE_BUILD_ID`로 들어갑니다 |
| `/version.json` | 같은 빌드가 `dist/version.json`(`{"buildId":"…"}`)으로 내보냅니다. `public/_headers`가 `Cache-Control: no-store`로 내줍니다. 화면은 `cache: 'no-store'`, 쿠키 없이 3초까지 기다립니다(`src/app/buildInfo.ts`) |
| chunk 실패 판정 | `src/app/chunkError.ts`. 브라우저별 문구(Chromium·Firefox·Safari·MIME 오류·Vite CSS preload·webpack)와 Safari `TypeError: Load failed`(정확히 같은 문장), 그리고 문구와 상관없이 `vite:preloadError`로 받은 에러 |

화면 반응(`src/app/ErrorFallback.tsx` — 에러 경계·라우트 에러 화면·조회 실패 화면이 같이 씁니다):

- **chunk 실패**(지연 로딩 실패): 바로 「새 버전이 나왔어요 · 새로고침」. `React.lazy`는 실패한 import를 기억해서 「다시 시도」로는 풀리지 않습니다. 보고에는 배포된 빌드와 다른지(`staleBuild`)를 같이 싣습니다.
- **ApiError**: 지금처럼 서버 문구 + 문의 번호. 서버가 요청 ID와 함께 이미 남기므로 보고하지 않습니다.
- **그 밖의 에러**: `/version.json`을 확인하는 동안(최대 3초) 빈 화면, 배포된 빌드가 다르면 「새 버전이 나왔어요」, 같거나 확인하지 못하면 「문제가 생겼어요 · 다시 시도」.

오래 열어 둔 탭(`src/app/staleBundle.ts`):

- 탭이 백그라운드에 **30분 넘게** 있다 돌아오면(`visibilitychange`, bfcache `pageshow`) `/version.json`을 봅니다.
- 다르면 **다음 라우트 이동 때** 전체 새로고침합니다(이동한 주소 그대로 다시 불러옴). 바로 새로고침하지 않습니다.
- 그 이동에서 넘기는 경우(다음 이동을 기다림): 사용자가 입력한 값이 남은 칸이 이동 뒤에도 화면에 있을 때, 이동에 화면 상태(`location.state` — 카드 불러오기 단계 등)가 실렸을 때, 화면에 `data-no-auto-reload` 속성이 있을 때. 진행 중인 흐름이 새로고침으로 끊기면 안 되는 화면은 이 속성을 붙입니다.
- 같은 빌드 ID로는 탭마다 한 번만 새로고침합니다(`sessionStorage yj:stale-reload:for`). 배포 전파가 늦어도 무한 반복하지 않습니다.
- `vite:preloadError`의 기본 동작(에러를 던짐)은 막지 않습니다. 에러 경계가 「새로고침」을 보여 줍니다.

## 2. 화면 오류 보고

**보내는 곳**: 에러 경계(라우트 에러 화면 포함) · `window` `error` · `unhandledrejection` (`src/app/clientErrors.ts`, `main.tsx`가 켭니다).

**본문**(같은 origin `fetch` + `keepalive`, JSON):

| 필드 | 내용 |
| --- | --- |
| `buildId` | 이 탭의 빌드 ID |
| `route` | 경로 템플릿(`/trips/:tripId/payments/:expenseId`). 실제 ID·쿼리·해시는 없습니다. 없는 화면은 `/*`, 모르면 `(unknown)` |
| `source` | `boundary` · `window` · `promise` |
| `name` | 에러 이름(`TypeError` 등, 형식이 이상하면 `Error`) |
| `message` | 가린 메시지 500자: URL은 파일 이름만, 쿼리·해시 값, 큰따옴표 안 문자열, 이메일, UUID, 카드 번호(13~19자리), 4자리 이상 숫자열, 초대코드 모양, 긴 토큰을 가립니다 |
| `stack` | 앞 8줄의 `파일이름:줄:열`. 함수 이름·경로·쿼리는 빼고, 다른 origin(확장 프로그램 등)은 `(external)` |
| `userAgent` | 원문이 아니라 `Safari 18 / iOS 18`, `KakaoTalk / iOS 17`, `Chrome 141 WebView / Android 14` 같은 요약 |
| `chunk` | chunk 실패인지 |
| `staleBuild` | 배포된 빌드와 다른지(확인하지 못했으면 없음) |

**보내지 않는 것**: 개인정보, 입력값, 주소의 쿼리·해시(초대코드 `#code=`), 카드 관련 값, 전체 URL, 원문 User-Agent. 같은 오류(이름·메시지·경로·출처)는 탭마다 한 번(`sessionStorage`에는 해시만), 페이지 하나에서 최대 10건. 보내기 실패는 조용히 버립니다. 다른 origin 스크립트의 `Script error.`는 보내지 않습니다.

**서버**(`apps/api/src/client-errors`):

- 로그인 없이 열려 있습니다(`@Public`). 로그인 상태면 `userId` 대신 `userRef` = HMAC-SHA256(`USER_REF_HMAC_KEY`, `client-error:v1:<userId>`) 앞 16자. 동의 기록의 `userRefHash`와 일부러 다르게 만들어 로그만으로는 DB 기록과 잇지 못합니다.
- 상태를 바꾸는 POST라 CSRF 가드(Origin 허용 목록, Origin이 없으면 `Sec-Fetch-Site: same-origin`)를 그대로 받습니다. 화면은 `sendBeacon`이 아니라 같은 origin `fetch(keepalive)`로 보내 Origin이 붙습니다. origin lock(Worker 경유)도 그대로입니다.
- 본문 8KB 상한(전역 JSON 파서 100kb보다 먼저, 넘거나 chunked면 읽지 않고 413 `PAYLOAD_TOO_LARGE`). IP당 1분 20회(`@Throttle`), 로그인 사용자당 1분 10회(429 `RATE_LIMITED`). 인스턴스당 1분 300건을 넘으면 남기지 않고 버립니다(204).
- 형식을 좁게 검사합니다(경로 템플릿·`파일이름:줄:열`·UA 요약 형식, 모르는 필드 400). 메시지는 서버가 같은 규칙으로 한 번 더 가리고, 로거의 키 마스킹(`common/logging/mask.ts`)도 그대로 거칩니다.
- 남기는 것: 구조화 로그 한 줄(severity `ERROR`). DB에는 저장하지 않습니다. 보존은 애플리케이션 로그와 같은 93일입니다.

로그 한 줄(운영):

```json
{
  "severity": "ERROR",
  "time": "2026-10-30T01:23:45.678Z",
  "requestId": "05c8d730-…",
  "context": "ClientErrorsService",
  "event": "client_error",
  "buildId": "ccd404d9a1b2",
  "route": "/trips/new",
  "source": "boundary",
  "errorName": "TypeError",
  "errorMessage": "Importing a module script failed.",
  "stack": ["index-Cx1.js:12:9"],
  "clientUserAgent": "Safari 18 / iOS 18",
  "chunk": true,
  "staleBuild": true,
  "userRef": "9f2c4e1a0b3d5c7e",
  "message": "client_error TypeError /trips/new"
}
```

## 3. 로그에서 보기

```bash
# 최근 하루의 화면 오류
gcloud logging read 'resource.type="cloud_run_revision" AND resource.labels.service_name="yeojeong-api" AND jsonPayload.event="client_error"' \
  --freshness=1d --limit=50 \
  --format='table(timestamp, jsonPayload.route, jsonPayload.errorName, jsonPayload.errorMessage, jsonPayload.buildId, jsonPayload.staleBuild, jsonPayload.clientUserAgent)'

# chunk 실패만 / 옛 번들에서 난 것만
gcloud logging read 'jsonPayload.event="client_error" AND jsonPayload.chunk=true' --freshness=7d --limit=50
gcloud logging read 'jsonPayload.event="client_error" AND jsonPayload.staleBuild=true' --freshness=7d --limit=50

# 특정 화면 · 특정 빌드
gcloud logging read 'jsonPayload.event="client_error" AND jsonPayload.route="/trips/new"' --freshness=7d
gcloud logging read 'jsonPayload.event="client_error" AND jsonPayload.buildId="ccd404d9a1b2"' --freshness=7d

# 원본 JSON 전체(스택 포함)
gcloud logging read 'jsonPayload.event="client_error"' --freshness=1d --limit=5 --format=json
```

로그 탐색기(콘솔)에서는 같은 필터 `jsonPayload.event="client_error"`를 쓰면 됩니다. 요청 줄(`POST /api/client-errors 204`)과는 `jsonPayload.requestId`로 잇습니다.

**특정 회원의 오류를 찾을 때**(문의 처리): 회원 ID를 로그에 남기지 않으므로 운영자가 `userRef`를 계산해 필터합니다. 키는 Secret Manager `yeojeong-user-ref-hmac-key`(`USER_REF_HMAC_KEY`)이고 표준입력으로만 넘겨 화면·셸 히스토리·프로세스 인자에 남기지 않습니다(시크릿 읽기는 Data Access 감사 로그에 남습니다). 회원 ID는 관리자 페이지에서 확인합니다([operator-access.md](operator-access.md)).

```bash
read -rs USER_ID   # 회원 ID 붙여 넣기(화면에 보이지 않음)
REF=$(gcloud secrets versions access latest --secret=yeojeong-user-ref-hmac-key \
  | USER_ID="$USER_ID" node -e 'let k="";process.stdin.on("data",d=>k+=d).on("end",()=>console.log(require("crypto").createHmac("sha256",k).update("client-error:v1:"+process.env.USER_ID).digest("hex").slice(0,16)))')
gcloud logging read "jsonPayload.event=\"client_error\" AND jsonPayload.userRef=\"$REF\"" --freshness=30d
unset USER_ID REF
```

## 4. 확인하는 법(로컬)

- 단위: `pnpm --filter @yeojeong/web test -- src/app` (chunk 문구, 가리기, 경로 템플릿, 빌드 비교, 오래 열어 둔 탭), `pnpm --filter @yeojeong/api test -- client-errors`, `pnpm --filter @yeojeong/api test:e2e -- client-errors` (레이트 리밋·크기 상한·CSRF·로그 형식).
- 목 E2E: `pnpm --filter @yeojeong/web test:e2e -- client-errors` — 지연 로딩 모듈을 404로 막아 「새 버전이 나왔어요」와 보고 본문을, `page.clock`으로 31분 백그라운드 → 다음 이동 때 새로고침을 봅니다.
- 개발 서버 목(`VITE_MOCK_API=1`)에서 새 버전 흉내: 콘솔에서 `localStorage.setItem('yj:mock:buildId', 'next-build')` — 목 `/version.json`이 이 값을 돌려줍니다(`src/features/ops/mocks.ts`).

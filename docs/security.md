# 보안 원칙

여정은 금융 거래와 개인정보를 다루고, 레포는 public이다. 아래 내용을 기본값으로 삼는다.

## 지금 적용된 것

### API (`apps/api`)

- **보안 헤더**: helmet을 쓴다. `X-Powered-By`도 제거된다.
- **입력 검증**: 전역 `ValidationPipe`(whitelist, forbidNonWhitelisted, transform)를 쓴다. DTO에 없는 필드가 오면 400으로 거부한다.
- **요청 본문**: JSON만 받고 크기는 100kb로 제한한다. 폼(urlencoded) 파서는 꺼 두었다.
- **Rate limit**: 전역으로 IP당 1분에 120회까지 허용한다.
  - 로그인이나 인증번호처럼 무차별 대입 대상이 되는 엔드포인트에는 `@StrictThrottle()`(1분에 10회)를 붙인다.
  - 카운터는 인스턴스 메모리에 있어서 Cloud Run 인스턴스마다 따로 센다. 인증을 붙일 때 Redis 같은 공유 저장소를 검토한다.
- **Origin lock**: 운영 API는 Cloudflare Worker를 거친 요청만 받는다.
  - Worker가 `x-origin-auth` 헤더에 `ORIGIN_SECRET`을 담아 보내고, API는 값이 다르거나 없으면 403을 돌려준다(상수 시간 비교).
  - `*.run.app` 주소로 직접 들어오는 요청은 그래서 모두 403이다. Cloudflare의 보호(HTTPS 강제, rate limit 등)를 우회할 수 없다.
  - `ORIGIN_SECRET`은 Terraform이 만들어 Secret Manager(Cloud Run)와 Worker secret에만 둔다. 32자보다 짧으면 서버가 뜨지 않는다. 로컬에서는 비워 둬서 잠그지 않는다.
- **클라이언트 IP**: Worker를 거치면 Cloud Run이 받는 `X-Forwarded-For`는 `2a06:98c0:3600::103,<Cloudflare IP>`라 trust proxy만으로는 실제 IP를 알 수 없다(2026-10-28 실측).
  - Worker가 Cloudflare 엣지가 채운 `CF-Connecting-IP`를 `x-client-ip`로 넘기고, API는 origin lock을 통과한 요청에서만 이 값을 `req.ip`로 쓴다. rate limit도 이 IP 기준이다.
  - 클라이언트가 보낸 `X-Forwarded-For`, `X-Client-IP`, `X-Real-IP` 등은 Worker가 버린다. `CF-Connecting-IP`를 직접 보내면 Cloudflare가 요청을 거부한다.
  - `ORIGIN_SECRET` 없이 띄우면 예전처럼 trust proxy(Cloud Run 1단계, 로컬 0단계)로 판단한다.
- **CORS**: 운영은 화면과 API가 같은 origin이라 CORS를 쓰지 않는다(`WEB_ORIGIN` 비움). 다른 origin에서 불러야 할 때만 `WEB_ORIGIN`에 정확한 origin을 적는다. 와일드카드나 경로가 붙은 값은 서버가 시작할 때 오류를 낸다.
- **에러 응답**: 모든 에러는 `{ code, message, details?, requestId }` 형식이다. 500은 일반 문구만 돌려주고, 스택·내부 메시지·DB 오류는 서버 로그에만 남긴다(`apps/api/README.md`).
- **로그**: 요청마다 method·path(쿼리 제외)·status·소요 시간·요청 ID·IP·user-agent만 남긴다. 본문과 헤더는 남기지 않고, 인증 헤더와 쿠키는 redact한다. 요청 ID는 서버가 만들고 클라이언트가 보낸 `x-request-id`는 믿지 않는다.
- 위 내용은 `apps/api/test/`의 e2e 테스트(security, origin-lock, errors, logging)로 확인한다.

### 화면 (`apps/web`)

- `public/_headers`: Cloudflare가 응답에 아래 헤더를 붙인다.
  - CSP(`default-src 'self'`, `frame-ancestors 'none'` 등)
  - `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, HSTS
- 화면은 API를 같은 origin의 `/api`로 부르므로 CSP `connect-src 'self'`로 충분하다.
- **CSP를 바꿔야 할 때**
  - API를 다른 origin에 두면 `connect-src`에 그 origin을 추가한다.
  - 외부 폰트, 이미지, 스크립트를 쓸 때도 필요한 출처만 추가한다.
  - `'unsafe-inline'`과 `'unsafe-eval'`은 쓰지 않는다.
- **Permissions-Policy를 바꿔야 할 때**: 카메라(영수증 촬영)나 위치(소비 지도)를 직접 쓰게 되면 `camera=(self)`처럼 필요한 것만 연다.
- **`VITE_*` 환경변수**: 빌드 결과에 그대로 들어가 공개된다. 비밀값을 넣지 않는다.

### Cloudflare (`jinyeojeong.com`, `infra/envs/prod/cloudflare.tf`)

- HTTPS만 쓴다: SSL Full (strict), Always Use HTTPS, 최소 TLS 1.2.
- HSTS: 1년, 하위 도메인 포함. preload는 목록에서 빠지기 어려워 켜지 않았다.
- DNSSEC을 켰다.
- 메일을 쓰지 않는 도메인이라 사칭 메일이 거부되도록 SPF `-all`, DMARC `p=reject`, 빈 DKIM, null MX를 걸었다.
- `/api/*`에 엣지 rate limit(IP당 10초에 50회)을 걸었다. 앱의 분당 120회 제한보다 느슨한 1차 방어선이다.
- `www`는 apex로 301, workers.dev와 preview URL은 꺼서 진입로를 `jinyeojeong.com` 하나로 둔다.
- Cloudflare가 자동으로 넣는 Web Analytics 스크립트는 껐다. 제3자 스크립트라 CSP에도 막힌다.
- 토큰은 용도별로 나누고 최소 권한만 준다. 같은 계정의 다른 프로젝트 zone은 읽지도 못한다.
  - `yeojeong-terraform`(로컬 키체인): `jinyeojeong.com` zone 설정·DNS·리다이렉트·WAF·Workers Routes, 계정 Workers Scripts. 2027-04-28 만료.
  - `yeojeong-web-deploy`(GitHub `production` 환경 secret, main 브랜치 전용): 계정 Workers Scripts만. 2027-10-28 만료.
  - Workers Scripts 권한은 계정 단위라 같은 계정의 다른 Worker도 바꿀 수 있다. 지금은 다른 Worker가 없지만, 생기면 계정 분리를 검토한다.

### 의존성, CI, 레포

- **pnpm**
  - pnpm 11 기본값 `minimumReleaseAge`가 1440분이라 배포된 지 하루가 안 된 버전은 설치하지 않는다.
  - 설치 스크립트는 `pnpm-workspace.yaml`의 `allowBuilds`에 적은 패키지만 실행한다.
- **Dependabot**: npm, GitHub Actions, Docker, Terraform을 매주 확인한다. 새 버전은 3일 기다린 뒤 올리고, PR은 그룹으로 묶는다.
- **CI**
  - 워크플로 토큰은 읽기 전용이다.
  - 서드파티 action은 커밋 SHA로 고정한다.
  - `pull_request_target`은 쓰지 않는다.
- **GitHub 레포 설정**
  - secret scanning과 push protection
  - Dependabot alerts와 보안 업데이트
  - CodeQL
  - 비공개 취약점 신고
  - Actions 기본 토큰은 읽기 전용, 외부 기여자 워크플로는 승인이 필요
  - main 브랜치는 force push와 삭제를 막는다

## 개발하면서 지킬 것

### 인증과 세션

- 인증 토큰은 localStorage에 두지 않는다. httpOnly, Secure, SameSite 쿠키에 담는다.
- 쿠키가 제대로 동작하려면 화면과 API가 같은 사이트에 있어야 한다.
  - 적용됨: `https://jinyeojeong.com/api/*`를 Worker가 Cloud Run으로 프록시해서 화면과 같은 origin이다. CORS도 필요 없다.
- 쿠키 인증을 쓰면 상태를 바꾸는 요청에 CSRF 방어를 붙인다. SameSite와 Origin 검사, 또는 CSRF 토큰을 쓴다.
  - 적용됨: 세션 쿠키 `yj_session`(httpOnly·SameSite=Lax·운영 Secure, DB에는 토큰 SHA-256만), 전역 `CsrfGuard`가 POST·PUT·PATCH·DELETE의 `Origin`(없으면 `Sec-Fetch-Site: same-origin`)을 `WEB_BASE_URL`과 비교한다. 카카오 로그인 state는 서명 쿠키로 검증한다. 자세한 내용은 `apps/api/README.md` "인증과 권한".
- 모든 API는 기본이 로그인 필수다(`@Public()`만 예외). 여정·그룹 경로(`:tripId`, `:groupId`)는 멤버십 가드가 자동으로 걸리고 비멤버에게는 404를 준다.
- 운영자 관리자 페이지(`/api/admin/*`, `/admin`)는 사용자 세션과 완전히 분리된 관리자 세션(`__Host-yj_admin`, HttpOnly·Secure·SameSite=Strict, 유휴 30분·절대 8시간, DB에 토큰 해시만)을 쓴다. 자격 증명은 env 아이디 + scrypt 해시뿐이고 둘 중 하나라도 없으면 전체 404(운영 기본 꺼짐). 로그인 시도는 DB 카운터로 IP당·전체를 제한하고, 모든 열람·조치는 접근 기록(1년)에 남는다(fail closed). 자세한 내용은 `apps/api/src/admin/README.md`.

### 권한 검사 (IDOR)

- 여행, 거래, 정산을 읽거나 바꾸는 모든 API는 서버에서 두 가지를 검사한다.
  - 요청한 사람이 이 여행의 멤버인지
  - 요청한 사람이 이 거래의 소유자인지
- ID만 알면 열리는 API를 만들지 않는다.
- 외부에 노출되는 ID는 순차 번호 대신 UUID를 쓴다.
- 공동 장부에 승인되지 않은 거래(개인 검토함)는 소유자만 본다. 동행자에게는 가맹점명, 금액, 카테고리도 보여 주지 않는다(기획안 10장).

### 데이터와 비밀값

- 아래 정보는 로그에 남기지 않는다.
  - 카드번호, 계좌번호, 거래 내역
  - 이메일, 전화번호
  - 토큰
- 금융·개인정보는 로그에 남기지 않는다. 필요하면 ID만 남기고, 요청 본문·쿼리스트링·DB 오류의 입력값을 객체째 로그에 넣지 않는다.
- 카드번호와 계좌번호는 화면에서 마스킹한다.
- 금융기관 접근 토큰은 3단계(금융 연동)에서 Cloud KMS 등으로 암호화해 저장한다. 평문으로 저장하지 않는다.
- Supabase Data API(PostgREST)는 꺼 둔 상태다. DB에는 API 서버를 통해서만 접근한다.
- 비밀값은 Secret Manager(운영)와 로컬 `.env`(커밋 안 됨)에만 둔다.
- 비밀값을 커밋하거나 붙여 넣었다면 지우는 것만으로는 부족하다. 즉시 폐기하고 새로 발급한다.

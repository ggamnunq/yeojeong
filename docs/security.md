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
- **클라이언트 IP(trust proxy)**: Cloud Run(`K_SERVICE`가 있을 때)에서는 `X-Forwarded-For`의 맨 끝 1단계만 믿는다.
  - Cloudflare를 앞에 붙이면 `TRUST_PROXY_HOPS=2`로 올린다.
  - 그때 `*.run.app`으로 직접 들어오는 요청은 막아야 IP를 위조할 수 없다(Cloud Run ingress 제한 등).
  - 배포한 뒤에는 `req.ip`가 실제 클라이언트 IP로 잡히는지 한 번 확인한다.
- **CORS**: `WEB_ORIGIN`에 적은 정확한 origin만 허용하고 credentials도 허용한다. 와일드카드나 경로가 붙은 값은 서버가 시작할 때 오류를 낸다.
- **에러 응답**: 500 응답은 `Internal server error`만 돌려준다. 스택은 서버 로그에만 남긴다.
- 위 내용은 모두 `test/security.e2e-spec.ts`로 확인한다.

### 화면 (`apps/web`)

- `public/_headers`: Cloudflare가 응답에 아래 헤더를 붙인다.
  - CSP(`default-src 'self'`, `frame-ancestors 'none'` 등)
  - `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, HSTS
- **CSP를 바꿔야 할 때**
  - API를 다른 origin에 두면 `connect-src`에 그 origin을 추가한다.
  - 외부 폰트, 이미지, 스크립트를 쓸 때도 필요한 출처만 추가한다.
  - `'unsafe-inline'`과 `'unsafe-eval'`은 쓰지 않는다.
- **Permissions-Policy를 바꿔야 할 때**: 카메라(영수증 촬영)나 위치(소비 지도)를 직접 쓰게 되면 `camera=(self)`처럼 필요한 것만 연다.
- **`VITE_*` 환경변수**: 빌드 결과에 그대로 들어가 공개된다. 비밀값을 넣지 않는다.

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
  - 계획: Cloudflare에서 `<도메인>/api/*`를 Cloud Run으로 프록시해서 화면과 같은 origin으로 둔다. 그러면 CORS도 필요 없다.
- 쿠키 인증을 쓰면 상태를 바꾸는 요청에 CSRF 방어를 붙인다. SameSite와 Origin 검사, 또는 CSRF 토큰을 쓴다.

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
- 카드번호와 계좌번호는 화면에서 마스킹한다.
- 금융기관 접근 토큰은 3단계(금융 연동)에서 Cloud KMS 등으로 암호화해 저장한다. 평문으로 저장하지 않는다.
- Supabase Data API(PostgREST)는 꺼 둔 상태다. DB에는 API 서버를 통해서만 접근한다.
- 비밀값은 Secret Manager(운영)와 로컬 `.env`(커밋 안 됨)에만 둔다.
- 비밀값을 커밋하거나 붙여 넣었다면 지우는 것만으로는 부족하다. 즉시 폐기하고 새로 발급한다.

# API 호출 · 에러 처리 (`src/api`, `src/notifications`)

서버 에러 형식은 [`apps/api/README.md`](../../../api/README.md), 코드 목록은 `packages/shared/src/errors.ts`.

## 호출 규칙

- API는 **`apiFetch`로만** 부른다. `fetch('/api/...')`를 직접 쓰지 않는다.
  - `/api` 접두, `Accept: application/json`, `credentials: 'include'`, 15초 제한(`timeoutMs`).
  - body가 있으면 기본 POST + JSON. GET·HEAD에는 body를 넣을 수 없다. 204·빈 본문은 `undefined`.
  - 성공은 데이터 그대로, 실패는 언제나 `ApiError`(`code`·`message`·`details`·`requestId`·`status`·`retryAfterSec`·`cause`). 사용자가 취소한 요청만 abort 에러 그대로 던진다(`isAbort`).
- 화면에서는 TanStack Query로 감싼다. `signal`을 꼭 넘긴다(화면을 떠나면 요청이 취소된다). 쿼리 함수는 `undefined`를 돌려주면 안 되므로 204 응답 API는 뮤테이션으로만 부른다.

```tsx
const trip = useQuery({
  queryKey: ['trip', id],
  queryFn: ({ signal }) => apiFetch<Trip>(`/trips/${id}`, { signal }),
})

const save = useMutation({
  mutationFn: (input: TripInput) => apiFetch<Trip>('/trips', { body: input }),
})
```

- 실패는 전역 처리기(`handleApiError`)가 알아서 토스트를 띄운다. 화면이 직접 안내하면 `meta: { silent: true }`(쿼리·뮤테이션 둘 다). silent여도 401 처리는 한다.
- 쿼리 기본값: `staleTime` 30초, 재시도는 **연결 실패·시간 초과·5xx만 최대 2번**(1초 → 2초). 4xx(401·검증 실패·429 포함)는 바로 실패.
- 뮤테이션은 자동으로 다시 보내지 않는다. 시간 초과여도 서버에서는 처리됐을 수 있어서다. 다시 시도는 화면이 정한다(같은 요청을 두 번 보내도 안전할 때만).

## 에러 → 화면 반응

| code                                                   | 보내는 쪽          | 화면 반응                                                                   |
| ------------------------------------------------------ | ------------------ | --------------------------------------------------------------------------- |
| `UNAUTHENTICATED` (401)                                | 서버               | 토스트 없음. `onUnauthenticated` 처리기를 한 번만 부른다                    |
| `VALIDATION_FAILED` (400)                              | 서버               | 토스트 없음. 폼이 `fieldErrors`로 필드 옆에 보여 준다                       |
| `RATE_LIMITED` (429)                                   | 서버 · Cloudflare  | 오류 토스트. `Retry-After`가 있으면 "30초 뒤에 다시 시도해 주세요"          |
| `NETWORK_ERROR` (status 0)                             | 화면               | 오류 토스트 + 「다시 시도」(쿼리면 실패한 쿼리를 모두 다시 받는다)          |
| `TIMEOUT` (status 0)                                   | 화면               | 〃                                                                          |
| `UPSTREAM_UNAVAILABLE` (502·형식 없는 5xx)             | Worker · 화면      | 〃                                                                          |
| `CONSENT_REQUIRED` (403)                               | 서버               | 토스트 없음. 가입 동의 항목이면 재동의 화면, 연동 동의(FIN_*)면 그 화면이 동의 시트를 연다 |
| `CONSENT_REQUIRED` + `details.reason = NO_ACTIVE_PAYMENT_METHOD` | 서버     | 토스트 없음. 재동의 화면으로 가지 않는다. 결제 상세가 지갑 연결 흐름(missing 있으면 동의 시트, 없으면 계좌·카드 추가)으로 잇는다 — `isNoActivePaymentMethod` |
| `NOT_FOUND` (404) · `CONFLICT` (409)                   | 서버               | 안내 토스트(info), 서버 문구 그대로                                         |
| `FORBIDDEN` · `BAD_REQUEST` · `PAYLOAD_TOO_LARGE` 등   | 서버               | 오류 토스트, 서버 문구 그대로                                               |
| `INTERNAL_ERROR` (500) · 그 밖의 5xx                   | 서버               | 오류 토스트 + "(문의 번호 05c8d730)" — 요청 ID 앞 8자                       |
| `INVALID_RESPONSE`                                     | 화면               | 〃(요청 ID가 있을 때만 붙는다)                                              |
| 모르는 도메인 코드                                     | 서버               | status로: 404·409는 안내, 그 밖의 4xx는 오류, 5xx는 문의 번호               |
| `ApiError`가 아닌 에러                                 | 코드 버그          | "문제가 생겼어요. 잠시 후 다시 시도해 주세요"                               |

- 문구는 서버 `message`가 먼저다. 화면 전용 코드 4개의 고정 문구는 shared `CLIENT_ERRORS`에 있고 Worker 502도 같은 문구를 쓴다. 조합 문구는 `messages.ts`(`COPY`).
- 형식 없는 응답: 5xx HTML(Cloudflare 1xxx·502, Cloud Run 503)은 `UPSTREAM_UNAVAILABLE`, 그 밖은 `INVALID_RESPONSE`. 단 HTML 429는 Cloudflare rate limit이라 `RATE_LIMITED`로 본다.
- 같은 코드·문구 토스트는 떠 있는 동안 + 2초 안에는 다시 띄우지 않는다.
- 렌더링 중 에러는 `app/ErrorBoundary`가 「문제가 생겼어요 · 다시 시도」 화면으로 바꾼다(`ApiError`면 문의 번호). 배포 직후 옛 chunk를 못 받으면 「새 버전이 나왔어요 · 새로고침」.

## 폼 에러

```tsx
const save = useMutation({
  mutationFn: (input: TripInput) => apiFetch<Trip>('/trips', { body: input }),
  onError: (error) => {
    setErrors(fieldErrors(error)) // { title: '20자 이하로 적어 주세요', 'items.0.amount': '…' }
    const first = fieldErrorPaths(error)[0] // 서버가 보낸 순서
    if (first) (formRef.current?.elements.namedItem(first) as HTMLElement | null)?.focus()
  },
})
```

- 필드 이름(`name`)을 서버 DTO 경로와 같게 둔다(중첩은 `items.0.amount`).
- 한 필드에 제약 여러 개가 걸리면 첫 메시지만 담는다.
- 검증 실패는 전역 토스트가 없으니 폼이 꼭 보여 줘야 한다. `fields`에 없는 문제(서버 `message`만 있음)는 `errorMessage(error)`를 폼 위에 보여 준다.

## 토스트

```ts
import { toast } from '../notifications'

toast.success('초대코드를 복사했어요')
toast.info('공동 지출로 바꿨어요', { action: { label: '실행 취소', onClick: undo } })
toast.error('저장하지 못했어요', { durationMs: 8000 })
```

- 기본 3초, error 5초, `durationMs: Infinity`면 닫을 때까지. 동시에 최대 2개(넘치면 가장 오래된 것을 닫는다). 액션을 누르면 닫힌다. 포인터·포커스가 올라가 있는 동안은 시간이 멈춘다.
- 같은 type·문구는 중복 제거된다. 다르게 묶으려면 `dedupeKey`.
- `ToastHost`(main.tsx에 하나)가 DS `Toast` + `ToastViewport`로 그린다. 하단 내비가 있는 화면이 생기면 `aboveNav`를 켠다(지금은 끔).
- **열린 BottomSheet·Dialog 위에도 뜬다.** 토스트 층을 `popover="manual"` + `showPopover()`로 최상위 레이어에 올리고, 모달이 열려 있으면 맨 위 모달 `<dialog>` 안으로 옮겨 그린다. 모달 바깥은 inert라 popover만으로는 보이기만 하고 눌리지 않기 때문이다(누르면 아래 시트의 딤이 눌려 시트가 닫힌다). Popover API가 없는 브라우저는 z-50 고정 층으로 그린다.
- 시트가 열려 있으면 토스트가 시트 아래쪽 내용을 몇 초 가릴 수 있다. 중요한 확인은 토스트 말고 화면 안에 보여 준다.
- 카탈로그(`pnpm --filter @yeojeong/web catalog`)의 ToastHost 항목에서 시트·다이얼로그 위 동작을 볼 수 있다.

## 로그인 단계에서 이을 곳

- **401 처리기**: 앱 시작 때 한 번 단다. 여러 요청이 한꺼번에 401이어도 한 번만 불린다. 로그인을 마치거나 안내를 닫으면 `resetUnauthenticated()`.

  ```ts
  onUnauthenticated(() => {
    queryClient.clear() // 다른 사람 데이터가 남지 않게
    location.assign('/login') // 또는 로그인 시트 열기
  })
  ```

- **쿠키**: `apiFetch`는 이미 `credentials: 'include'`로 보낸다. 같은 origin이라 CORS 설정은 필요 없다. 세션 쿠키는 서버가 `HttpOnly; Secure; SameSite=Lax`로 내리고, 화면은 토큰을 직접 들고 있지 않는다.
- **CSRF**: 쿠키 인증이 붙으면 상태를 바꾸는 요청(POST·PUT·PATCH·DELETE)에 CSRF 방어가 필요하다(서버의 Origin 검사 또는 헤더 토큰). 헤더 토큰을 쓰기로 하면 `apiFetch`가 그 헤더를 붙이게 고친다(지금은 `Accept`·`Content-Type`만 보낸다).
- **카카오 프사**: `public/_headers`의 `img-src`에 카카오 CDN 호스트를 더한다(`src/ds/README.md`). `connect-src 'self'`는 그대로 둔다(카카오 로그인은 페이지 이동 + 서버 콜백).

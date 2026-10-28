# 화면 플로우 (`src/features`)

플로우 하나 = 폴더 하나. **중앙 파일(`app/router.tsx`·`mocks/handlers.ts`)은 고치지 않는다.** 라우트와 목 핸들러는 파일 이름으로 자동 수집된다.

```
features/<flow>/
  routes.tsx     export const routes: AppRoute[]        ← 자동 수집
  mocks.ts       export const handlers: HttpHandler[]   ← 자동 수집(테스트·개발 목)
  pages/         페이지 컴포넌트(default export, React.lazy로 연결)
  api.ts         이 플로우의 쿼리·뮤테이션(queryOptions 함수)
  types.ts       이 플로우에서만 쓰는 응답 타입
  *.test.tsx
```

폴더 배정: `core`(스플래시·헬스) · `auth`(로그인·가입·재동의) · `wallet`(지갑·토스 연결·환율) · `trips`(여정 없음·만들기·참여·수정·생성 완료) · `trip-info` · `payments` · `stats` · `settlement` · `me` · `legal`. 각 `routes.tsx`의 `PlaceholderPage`를 진짜 페이지로 바꾼다.

## 라우트

```tsx
import { lazy } from 'react'
import type { AppRoute } from '../../app/routes'

export const routes: AppRoute[] = [
  { layout: 'trip', path: '/trips/:tripId/stats', Component: lazy(() => import('./pages/StatsPage')) },
]
```

- `path`는 `/`로 시작하는 전체 경로. 하위 라우트(`children`)도 전체 경로로 적는다(예: 결제 상세 시트 `/trips/:tripId/payments/:expenseId`).
- `layout`이 가드·틀을 정한다: `public`(가드 없음) · `guest`(/login) · `signup`(가입 티켓) · `auth`(로그인) · `trip`(로그인 + 여정 멤버 + 앱 셸) · `trip-page`(로그인 + 여정 멤버, 셸 없음 Back 헤더 서브페이지). `/trips/:tripId/…`는 `trip`·`trip-page`만.
- 중복 경로·규칙 위반은 `app/router.test.ts`가 잡는다.
- 주소는 `app/paths.ts`의 `paths.*`로 만든다(`paths.payment(tripId, expenseId)`). 로그인 뒤 돌아올 주소는 `safeReturnTo()`로 거른다.

## 세션 · 여정

| import | 쓰임 |
| --- | --- |
| `useSession()` (`app/session`) | `{ isAuthenticated, signupRequired, user, data, reconsentRequired, isPending, error, refetch }` |
| `useMyTrips()` (`app/trip`) | `GET /me/trips`. 정렬은 `sortTrips(items)` |
| `useTripDetail()` | `trip`·`trip-page` 레이아웃 안에서 지금 여정(`TripDetail`, 항상 있음) |
| `useTrip(tripId)` · `tripQuery(tripId)` | `GET /trips/:tripId` |
| `useCurrentTrip()` | 셸 밖(/wallet·/me)에서 지금 여정: URL → 이 기기에서 마지막으로 본 여정 → 진입 규칙 |
| `tripTabs(status)` · `defaultTab(status)` · `isTabOpen(status, tab)` | 단계별 탭·잠금(FR-001) |

- 가드가 401·가입 단계·재동의(`/reconsent?required=…&returnTo=…`)를 처리한다. 화면은 신경 쓰지 않는다.
- 로그인·가입·로그아웃이 끝나면 `queryClient.invalidateQueries({ queryKey: keys.session })`(로그아웃은 `queryClient.clear()`).
- 여정을 바꾸는 뮤테이션 뒤에는 `invalidateQueries({ queryKey: keys.trips.detail(tripId) })` — 그 여정의 결제·현황·정산 키가 모두 이 키로 시작한다. 목록이 바뀌면 `keys.trips.list`.

## API 호출 · 에러

- `apiFetch` + TanStack Query만 쓴다(`src/api/README.md`). 키는 `keys.*`(`src/api/keys.ts`), 응답 타입은 `src/api/types.ts`(부록 B 임시본 — 서버 1차가 shared에 넣으면 교체).
- 실패 토스트는 전역 처리기가 띄운다. 폼은 `fieldErrors(error)`로 필드 옆에, 화면이 직접 안내하면 `meta: { silent: true }`.
- 성공 알림은 `toast.success('복사했어요')`(`src/notifications`). 셸 안에서는 자동으로 하단 탭 위에 뜬다.
- 연동 동의(FIN_*)의 `CONSENT_REQUIRED`는 전역 이동이 없다. 지갑 화면이 `consentRequiredIds(error)`로 보고 WF-05b 시트를 연다.

## 화면 틀

- 셸 밖 화면은 DS `Screen` + `TopHeader(type="back"|"logo")`로 직접 조립한다.
- `trip` 레이아웃 페이지는 셸(`Screen` + `TopHeader` group + `BottomNav`) 안 본문만 그린다. 셸은 거터가 없으니 페이지가 `px-gutter`를 붙인다.
- 상태 화면: `LoadingScreen`(셸 안은 `inset`) · `ErrorScreen` · `NotFoundScreen` (`app/states`).
- 설명형 마이크로카피 금지. 문구는 화면명세 0-9.

## 목(MSW)

- 개발: `VITE_MOCK_API=1 pnpm --filter @yeojeong/web dev`. 로그인 전 화면은 콘솔에서 `localStorage.setItem('yj:mock:session', 'ANONYMOUS')` 후 새로고침.
- 데이터: `src/mocks/data.ts`의 `db`(샘플: 오사카 진행 중 · 부산 시작 전 · 제주 종료, 준용=나). 응답 모양은 `tripDetail()`·`expenseListItem()`·`visibleExpenses()`(I-8 가시성) 등. 핸들러가 `db`를 고쳐도 테스트마다 되돌린다.
- 헬퍼: `mockError(code, status?, details?)`(서버 에러 형식), `denyUnlessAuthenticated()`, `requireMember(tripId)`(비멤버 404) — `src/mocks/utils.ts`.

```ts
import { http, HttpResponse, type HttpHandler } from 'msw'
import { requireMember } from '../../mocks/utils'

export const handlers: HttpHandler[] = [
  http.get('/api/trips/:tripId/summary', ({ params }) => {
    const { denied } = requireMember(String(params.tripId))
    if (denied) return denied
    return HttpResponse.json({ /* … */ })
  }),
]
```

## 테스트

- MSW가 모든 테스트에서 켜져 있다. 핸들러 없는 요청은 실패. 한 테스트만 바꾸려면 `server.use(http.get(…, () => mockError('VERSION_CONFLICT', 409)))`.
- `renderWithProviders(<Page />, { route: '/trips/trip-osaka/stats', path: '/trips/:tripId/stats' })` — 컴포넌트 하나.
- `renderApp('/trips/trip-osaka/payments')` — 가드·셸 포함 앱 전체. `router.state.location`으로 이동을 본다.
- 샘플 ID: `TRIP.osaka`·`MEMBER.junyong`·`USER.minji` 등(`src/mocks/data.ts`).

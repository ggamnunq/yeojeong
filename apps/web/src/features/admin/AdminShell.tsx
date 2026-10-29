import { clsx } from 'clsx'
import { Navigate, NavLink, Outlet, useLocation, useNavigate } from 'react-router'
import { LoadingScreen } from '../../app/states'
import { Button, Logo } from '../../ds'
import { focusRing } from '../../ds/styles'
import { isAdminUnauthenticated } from './api'
import { ErrorText } from './components'
import { formatDateTime } from './format'
import { useAdminLogout, useAdminSession } from './hooks'
import { adminPaths } from './paths'

const NAV = [
  { to: adminPaths.users(), label: '회원' },
  { to: adminPaths.codef(), label: 'CODEF 현황' },
  { to: adminPaths.cardImport(), label: '카드 불러오기 권한' },
]

/** 관리자 세션이 있어야 하는 화면의 틀: 헤더(메뉴 · 로그아웃) + 넓은 본문. 세션이 없으면 AdminLayout이 로그인으로 보낸다 */
export default function AdminShell() {
  const session = useAdminSession()
  const logout = useAdminLogout()
  const navigate = useNavigate()
  const location = useLocation()

  if (session.isPending) return <LoadingScreen />
  // AdminLayout도 같은 이동을 하지만, 세션 확인 실패는 여기서도 확실히 로그인으로 보낸다
  if (session.isError && isAdminUnauthenticated(session.error)) {
    return <Navigate to={adminPaths.login(`${location.pathname}${location.search}`)} replace />
  }
  if (session.isError) {
    return (
      <main className="mx-auto flex min-h-svh w-full max-w-[1200px] flex-col gap-4 px-4 py-10">
        <ErrorText error={session.error} />
        <Button type="secondary" size="m" label="다시 시도" className="self-start" onClick={() => void session.refetch()} />
      </main>
    )
  }

  // 로그인 화면으로 옮긴다. 관리자 캐시는 로그인 화면이 열리면서 통째로 비운다(여기서 비우면 아직 붙어 있는 세션 쿼리가 다시 돈다)
  const onLogout = () => logout.mutate(undefined, { onSettled: () => void navigate(adminPaths.login(), { replace: true }) })

  return (
    <div className="min-h-svh bg-canvas">
      <header className="border-b border-default bg-surface">
        <div className="mx-auto flex w-full max-w-[1200px] flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3 md:px-8">
          <div className="flex items-center gap-2">
            <Logo height={24} />
            <span className="text-body-m-strong text-primary">관리자</span>
          </div>
          <nav aria-label="관리자 메뉴" className="flex items-center gap-1">
            {NAV.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  clsx(
                    'rounded-sm px-3 py-2 text-label-m',
                    focusRing,
                    isActive ? 'bg-brand-subtle text-brand' : 'text-secondary hover:bg-subtle',
                  )
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-3">
            <span className="hidden text-caption text-tertiary sm:inline">
              세션 만료 {formatDateTime(session.data.expiresAt)}
            </span>
            <Button type="secondary" size="s" label="로그아웃" state={logout.isPending ? 'loading' : 'default'} onClick={onLogout} />
          </div>
        </div>
      </header>
      <main className="mx-auto flex w-full max-w-[1200px] min-w-0 flex-col gap-8 px-4 py-6 md:px-8">
        <Outlet />
      </main>
    </div>
  )
}

import { Outlet, useNavigate } from 'react-router'
import { Screen, TopHeader } from '../ds'

export type PlaceholderPageProps = {
  title: string
  /** 앱 셸(trip layout) 안이면 true: 헤더 없이 본문만 */
  inShell?: boolean
}

/** 아직 만들지 않은 화면 자리. 플로우가 진짜 페이지로 바꾼다. 하위 라우트(시트)가 있으면 Outlet으로 그린다 */
export function PlaceholderPage({ title, inShell = false }: PlaceholderPageProps) {
  const navigate = useNavigate()
  if (inShell) {
    return (
      <div className="px-gutter">
        <h2 className="py-6 text-h3 text-primary">{title}</h2>
        <Outlet />
      </div>
    )
  }
  return (
    <Screen header={<TopHeader type="back" title={title} onBack={() => navigate(-1)} />}>
      <Outlet />
    </Screen>
  )
}

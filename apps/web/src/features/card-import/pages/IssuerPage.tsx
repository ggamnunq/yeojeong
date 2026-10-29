import { clsx } from 'clsx'
import { useEffect } from 'react'
import { Navigate } from 'react-router'
import { paths } from '../../../app/paths'
import { LoadingScreen } from '../../../app/states'
import { Icon, ShellSub } from '../../../ds'
import { focusRing } from '../../../ds/styles'
import { toast } from '../../../notifications'
import { COPY } from '../copy'
import { useFlowNav } from '../flow'
import { useCardImportConfig } from '../hooks'
import { IssuerTile } from '../components'
import { visibleOrganizations } from '../rules'

/**
 * WF-52 카드사 선택(Figma HF-52 99:13972, v0.7.6): 세로 목록 9행 — Figma 순서로 화면이 정렬(visibleOrganizations, 서버는 기관 코드 순).
 * 행 = Tile/Issuer 40(흰 원 + 1px 테두리 + 로고 원색, 삼성·롯데·현대는 이니셜) + 이름 + ›, 높이 64 · 행 간격 8.
 * 탭 즉시 WF-53(현대·하나는 WF-53h). config를 못 받으면 Toast + WF-51
 */
export default function IssuerPage() {
  const flow = useFlowNav()
  const config = useCardImportConfig()
  const failed = config.isError

  useEffect(() => {
    if (failed) toast.error(COPY.later)
  }, [failed])
  if (failed) return <Navigate replace to={paths.walletImport()} state={flow.navState()} />

  return (
    <ShellSub header={{ title: COPY.issuerTitle, onBack: () => flow.go(paths.walletImport()) }} gutter={false}>
      {config.data ? (
        <ul className="flex flex-col gap-2">
          {visibleOrganizations(config.data.organizations).map((org) => (
            <li key={org.code}>
              <button
                type="button"
                onClick={() => flow.go(paths.walletImportLogin(org.code))}
                className={clsx('flex h-16 w-full items-center gap-3.5 px-gutter text-left active:bg-subtle', focusRing)}
              >
                <IssuerTile org={org} />
                <span className="min-w-0 flex-1 truncate text-body-m text-primary">{org.name}</span>
                <Icon name="chevron-right" size={20} className="shrink-0 text-icon-subtle" />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <LoadingScreen inset gutter />
      )}
    </ShellSub>
  )
}

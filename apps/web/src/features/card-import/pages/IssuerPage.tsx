import { clsx } from 'clsx'
import { useEffect } from 'react'
import { paths } from '../../../app/paths'
import { LoadingScreen } from '../../../app/states'
import { Icon, ShellSub } from '../../../ds'
import { focusRing } from '../../../ds/styles'
import { toast } from '../../../notifications'
import { COPY } from '../copy'
import { useFlowNav } from '../flow'
import { useCardImportConfig } from '../hooks'
import { orgMark } from '../rules'

/**
 * WF-52 카드사 선택: 세로 목록(서버 응답 순서, 7곳). 행 = 중성 마크 40(회색 원 + 이니셜) + 이름 + ›, 행 간격 8.
 * 공식 로고·브랜드색은 쓰지 않는다. 탭 즉시 WF-53. config를 못 받으면 Toast + WF-51
 */
export default function IssuerPage() {
  const flow = useFlowNav()
  const config = useCardImportConfig()
  const failed = config.isError

  useEffect(() => {
    if (!failed) return
    toast.error(COPY.later)
    flow.go(paths.walletImport())
    // flow는 렌더마다 새 객체 — 실패로 바뀔 때 한 번만
  }, [failed])

  return (
    <ShellSub header={{ title: COPY.issuerTitle, onBack: () => flow.go(paths.walletImport()) }} gutter={false}>
      {config.data ? (
        <ul className="flex flex-col gap-2">
          {config.data.organizations.map((org) => (
            <li key={org.code}>
              <button
                type="button"
                onClick={() => flow.go(paths.walletImportLogin(org.code))}
                className={clsx('flex h-16 w-full items-center gap-3.5 px-gutter text-left active:bg-subtle', focusRing)}
              >
                <span aria-hidden className="flex size-10 shrink-0 items-center justify-center rounded-full bg-subtle text-body-s text-secondary">
                  {orgMark(org)}
                </span>
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

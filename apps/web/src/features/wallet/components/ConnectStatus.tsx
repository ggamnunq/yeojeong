import type { ReactNode } from 'react'
import { IconButton, ProgressSteps, Screen, type ProgressStepsStep } from '../../../ds'

// HF-06처럼 왼쪽이 ✕인 온보딩 셸. DS ShellOnboarding은 ‹만 있어 Screen으로 같은 틀(헤더 56 · 가운데 진행 막대 · 내용 위 24)을 조립한다.
// TODO(DS 추가 요청): ShellOnboarding에 back 아이콘 close 변형이 생기면 그것으로 바꾼다.
export type CloseOnboardingShellProps = {
  onClose: () => void
  progress?: ProgressStepsStep
  /** 하단 버튼 줄(Secondary 등 Primary가 아닌 CTA) */
  footer?: ReactNode
  children: ReactNode
}

export function CloseOnboardingShell({ onClose, progress, footer, children }: CloseOnboardingShellProps) {
  return (
    <Screen
      background="surface"
      header={
        <header className="relative flex h-header-height items-center bg-surface pr-2 pl-1">
          <IconButton size="m" icon="close" label="닫기" onClick={onClose} />
          {progress && <ProgressSteps step={progress} className="absolute top-1/2 left-1/2 -translate-1/2" />}
        </header>
      }
      contentClassName="pt-6"
    >
      {children}
      {footer && <div className="sticky bottom-0 bg-surface pt-3 pb-[calc(--spacing(4)+env(safe-area-inset-bottom))]">{footer}</div>}
    </Screen>
  )
}

/** 일러스트 + 제목(H2) + 한 줄, 화면 가운데(HF-06 · HF-08) */
export function ConnectStatus({ illust, title, sub }: { illust: ReactNode; title: ReactNode; sub?: ReactNode }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 pb-10 text-center">
      {illust}
      <div className="flex flex-col gap-1">
        <h1 className="text-h2 text-primary">{title}</h1>
        {sub && <p className="text-body-m text-secondary">{sub}</p>}
      </div>
    </div>
  )
}

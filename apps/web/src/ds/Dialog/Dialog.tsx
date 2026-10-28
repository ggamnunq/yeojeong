import { clsx } from 'clsx'
import { useId, type ReactNode } from 'react'
import { Button } from '../Button/Button'
import { useModalDialog } from '../useModalDialog'

// Figma Dialog(24:8719) · Type=Default/Danger/SharedToPersonal. 되돌리기 어려운 결정 확인.
// 폭 320, radius/xl, Elevation/3, 패딩 28/24/20/24 · 제목 H3 → 한 줄 Body/S(text/secondary) → 버튼 둘(Secondary M | Primary·Danger M, 간격 8).
export type DialogType = 'default' | 'danger' | 'shared-to-personal'

// SharedToPersonal은 문구까지 정해진 변형이다(spec v1.3.1 C-09)
const SHARED_TO_PERSONAL = {
  title: '개인 결제로 바꿀까요?',
  message: '다른 멤버의 내역과 정산에서 빠져요',
  confirmLabel: '바꾸기',
}

type DialogCopy = { cancelLabel?: ReactNode; className?: string } & (
  | { type?: 'default' | 'danger'; title: ReactNode; message: ReactNode; confirmLabel: ReactNode }
  | { type: 'shared-to-personal'; title?: ReactNode; message?: ReactNode; confirmLabel?: ReactNode }
)

export type DialogPanelProps = DialogCopy & {
  onCancel?: () => void
  onConfirm?: () => void
  titleId?: string
  messageId?: string
}

/** 다이얼로그의 겉모습만(모달 동작 없음). Dialog 안에서 쓰고, 카탈로그에서 고정해 보여 줄 때 쓴다. */
export function DialogPanel({ cancelLabel = '취소', onCancel, onConfirm, titleId, messageId, className, ...copy }: DialogPanelProps) {
  const type: DialogType = copy.type ?? 'default'
  const preset = type === 'shared-to-personal' ? SHARED_TO_PERSONAL : undefined
  return (
    <div
      className={clsx(
        'flex w-80 max-w-full flex-col gap-2 rounded-xl bg-surface px-6 pt-7 pb-5 shadow-elevation-3',
        className,
      )}
    >
      <h2 id={titleId} className="text-h3 text-primary">
        {copy.title ?? preset?.title}
      </h2>
      <p id={messageId} className="text-body-s text-secondary">
        {copy.message ?? preset?.message}
      </p>
      {/* Figma: 문구와 버튼 사이 spacer 12 + 간격 8×2 = 28 */}
      <div className="mt-5 flex gap-2">
        <Button type="secondary" size="m" label={cancelLabel} onClick={onCancel} className="min-w-0 flex-1" />
        <Button
          type={type === 'danger' ? 'danger' : 'primary'}
          size="m"
          label={copy.confirmLabel ?? preset?.confirmLabel}
          onClick={onConfirm}
          className="min-w-0 flex-1"
        />
      </div>
    </div>
  )
}

export type DialogProps = DialogCopy & {
  open: boolean
  /** 취소 버튼 · ESC · 뒤로 가기. 딤을 눌러서는 닫히지 않는다(결정을 실수로 넘기지 않게). */
  onCancel: () => void
  onConfirm: () => void
}

export function Dialog({ open, onCancel, onConfirm, className, ...copy }: DialogProps) {
  const titleId = useId()
  const messageId = useId()
  const { dialogProps } = useModalDialog(open, onCancel)

  return (
    <dialog
      {...dialogProps}
      role="alertdialog"
      aria-labelledby={titleId}
      aria-describedby={messageId}
      className={clsx(
        'group/dialog fixed inset-0 m-0 size-full max-h-none max-w-none overflow-hidden bg-transparent p-0 text-primary backdrop:bg-transparent',
        // 닫힐 때 애니메이션이 끝날 때까지 최상위 레이어에 남겨 둔다
        'transition-[display,overlay] transition-discrete duration-150 motion-reduce:transition-none',
      )}
    >
      <div
        aria-hidden
        className="absolute inset-0 bg-dim opacity-0 transition-opacity duration-150 group-open/dialog:opacity-100 motion-reduce:transition-none starting:group-open/dialog:opacity-0"
      />
      <div className="absolute inset-0 flex items-center justify-center px-gutter">
        <DialogPanel
          {...copy}
          className={clsx(
            'scale-95 opacity-0 transition-[opacity,scale] duration-150 ease-out group-open/dialog:scale-100 group-open/dialog:opacity-100 motion-reduce:transition-none starting:group-open/dialog:scale-95 starting:group-open/dialog:opacity-0',
            className,
          )}
          titleId={titleId}
          messageId={messageId}
          onCancel={onCancel}
          onConfirm={onConfirm}
        />
      </div>
    </dialog>
  )
}

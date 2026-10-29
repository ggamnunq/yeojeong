import { BottomSheet } from '../../../ds'
import type { InvitePreview } from '../types'
import { InvitePreviewCard } from './InvitePreviewCard'

export type InviteResponseSheetProps = {
  /** 열린 동안의 미리보기. null이면 닫힘 */
  preview: InvitePreview | null
  /** 참여 요청 중(「참여하기」 로딩) */
  joining: boolean
  onJoin: () => void
  /** 「취소」 · ESC · 딤 · 뒤로 가기 — 참여하지 않고 시트만 닫는다 */
  onCancel: () => void
}

/**
 * HF-62 초대 응답 시트(W8 · Figma 141:16632): 제목 "{그룹 이름}에 참여할까요?"(✕ 없음) · 미리보기 카드 → 24 →
 * 하단 가로 2버튼 「취소」(Secondary) · 「참여하기」(Primary). 첫 화면(여정 결제내역·여정 정보 또는 HF-09) 위에 뜬다
 */
export function InviteResponseSheet({ preview, joining, onJoin, onCancel }: InviteResponseSheetProps) {
  return (
    <BottomSheet
      open={preview !== null}
      onClose={() => {
        if (!joining) onCancel()
      }}
      close={false}
      title={preview ? `${preview.groupName}에 참여할까요?` : ''}
      cta={{
        layout: 'horizontal',
        secondary: { label: '취소', onClick: onCancel, disabled: joining },
        primary: { label: '참여하기', onClick: onJoin, state: joining ? 'loading' : 'default' },
      }}
    >
      {preview && <InvitePreviewCard className="mb-1" preview={preview} />}
    </BottomSheet>
  )
}

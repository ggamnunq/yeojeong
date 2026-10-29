import { useState } from 'react'
import { BottomSheet } from '../../../ds'
import { copyInviteLink, joinUrl } from '../invite'
import { formatInviteCode } from '../rules'
import { InviteQr } from './InviteQr'

export type InviteQrSheetProps = {
  open: boolean
  onClose: () => void
  groupName: string
  /** 저장 형식 초대코드 "K7M2QX". 재발급되면 새 값으로 다시 그린다 */
  code: string
}

/**
 * HF-61 초대 QR 시트(W8 · Figma 141:16530): 제목 "초대 QR" + ✕ · QR 200(참여 링크 /join#code=…) · 초대코드 32 · CTA 「링크 복사」.
 * 링크 복사 내용은 공유와 같다("{그룹명} 초대코드 K7M-2QX" + 참여 링크), 토스트 "복사했어요".
 * 폰 카메라로 찍으면 참여 링크가 열리고 응답 시트(HF-62)가 뜬다
 */
export function InviteQrSheet({ open, onClose, groupName, code }: InviteQrSheetProps) {
  // 처음 열 때 그린다(QR 계산·숨은 코드 글자를 화면마다 미리 만들지 않게). 닫을 때는 애니메이션이 끝나도록 남겨 둔다
  const [shown, setShown] = useState(open)
  if (open && !shown) setShown(true)
  if (!shown) return null
  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title="초대 QR"
      cta={{ label: '링크 복사', onClick: () => void copyInviteLink({ groupName, code }) }}
    >
      {/* Figma SheetContent/InviteQR(140:16478): 위 4 · 타일 234 → 20 → 코드 Amount/L 32(자간 4) */}
      <div className="flex flex-col items-center gap-5 pt-1">
        <InviteQr value={joinUrl(code)} label={`${groupName} 참여 QR 코드`} />
        <p className="font-amount text-amount-l tracking-[4px] whitespace-nowrap text-amount-default">
          {formatInviteCode(code)}
        </p>
      </div>
    </BottomSheet>
  )
}

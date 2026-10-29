import { useState } from 'react'
import { useNavigate } from 'react-router'
import type { MemberSummary, TripDetail } from '../../api'
import { paths } from '../../app/paths'
import { toPerson } from '../../app/person'
import { rememberTripId } from '../../app/trip'
import { Dialog, Icon, orderMembers, PanelSide, RowMember, RowTone } from '../../ds'
import { InviteQrButton } from '../trips/components/InviteQrButton'
import { InviteQrSheet } from '../trips/components/InviteQrSheet'
import { toast } from '../../notifications'
import { useKickMember, useLeaveGroup } from './api'
import { canKick, formatInviteCode, leaveMessage } from './rules'

export type MemberPanelProps = {
  open: boolean
  onClose: () => void
  trip: TripDetail
}

/** HF-15 그룹원 패널(FR-206·207·208·202): 멤버(나 먼저 → 가입 순) · 강퇴(그룹장) · 초대코드 [초대 QR](W8 → HF-61) · 복사 · 그룹 나가기 */
export function MemberPanel({ open, onClose, trip }: MemberPanelProps) {
  const navigate = useNavigate()
  const [kickTarget, setKickTarget] = useState<MemberSummary | null>(null)
  const [leaving, setLeaving] = useState(false)
  const [qrOpen, setQrOpen] = useState(false)
  const kick = useKickMember(trip)
  const leave = useLeaveGroup(trip)
  const members = orderMembers(trip.members.filter((m) => !m.isLeft).map((m) => ({ ...toPerson(m), member: m })))

  const copyInviteCode = async (code: string) => {
    try {
      await navigator.clipboard.writeText(formatInviteCode(code))
      toast.success('복사했어요')
    } catch {
      toast.error('복사하지 못했어요')
    }
  }

  const confirmKick = () => {
    const target = kickTarget
    if (!target || kick.isPending) return
    kick.mutate(target, {
      onSuccess: () => toast.success(`${target.nickname}님을 내보냈어요`),
      onSettled: () => setKickTarget(null),
    })
  }

  const confirmLeave = () => {
    if (leave.isPending) return
    leave.mutate(undefined, {
      onSuccess: () => {
        setLeaving(false)
        onClose()
        rememberTripId(null)
        navigate(paths.splash(), { replace: true })
      },
      onError: () => setLeaving(false),
    })
  }

  return (
    <>
      <PanelSide open={open} onClose={onClose} title={`그룹원 ${members.length}명`}>
        <div className="flex flex-col pt-2">
          {members.map(({ member, ...person }) => (
            <RowMember
              key={member.membershipId}
              person={person}
              leader={member.role === 'LEADER'}
              kick={canKick(trip, member) ? { onClick: () => setKickTarget(member) } : undefined}
            />
          ))}
        </div>
        {trip.inviteCode && (
          <div className="px-5 pt-6">
            <RowTone
              label="초대코드"
              value={formatInviteCode(trip.inviteCode)}
              accessory={<InviteQrButton size="s" onClick={() => setQrOpen(true)} />}
              action={{
                label: '복사',
                icon: 'copy',
                'aria-label': '초대코드 복사',
                onClick: () => void copyInviteCode(trip.inviteCode!),
              }}
            />
          </div>
        )}
        <div aria-hidden className="min-h-6 flex-1" />
        <button
          type="button"
          onClick={() => setLeaving(true)}
          className="flex w-full shrink-0 items-center gap-2 px-5 py-3 text-left select-none active:bg-pressed"
        >
          <Icon name="logout" size={20} className="shrink-0 text-icon-subtle" />
          <span className="text-body-m text-secondary">그룹 나가기</span>
        </button>
      </PanelSide>

      {trip.inviteCode && (
        <InviteQrSheet open={qrOpen} onClose={() => setQrOpen(false)} groupName={trip.groupName} code={trip.inviteCode} />
      )}
      <Dialog
        open={kickTarget !== null}
        type="danger"
        title={`${kickTarget?.nickname ?? ''}님을 내보낼까요?`}
        message="부담한 금액은 정산에 남아요"
        confirmLabel="내보내기"
        confirmState={kick.isPending ? 'loading' : 'default'}
        onCancel={() => {
          if (!kick.isPending) setKickTarget(null)
        }}
        onConfirm={confirmKick}
      />
      <Dialog
        open={leaving}
        type="danger"
        title="그룹에서 나갈까요?"
        message={leaveMessage(trip)}
        confirmLabel="나가기"
        confirmState={leave.isPending ? 'loading' : 'default'}
        onCancel={() => {
          if (!leave.isPending) setLeaving(false)
        }}
        onConfirm={confirmLeave}
      />
    </>
  )
}

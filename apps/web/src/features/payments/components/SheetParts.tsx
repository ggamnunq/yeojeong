import { clsx } from 'clsx'
import type { ReactNode } from 'react'
import { Avatar, AvatarStack, avatarStackLabel, Button, formatKrw, Tag, type AvatarPerson } from '../../../ds'
import { focusRing, touchTarget } from '../../../ds/styles'
import { kst, refundDetailLine } from '../rules'
import type { PaymentDetail } from '../types'

// 결제 상세 시트의 DS에 없는 조각(화면명세 부록 A · WF-41, Figma HF-41 24:59990). DS 추가 요청: SheetContent/ReadOnly의 환불 변형.

/** 상세 줄 + 중복 의심 태그 + (결제자면) "표시 해제"(C-11 · Q-20: 태그 줄 오른쪽 텍스트 버튼) */
export function DetailText({
  line,
  duplicate,
  onDismiss,
  dismissing = false,
}: {
  line: string
  duplicate: boolean
  onDismiss?: () => void
  dismissing?: boolean
}) {
  if (!duplicate) return line
  return (
    <>
      {line}
      <Tag type="duplicate" size="s" className="ml-1.5 align-middle" />
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          disabled={dismissing}
          className={clsx('ml-2 align-middle text-label-s text-brand disabled:text-disabled', focusRing, touchTarget)}
        >
          표시 해제
        </button>
      )}
    </>
  )
}

/** 환불 묶음 머리: 영웅 합계(Amount/L) → "¥0 · 11.13 (금)" → 결제/취소 톤 카드(동작이 라벨, 시각은 보조) */
export function RefundSummary({ detail }: { detail: PaymentDetail }) {
  const refunds = [...detail.refunds].sort((a, b) => a.occurredAt.localeCompare(b.occurredAt))
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-0.5">
        <p className="font-amount text-amount-l text-amount-default">{formatKrw(detail.krwAmount)}</p>
        <p className="text-caption text-tertiary">{refundDetailLine(detail)}</p>
      </div>
      <dl className="flex flex-col gap-3 rounded-lg bg-subtle p-4">
        <BreakdownLine label="결제" time={kst(detail.occurredAt).time} amount={detail.grossKrwAmount} />
        {refunds.map((r) => (
          <BreakdownLine key={r.id} label="취소" time={kst(r.occurredAt).time} amount={r.krwAmount} quiet />
        ))}
      </dl>
    </div>
  )
}

function BreakdownLine({ label, time, amount, quiet = false }: { label: string; time: string; amount: number; quiet?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <dt className="flex items-center gap-2">
        <span className={clsx('text-body-m', quiet ? 'text-secondary' : 'text-primary')}>{label}</span>
        <span className="text-body-s text-tertiary">{time}</span>
      </dt>
      <dd className={clsx('font-amount text-amount-s whitespace-nowrap', quiet ? 'text-secondary' : 'text-amount-default')}>
        {formatKrw(amount)}
      </dd>
    </div>
  )
}

/** 환불 묶음 키-값(선 없음): 결제자 · 부담 인원 n명 · 1인 */
export function RefundFacts({ payer, participants, perPerson }: { payer: AvatarPerson; participants: readonly AvatarPerson[]; perPerson: number | null }) {
  return (
    <dl className="flex flex-col gap-3.5">
      <Fact label="결제자">
        <Avatar {...payer} size="s" ring alt="" />
        <span className="truncate text-body-m-strong text-primary">{payer.me ? '나' : payer.name}</span>
        {payer.left && <Tag type="left" size="s" />}
      </Fact>
      {participants.length > 0 && (
        <Fact label={`부담 인원 ${participants.length}명`}>
          <AvatarStack people={participants} size="s" label={`부담 인원 ${avatarStackLabel(participants)}`} />
        </Fact>
      )}
      {perPerson !== null && (
        <Fact label="1인">
          <span className="font-amount text-amount-s whitespace-nowrap text-amount-default">{formatKrw(perPerson)}</span>
        </Fact>
      )}
    </dl>
  )
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-h-7 items-center gap-2">
      <dt className="shrink-0 text-body-s-strong text-primary">{label}</dt>
      <dd className="ml-auto flex min-w-0 items-center gap-2">{children}</dd>
    </div>
  )
}

/** 종료 후 잠금 버튼(HF-39) */
export const LockedButton = () => (
  <Button type="secondary" size="l" disabled leadingIcon icon="lock" label="변경 불가" className="w-full" />
)

/** 결제자 본인의 개인 결제를 종료 후 열었을 때: 금액 · 상세 줄 · "변경 불가"(태그 없음, WF-39 제안) */
export function LockedPersonal({ amount, detail }: { amount: number; detail: ReactNode }) {
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-0.5">
        <p className="font-amount text-amount-l text-amount-default">{formatKrw(amount)}</p>
        <p className="text-caption text-tertiary">{detail}</p>
      </div>
      <LockedButton />
    </div>
  )
}

/** 상세 응답 전: 목록에서 받은 금액만 먼저, 나머지는 자리 */
export function SheetSkeleton({ amount }: { amount?: number }) {
  return (
    <div role="status" aria-label="불러오는 중" aria-busy="true" className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        {amount !== undefined ? (
          <p className="font-amount text-amount-l text-amount-default">{formatKrw(amount)}</p>
        ) : (
          <div className="h-10 w-40 animate-pulse rounded-sm bg-muted motion-reduce:animate-none" />
        )}
        <div className="h-3 w-2/3 animate-pulse rounded-sm bg-muted motion-reduce:animate-none" />
      </div>
      <div className="h-11 animate-pulse rounded-full bg-muted motion-reduce:animate-none" />
    </div>
  )
}

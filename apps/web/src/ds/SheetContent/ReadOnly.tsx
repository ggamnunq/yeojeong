import { clsx } from 'clsx'
import type { HTMLAttributes, ReactNode } from 'react'
import { Avatar } from '../Avatar/Avatar'
import type { AvatarPerson } from '../Avatar/rules'
import { AvatarStack } from '../AvatarStack/AvatarStack'
import { avatarStackLabel } from '../AvatarStack/rules'
import { Button } from '../Button/Button'
import { formatKrw } from '../format'
import { Tag } from '../Tag/Tag'
import { splitEvenly } from './rules'

// Figma SheetContent/ReadOnly(세트 59:10351 · Default 24:68666 · Refund 59:10278, v1.6) · Type=Default/Refund + Locked · Changed.
// BottomSheet Content 슬롯용 결제 상세(편집 불가). 버튼이 없는 것으로 읽기 전용을 전한다("읽기 전용" 태그 없음). 제목(가맹점명)·닫기는 BottomSheet가 맡는다.
// Default = 결제자가 아닌 멤버가 연 공동 결제 · 종료 후 잠금 · 결제자가 나간 결제.
//   금액(Amount/L) → 상세 줄(+ "변경됨") → 톤 카드(결제 = 프사 + 이름 · 부담 = 스택 + n명 · 1인) → Locked면 비활성 "변경 불가".
// Refund = 환불 묶음(HF-41). 금액(순액, 보통 ₩0) → 상세 줄 → 톤 블록(결제 · 취소 n건: 동작 Body/M + 시각 Caption … 금액 Amount/S, 취소는 −·보조색)
//   → 면 없는 키-값(결제자 · 부담 인원 n명 · 1인). 버튼 없음(Locked 무시).
export type SheetContentReadOnlyType = 'default' | 'refund'

/** 환불 묶음의 결제·취소 한 줄. amount는 원화 크기(취소도 양수로 넘기면 −로 그린다) */
export type SheetContentReadOnlyEntry = { time: ReactNode; amount: number }

export type SheetContentReadOnlyProps = Omit<HTMLAttributes<HTMLDivElement>, 'children'> & {
  /** Figma Type. 기본 default */
  type?: SheetContentReadOnlyType
  /** 원화 금액 — Figma amount. refund는 결제 − 취소 순액 */
  amount: number
  /** Figma detail: "¥2,860 · 11.13 14:10"(결제자가 아니면 결제수단 없음) · 환불 "¥0 · 11.13 (금)" */
  detail: ReactNode
  /** Figma Changed: 상세 줄 끝 "변경됨" */
  changed?: boolean
  /** Figma Locked: 아래에 비활성 Button Secondary L "변경 불가"(자물쇠). type="default"만 */
  locked?: boolean
  /** Figma payer: 결제자 프사(S) + 이름. 나는 "나"(spec C-06), 나간 멤버는 프사 Left + 「나간 멤버」 */
  payer: AvatarPerson
  /** Figma participants: 부담 인원 스택(S) + "n명". 나 먼저 → 가입 순(orderMembers) */
  participants: readonly AvatarPerson[]
  /** Figma per person. 기본 1인 = 금액 ÷ 인원(원 단위 내림, 나머지 표시 없음) */
  perPerson?: ReactNode
  /** type="refund": 원래 결제 한 줄(결제 09:40 · ₩121,330) */
  payment?: SheetContentReadOnlyEntry
  /** type="refund": 취소 줄들(시각 순). 금액은 −₩·text/secondary로 그린다 */
  refunds?: readonly SheetContentReadOnlyEntry[]
  children?: never
}

function Line({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <dt className="shrink-0 text-body-s text-secondary">{label}</dt>
      <dd className="ml-auto flex min-w-0 items-center gap-1.5">{children}</dd>
    </div>
  )
}

function Entry({ label, entry, cancel = false }: { label: string; entry: SheetContentReadOnlyEntry; cancel?: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <dt className="flex min-w-0 items-center gap-2">
        <span className="shrink-0 text-body-m text-primary">{label}</span>
        <span className="truncate text-caption text-tertiary">{entry.time}</span>
      </dt>
      <dd
        className={clsx(
          'ml-auto shrink-0 font-amount text-amount-s whitespace-nowrap',
          cancel ? 'text-secondary' : 'text-amount-default',
        )}
      >
        {formatKrw(cancel ? -Math.abs(entry.amount) : entry.amount)}
      </dd>
    </div>
  )
}

export function SheetContentReadOnly({
  type = 'default',
  amount,
  detail,
  changed = false,
  locked = false,
  payer,
  participants,
  perPerson,
  payment,
  refunds = [],
  className,
  ...rest
}: SheetContentReadOnlyProps) {
  const count = participants.length
  const refund = type === 'refund'
  const payerValue = (
    <>
      <Avatar {...payer} size="s" ring alt="" />
      <span className="truncate text-body-s-strong text-primary">{payer.me ? '나' : payer.name}</span>
      {payer.left && <Tag type="left" size="s" />}
    </>
  )
  const stack = count > 0 && <AvatarStack people={participants} size="s" label={`부담 인원 ${avatarStackLabel(participants)}`} />
  const each = (
    <span className="font-amount text-amount-s whitespace-nowrap text-amount-default">
      {perPerson ?? formatKrw(splitEvenly(amount, count).perPerson)}
    </span>
  )

  return (
    <div className={clsx('flex flex-col gap-5 bg-surface', className)} {...rest}>
      <div className="flex flex-col gap-0.5">
        <p className="font-amount text-amount-l text-amount-default">{formatKrw(amount)}</p>
        <p className="flex flex-wrap items-center gap-1.5">
          <span className="text-caption text-tertiary">{detail}</span>
          {changed && <Tag type="changed" size="s" />}
        </p>
      </div>
      {refund ? (
        <>
          {/* 결제·취소 톤 블록: bg/subtle · radius 16 · 패딩 16 · 줄 간격 12 */}
          {(payment || refunds.length > 0) && (
            <dl className="flex flex-col gap-3 rounded-lg bg-subtle p-4">
              {payment && <Entry label="결제" entry={payment} />}
              {refunds.map((entry, i) => (
                <Entry key={i} label="취소" entry={entry} cancel />
              ))}
            </dl>
          )}
          {/* 면 없는 키-값: 위 4 · 줄 간격 14 · 라벨 Body/S text/secondary */}
          <dl className="flex flex-col gap-3.5 pt-1">
            <Line label="결제자">
              {payerValue}
            </Line>
            <Line label={`부담 인원 ${count}명`}>
              {stack}
            </Line>
            <Line label="1인">
              {each}
            </Line>
          </dl>
        </>
      ) : (
        <>
          {/* 톤 카드: bg/subtle · radius 16 · 패딩 16 · 줄 간격 14 */}
          <dl className="flex flex-col gap-3.5 rounded-lg bg-subtle p-4">
            <Line label="결제">
              {payerValue}
            </Line>
            <Line label="부담">
              {stack}
              <span className="text-body-s-strong whitespace-nowrap text-primary">{count}명</span>
            </Line>
            <Line label="1인">
              {each}
            </Line>
          </dl>
          {locked && <Button type="secondary" size="l" disabled leadingIcon icon="lock" label="변경 불가" className="w-full" />}
        </>
      )}
    </div>
  )
}

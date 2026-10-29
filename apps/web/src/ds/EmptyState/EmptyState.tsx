import { clsx } from 'clsx'
import type { HTMLAttributes, ReactNode } from 'react'
import { IllustEmptyTrip } from '../Illust/Illust'

// Figma EmptyState(24:8783) · Type=NoTrip/NoPayments/Illust(v1.6 · 60:10427) + Illust(INSTANCE_SWAP) · Button 2(BOOLEAN). 빈 화면.
// NoTrip·NoPayments = 작은 일러스트(96) + H3 + 설명 + 버튼. Figma 세트의 Icons8 컬러 PNG(출처 표기 필요)는 쓰지 않고
// DS v1.4 브랜드 일러스트 Illust/Empty-Trip(24:61381)을 96으로 줄여 쓴다.
// Illust(하이파이 기본 HF-09) = 일러스트 160 → 28 → 제목 H2 → 40 → 버튼 1~2(Button L FILL, 간격 8). 설명 없음.
// 화면에서는 버튼을 하단 CTA 자리에 붙이는 경우가 많다 — 그때는 actions를 비우고 버튼을 셸 cta/아래 블록에 둔다.
export type EmptyStateType = 'no-trip' | 'no-payments' | 'illust'

export type EmptyStateProps = Omit<HTMLAttributes<HTMLDivElement>, 'children' | 'title'> & {
  type: EmptyStateType
  /** Figma title. 기본 문구는 Type마다 다르다 */
  title?: ReactNode
  /** Figma message. 줄바꿈(\n)을 그대로 보여 준다. type="illust"는 설명이 없어 무시한다 */
  message?: ReactNode
  /** Figma Illust(인스턴스 교체, type="illust"만). 기본 IllustEmptyTrip 160. 다른 Illust*를 160으로 넘긴다 */
  illust?: ReactNode
  /**
   * Figma actions: Button들. NoTrip = Primary M + Secondary M(w-full), NoPayments = Ghost S,
   * Illust = Primary L + (Button 2) Secondary L, 둘 다 w-full
   */
  actions?: ReactNode
  children?: never
}

const COPY = {
  'no-trip': { title: '아직 참여한 여정이 없어요', message: '친구에게 받은 초대코드로 참여하거나\n새 여정을 만들어 보세요.' },
  'no-payments': { title: '아직 결제 내역이 없어요', message: '여정 중 연결한 카드로 결제하면\n자동으로 여기에 모여요.' },
  illust: { title: '참여한 여정이 없어요', message: '' },
} satisfies Record<EmptyStateType, { title: string; message: string }>

export function EmptyState({ type, title, message, illust, actions, className, ...rest }: EmptyStateProps) {
  const copy = COPY[type]
  if (type === 'illust') {
    return (
      <div className={clsx('flex flex-col items-center text-center', className)} {...rest}>
        <div className="flex shrink-0 justify-center">{illust ?? <IllustEmptyTrip size={160} />}</div>
        <h2 className="mt-7 text-h2 text-primary">{title ?? copy.title}</h2>
        {actions && <div className="mt-10 flex w-full flex-col gap-2">{actions}</div>}
      </div>
    )
  }
  return (
    <div className={clsx('flex flex-col items-center px-5 py-8 text-center', className)} {...rest}>
      <IllustEmptyTrip size={96} className="shrink-0" />
      <h2 className="mt-6 text-h3 text-primary">{title ?? copy.title}</h2>
      <p className="mt-2 text-body-s whitespace-pre-line text-secondary">{message ?? copy.message}</p>
      {actions && <div className="mt-7 flex w-60 flex-col items-center gap-2">{actions}</div>}
    </div>
  )
}

import { clsx } from 'clsx'
import type { HTMLAttributes, ReactNode } from 'react'
import { IllustEmptyTrip } from '../Illust/Illust'

// Figma EmptyState(24:8783) · Type=NoTrip/NoPayments. 빈 화면.
// Figma 세트의 일러스트는 Icons8 컬러 PNG(서비스에 쓰면 출처 표기 필요)라서 쓰지 않는다.
// 대신 DS v1.4의 브랜드 일러스트 Illust/Empty-Trip(24:61381, "결제 없음·여정 없음", IllustEmptyTrip)을 96으로 줄여 쓴다.
export type EmptyStateType = 'no-trip' | 'no-payments'

export type EmptyStateProps = Omit<HTMLAttributes<HTMLDivElement>, 'children' | 'title'> & {
  type: EmptyStateType
  /** Figma title. 기본 문구는 Type마다 다르다 */
  title?: ReactNode
  /** Figma message. 줄바꿈(\n)을 그대로 보여 준다 */
  message?: ReactNode
  /** Figma actions: Button들. NoTrip = Primary M + Secondary M(w-full), NoPayments = Ghost S */
  actions?: ReactNode
  children?: never
}

const COPY = {
  'no-trip': { title: '아직 참여한 여정이 없어요', message: '친구에게 받은 초대코드로 참여하거나\n새 여정을 만들어 보세요.' },
  'no-payments': { title: '아직 결제 내역이 없어요', message: '여정 중 연결한 카드로 결제하면\n자동으로 여기에 모여요.' },
} satisfies Record<EmptyStateType, { title: string; message: string }>

export function EmptyState({ type, title, message, actions, className, ...rest }: EmptyStateProps) {
  const copy = COPY[type]
  return (
    <div className={clsx('flex flex-col items-center px-5 py-8 text-center', className)} {...rest}>
      <IllustEmptyTrip size={96} className="shrink-0" />
      <h2 className="mt-6 text-h3 text-primary">{title ?? copy.title}</h2>
      <p className="mt-2 text-body-s whitespace-pre-line text-secondary">{message ?? copy.message}</p>
      {actions && <div className="mt-7 flex w-60 flex-col items-center gap-2">{actions}</div>}
    </div>
  )
}

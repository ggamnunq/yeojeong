import { clsx } from 'clsx'
import type { HTMLAttributes, ReactNode } from 'react'

// Figma EmptyState(24:8783) · Type=NoTrip/NoPayments. 빈 화면.
// Figma 세트의 일러스트는 Icons8 컬러 PNG(서비스에 쓰면 출처 표기 필요)라서 쓰지 않는다.
// 대신 DS v1.4의 브랜드 일러스트 Illust/Empty-Trip(24:61381, "결제 없음·여정 없음")을 SVG로 옮겨 토큰 색으로 그린다.
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

/** Figma Illust/Empty-Trip: 출발 링 → 경로 점 → 빈 도착 링(노을). 140 원본을 EmptyState 자리(96)에 맞춘다 */
function EmptyTripIllustration({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 140 140" fill="none" aria-hidden focusable="false" className={className}>
      <path
        className="fill-primary-100"
        fillRule="evenodd"
        d="M96 86a40 40 0 1 1-80 0 40 40 0 0 1 80 0ZM34 86a22 22 0 1 0 44 0 22 22 0 0 0-44 0Z"
      />
      <circle className="fill-primary-300" cx="56" cy="86" r="7" />
      <circle className="fill-primary-300" cx="98" cy="66" r="3.5" />
      <circle className="fill-primary-200" cx="110" cy="52" r="3.5" />
      <circle className="fill-primary-200" cx="119" cy="38" r="3.5" />
      <circle className="stroke-sunset-300" cx="124" cy="20" r="8.5" strokeWidth="3" />
    </svg>
  )
}

export function EmptyState({ type, title, message, actions, className, ...rest }: EmptyStateProps) {
  const copy = COPY[type]
  return (
    <div className={clsx('flex flex-col items-center px-5 py-8 text-center', className)} {...rest}>
      <EmptyTripIllustration className="size-24 shrink-0" />
      <h2 className="mt-6 text-h3 text-primary">{title ?? copy.title}</h2>
      <p className="mt-2 text-body-s whitespace-pre-line text-secondary">{message ?? copy.message}</p>
      {actions && <div className="mt-7 flex w-60 flex-col items-center gap-2">{actions}</div>}
    </div>
  )
}

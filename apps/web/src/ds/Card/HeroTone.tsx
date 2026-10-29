import { clsx } from 'clsx'
import { useId, type HTMLAttributes, type MouseEventHandler, type ReactNode } from 'react'
import { Button } from '../Button/Button'
import { Icon } from '../Icon/Icon'
import type { IconName } from '../Icon/icons'
import { RouteProgress, type RouteProgressProps } from '../Route/Progress'
import { focusRing, touchTarget } from '../styles'

// Figma Card/HeroTone(52:10212, v1.5) · Label · Hero(TEXT) + Action · Sub · Route · Meta(BOOLEAN). 톤 영웅 카드(HF-16 · 25 · 26).
// bg/subtle · radius 20 · 패딩 24/20/20/20, 간격 4: 라벨(Body/S text/secondary) [+ ✎ 20] → 영웅 숫자(Amount/XL) → 보조(Body/S) → 20 → 경로(Route/Progress) → 12 → 메타(Caption text/tertiary).
// 화면당 영웅 숫자는 하나. 정산(HF-25): label "총 공동 지출" · hero "₩826,910" · sub · route phase="ended" · meta 없음.

/**
 * Figma Action. 객체를 주면 라벨 줄 오른쪽에 붙는다.
 * - 기본: 아이콘 버튼(Icon/edit 20, 누르는 영역 44)
 * - `text`를 주면 텍스트 버튼(Button Ghost S) — 여정 정보 HF-16·23 "수정"(W9, 발견성). 줄 높이는 그대로 두려고 위아래를 겹친다
 */
export type CardHeroToneAction = {
  /** 접근성 이름: "여정 정보 수정". 텍스트 버튼이면 보이는 글자(text)를 포함해야 한다 */
  label: string
  onClick?: MouseEventHandler<HTMLButtonElement>
  /** 아이콘 버튼의 아이콘. 기본 edit */
  icon?: IconName
  /** 보이는 글자 "수정" — 주면 아이콘 대신 Button Ghost S */
  text?: string
}

export type CardHeroToneProps = Omit<HTMLAttributes<HTMLElement>, 'children'> & {
  /** Figma Label: "출발까지" · "총 공동 지출" · "보낼 돈" */
  label: ReactNode
  /** Figma Hero: "D-15" · "₩826,910". 색을 바꾸려면 span으로 감싸 넘긴다(예: 보낼 돈 `text-amount-send`) */
  hero: ReactNode
  /** 영웅 숫자 옆 작은 글자(Body/L text/tertiary, 같은 기준선): 진행 중 "/ 4" */
  heroSuffix?: ReactNode
  /** Figma Action */
  action?: CardHeroToneAction
  /** 오른쪽 위에 라벨 + 영웅 숫자 높이로 붙는 요소(멤버별 내역 HF-26의 프사 L). action과 같이 쓰지 않는다 */
  aside?: ReactNode
  /** Figma Sub: 영웅 아래 보조 한 줄 — "N빵 1인 ₩206,728" */
  sub?: ReactNode
  /** Figma Route: 중첩 Route/Progress(Phase · Start · End, 코드는 days · current도) */
  route?: Omit<RouteProgressProps, 'className'>
  /** Figma Meta: 맨 아래 한 줄 — "일본 오사카 · 3박 4일 · 예산 ₩1,200,000" */
  meta?: ReactNode
  /** 라벨을 제목(h2~h4)으로 — 카드가 section이 되고 제목으로 이름 붙는다. 생략하면 p */
  headingLevel?: 2 | 3 | 4
  children?: never
}

export function CardHeroTone({
  label,
  hero,
  heroSuffix,
  action,
  aside,
  sub,
  route,
  meta,
  headingLevel,
  className,
  ...rest
}: CardHeroToneProps) {
  const labelId = useId()
  const Root = headingLevel ? 'section' : 'div'
  const Label = headingLevel ? (`h${headingLevel}` as const) : 'p'

  return (
    <Root
      aria-labelledby={headingLevel ? labelId : undefined}
      className={clsx('flex w-full flex-col gap-1 rounded-xl bg-subtle px-5 pt-6 pb-5', className)}
      {...rest}
    >
      <div className="flex items-start gap-3">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex items-center gap-2">
            <Label id={labelId} className="min-w-0 flex-1 text-body-s text-secondary">
              {label}
            </Label>
            {action?.text != null && (
              <Button
                type="ghost"
                size="s"
                label={action.text}
                aria-label={action.label}
                onClick={action.onClick}
                className="-my-2 -mr-3 shrink-0"
              />
            )}
            {action && action.text == null && (
              <button
                type="button"
                aria-label={action.label}
                onClick={action.onClick}
                className={clsx('inline-flex shrink-0 rounded-full text-icon-subtle', focusRing, touchTarget)}
              >
                <Icon name={action.icon ?? 'edit'} size={20} />
              </button>
            )}
          </div>
          <p className="flex items-baseline gap-1.5 whitespace-nowrap">
            <span className="font-amount text-amount-xl text-amount-default">{hero}</span>
            {heroSuffix != null && <span className="text-body-l text-tertiary">{heroSuffix}</span>}
          </p>
        </div>
        {aside}
      </div>
      {sub != null && <div className="text-body-s text-secondary">{sub}</div>}
      {route && <RouteProgress className="pt-5" {...route} />}
      {meta != null && <p className="pt-3 text-caption text-tertiary">{meta}</p>}
    </Root>
  )
}

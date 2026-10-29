import { clsx } from 'clsx'
import { useRef, type HTMLAttributes, type KeyboardEvent, type ReactNode } from 'react'
import type { AvatarPerson } from '../Avatar/rules'
import { AvatarToggle } from '../AvatarToggle/AvatarToggle'
import { Tag } from '../Tag/Tag'

// Figma SheetContent/SplitPick(79:11072 · v1.6.3에서 06 로컬 → DS 이동, ID 유지) · Count · Per person · Count visible · Per visible · Personal.
// BottomSheet Content 슬롯용(폭 350, 간격 16): 요약 한 줄 → AvatarToggle(48, HF-21 패턴) 줄.
// 요약 = 왼쪽 인원 "3명"(Body/S Strong text/secondary) · 오른쪽 "결제자 +2원"(Caption text/tertiary) + "1인 ₩3,676"(Amount/S text/primary).
// 나만 선택 = 인원·1인 대신 자물쇠 "개인" 태그(HF-47b, personal). 결제자 고르기는 mode="single"(요약 없음, 고르면 바로 돌아가는 단일 선택).
// 금액 글자는 화면이 만든다(splitPickSummary). 멤버 순서 = 넘긴 순서(나 먼저 → 가입 순, orderMembers).

export type SplitPickMember = AvatarPerson & {
  /** 선택 값으로 쓰는 멤버 ID */
  id: string
  /** 고를 수 없음(AvatarToggle Disabled). 수정(WF-50)에서 나간 멤버를 "해제만 가능"하게 하려면 선택이 꺼진 뒤에 켠다 */
  disabled?: boolean
}

type SplitPickBase = Omit<HTMLAttributes<HTMLDivElement>, 'children' | 'onChange' | 'role'> & {
  /** 활성 멤버(나 먼저 → 가입 순). 4명씩 한 줄, 5명부터 줄바꿈 */
  members: readonly SplitPickMember[]
  /** 멤버 묶음의 접근성 이름. 기본 나누기 "나눌 사람" · 결제자 "결제자" */
  label?: string
  children?: never
}

export type SheetContentSplitPickMultipleProps = SplitPickBase & {
  /** 나누기(복수 선택, 기본) */
  mode?: 'multiple'
  /** 선택된 멤버 ID */
  selected: readonly string[]
  /** 새 선택 ID(members 순서) */
  onChange?: (selected: string[]) => void
  /** Figma Count: 기본 "{선택 인원}명" */
  count?: ReactNode
  /** Figma Per person: "1인 ₩3,676". 없으면 오른쪽 금액을 그리지 않는다 */
  perPerson?: ReactNode
  /** 나머지 보조 글자: "결제자 +2원"(나머지가 없으면 넘기지 않는다) */
  remainder?: ReactNode
  /** Figma Personal: 인원·금액 대신 자물쇠 "개인"(나만 선택, HF-47b) */
  personal?: boolean
}

export type SheetContentSplitPickSingleProps = SplitPickBase & {
  /** 결제자 고르기(단일 선택 · 요약 없음) */
  mode: 'single'
  /** 선택된 멤버 ID */
  selected: string | null
  /** 고른 멤버 ID — 화면은 바로 앞 단계로 돌아간다 */
  onChange?: (id: string) => void
}

export type SheetContentSplitPickProps = SheetContentSplitPickMultipleProps | SheetContentSplitPickSingleProps

export function SheetContentSplitPick(props: SheetContentSplitPickProps) {
  const groupRef = useRef<HTMLDivElement>(null)
  const { members, label, className } = props
  const single = props.mode === 'single'
  const isOn = (id: string) => (props.mode === 'single' ? props.selected === id : props.selected.includes(id))

  // 단일 선택은 라디오 그룹: 탭 멈춤은 선택된 사람(없으면 첫 사람) 하나, ←→↑↓ · Home · End로 옮기며 고른다
  const enabled = members.filter((m) => !m.disabled)
  const focusId = single ? (enabled.find((m) => isOn(m.id)) ?? enabled[0])?.id : undefined

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (props.mode !== 'single' || enabled.length === 0) return
    const current = enabled.findIndex((m) => m.id === (event.target as HTMLElement).dataset.memberId)
    const last = enabled.length - 1
    const moves: Record<string, number> = {
      ArrowRight: current >= last ? 0 : current + 1,
      ArrowDown: current >= last ? 0 : current + 1,
      ArrowLeft: current <= 0 ? last : current - 1,
      ArrowUp: current <= 0 ? last : current - 1,
      Home: 0,
      End: last,
    }
    const next = moves[event.key] ?? null
    if (next === null) return
    event.preventDefault()
    const id = enabled[next].id
    groupRef.current?.querySelector<HTMLElement>(`[data-member-id="${CSS.escape(id)}"]`)?.focus()
    props.onChange?.(id)
  }

  const rest = divProps(props)

  return (
    <div className={clsx('flex flex-col gap-4 bg-surface', className)} {...rest}>
      {props.mode !== 'single' && <Summary {...props} />}
      <div
        ref={groupRef}
        role={single ? 'radiogroup' : 'group'}
        aria-label={label ?? (single ? '결제자' : '나눌 사람')}
        onKeyDown={onKeyDown}
        // Figma: 좌우 8 안쪽에 56폭 토글 4개를 양끝 맞춤. 5명부터 같은 칸에 줄바꿈(세로 12)
        className="grid grid-cols-[repeat(4,--spacing(14))] justify-between gap-y-3 px-2"
      >
        {members.map(({ id, disabled, ...person }) => {
          const on = isOn(id)
          return (
            <AvatarToggle
              key={id}
              data-member-id={id}
              person={person}
              selected={on}
              disabled={disabled}
              onChange={(next) => {
                if (props.mode === 'single') {
                  props.onChange?.(id)
                  return
                }
                const set = new Set(props.selected)
                if (next) set.add(id)
                else set.delete(id)
                props.onChange?.(members.filter((m) => set.has(m.id)).map((m) => m.id))
              }}
              {...(single && {
                role: 'radio',
                'aria-checked': on,
                'aria-pressed': undefined,
                tabIndex: id === focusId ? 0 : -1,
              })}
            />
          )
        })}
      </div>
    </div>
  )
}

function Summary({ selected, count, perPerson, remainder, personal = false }: SheetContentSplitPickMultipleProps) {
  return (
    // 인원·금액이 바뀌면 화면리더에 조용히 알린다
    <div aria-live="polite" className="flex min-h-5 items-center gap-2">
      {personal ? (
        <Tag type="personal" size="s" />
      ) : (
        <span className="shrink-0 text-body-s-strong text-secondary">{count ?? `${selected.length}명`}</span>
      )}
      {!personal && (perPerson != null || remainder != null) && (
        <span className="ml-auto flex min-w-0 items-center gap-2">
          {remainder != null && <span className="truncate text-caption text-tertiary">{remainder}</span>}
          {perPerson != null && (
            <span className="shrink-0 font-amount text-amount-s whitespace-nowrap text-primary">{perPerson}</span>
          )}
        </span>
      )}
    </div>
  )
}

const OWN_PROPS = new Set(['members', 'label', 'className', 'mode', 'selected', 'onChange', 'count', 'perPerson', 'remainder', 'personal'])

// 컴포넌트 전용 prop을 뺀 나머지(div 속성: id · aria-* · data-* 등)
function divProps(props: SheetContentSplitPickProps): HTMLAttributes<HTMLDivElement> {
  return Object.fromEntries(Object.entries(props).filter(([key]) => !OWN_PROPS.has(key)))
}

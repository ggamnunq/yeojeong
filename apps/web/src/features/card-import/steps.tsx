import { clsx } from 'clsx'
import { useId, useState, type KeyboardEvent, type ReactNode, type RefObject } from 'react'
import { isValidCardNumber, type CardApprovalItem, type CardImportOrganization } from '@yeojeong/shared'
import {
  BottomSheet,
  Checkbox,
  DateHeader,
  EmptyState,
  Icon,
  IllustEmptyTrip,
  Input,
  RowField,
  RowPick,
  SheetContentDateRange,
  ShellSub,
  type DateRangeValue,
} from '../../ds'
import { focusRing } from '../../ds/styles'
import {
  CARD_LOGIN_FORM_PROPS,
  CARD_NUMBER_INPUT_PROPS,
  cardNumberDigits,
  cardPasswordInputProps,
  cardPasswordLabel,
  maskCardNumber,
} from './cardLogin'
import { CenterStatus, IssuerHomepageLink, ScrollFormShell } from './components'
import { COPY } from './copy'
import {
  countdown,
  groupResults,
  rangeLabel,
  resultAmounts,
  resultChip,
  resultMeta,
  selectAllState,
  toRangeValue,
  type RangeLimits,
} from './rules'

// WF-53~56 단계 화면(겉모습). 상태·서버 호출은 FlowPage가 쥔다.

type Range = { from: string; to: string }

/** WF-53h 카드 확인 블록(현대·하나) 입력. 값은 FlowPage의 useCardSecrets(메모리)에만 있다 */
export type CardCheckProps = {
  /** config cardPasswordDigits(현대 4 · 하나 2) */
  digits: number
  cardNumber: string
  onCardNumber: (value: string) => void
  /** 포커스를 잃을 때(자리수는 찼는데 형식이 틀리면 안내 — 화면명세 WF-53h 버튼 조건) */
  onCardNumberBlur: () => void
  cardPassword: string
  onCardPassword: (value: string) => void
  cardNumberRef: RefObject<HTMLInputElement | null>
  /** 필드 줄 아래 전폭 에러 한 줄 + 해당 칸 Error(CARD_NUMBER_INVALID · CARD_PASSWORD_INVALID · 53hb) */
  error: { field: 'number' | 'password'; text: string } | null
}

/** WF-53 로그인 정보 입력 · 53b 로그인 실패 · 53c 쿨다운 · 53r 남은 횟수 · (v0.7.6) 로그인 안내 블록 · 53h 카드 확인(현대·하나) · 53hb */
export function LoginStep({
  org,
  loginId,
  onLoginId,
  password,
  onPassword,
  passwordRef,
  card,
  range,
  limits,
  today,
  onRange,
  rangeOpen,
  onRangeOpen,
  rangeError,
  error,
  locked,
  remaining,
  onBack,
  onSubmit,
}: {
  org: CardImportOrganization
  loginId: string
  onLoginId: (value: string) => void
  password: string
  onPassword: (value: string) => void
  passwordRef: RefObject<HTMLInputElement | null>
  /** 현대·하나(requiresCardNo)만 */
  card?: CardCheckProps
  range: Range
  limits: RangeLimits
  today: string
  onRange: (range: Range) => void
  rangeOpen: boolean
  onRangeOpen: (open: boolean) => void
  rangeError: string | null
  /** 비밀번호 칸 아래 에러 한 줄(53b · 53c) */
  error: string | null
  /** 53c: 해제 시각까지 "불러오기" 비활성 */
  locked: boolean
  /** config.remainingToday(53r: 2 이하일 때만 보인다) */
  remaining: number | null
  onBack: () => void
  onSubmit: () => void
}) {
  const cardReady = !card || (isValidCardNumber(cardNumberDigits(card.cardNumber)) && card.cardPassword.length === card.digits)
  const ready = loginId.trim().length > 0 && password.length > 0 && cardReady && !locked
  const submitOnEnter = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.nativeEvent.isComposing && ready) onSubmit()
  }

  return (
    <ScrollFormShell title={org.name} onBack={onBack} cta={{ label: COPY.fetch, onClick: () => ready && onSubmit(), state: ready ? 'default' : 'disabled' }}>
      {/* 아이디·비밀번호는 form 없이 둔다(제출 이벤트로 브라우저 비밀번호 저장 제안이 뜨지 않게). Enter = 불러오기 */}
      <div className="flex flex-col gap-5">
        <LoginGuide org={org} />
        <Input
          label={COPY.loginId}
          value={loginId}
          onChange={(e) => onLoginId(e.target.value)}
          onKeyDown={submitOnEnter}
          maxLength={100}
          autoFocus={loginId.length === 0}
          {...SECRET_INPUT}
        />
        <div className="flex flex-col gap-1.5">
          <Input
            ref={passwordRef}
            label={COPY.password}
            type="password"
            value={password}
            onChange={(e) => onPassword(e.target.value)}
            onKeyDown={submitOnEnter}
            maxLength={100}
            autoFocus={loginId.length > 0}
            error={error !== null}
            helper={error ?? undefined}
            {...SECRET_INPUT}
          />
          <LockNote>{COPY.encrypted}</LockNote>
        </div>
        {card && <CardCheck org={org} {...card} onEnter={submitOnEnter} />}
      </div>
      <div className="mt-5 pb-4">
        <RowField label={COPY.range} value={rangeLabel(range, today)} onClick={() => onRangeOpen(true)} />
        {rangeError && (
          <p role="alert" className="text-right text-caption text-error">
            {rangeError}
          </p>
        )}
        {remaining !== null && remaining > 0 && remaining <= 2 && <p className="text-caption text-secondary">{COPY.remaining(remaining)}</p>}
      </div>
      <RangeSheet open={rangeOpen} range={range} limits={limits} today={today} onClose={() => onRangeOpen(false)} onPick={onRange} />
    </ScrollFormShell>
  )
}

// 아이디·비밀번호: 브라우저가 카드사 계정을 여정 주소에 저장·자동완성하지 않게(autocomplete off), 맞춤법 검사로 서버에 보내지 않게.
// 비밀번호 관리자(1Password · LastPass · Bitwarden · Dashlane 등)에도 무시 신호를 준다 — 완전히 막을 수는 없다(브라우저·확장 재량)
const SECRET_INPUT = {
  autoComplete: 'off',
  spellCheck: false,
  autoCapitalize: 'none',
  autoCorrect: 'off',
  'data-1p-ignore': true,
  'data-lpignore': 'true',
  'data-bwignore': true,
  'data-form-type': 'other',
} as const

/** 비밀번호 관리자 무시 신호(카드번호·카드 비밀번호 칸 — 자동 완성 속성은 cardLogin.ts가 정한다) */
const PASSWORD_MANAGER_IGNORE = {
  'data-1p-ignore': true,
  'data-lpignore': 'true',
  'data-bwignore': true,
  'data-form-type': 'other',
} as const

/** 자물쇠 줄(Caption, text/tertiary) */
function LockNote({ children }: { children: ReactNode }) {
  return (
    <p className="flex items-center gap-1.5 text-caption text-tertiary">
      <Icon name="lock" size={16} className="shrink-0 text-icon-subtle" />
      {children}
    </p>
  )
}

/**
 * 로그인 안내 블록(v0.7.6, Figma HF-53 계열 공통 — 은행 아이디 혼동 방지): 제목(Body/M Strong) · Caption 2줄("은행 아이디"만 Medium) ·
 * "{카드사} 홈페이지 ›"(새 탭, 고정 목록 URL만). 입력값은 그대로 남는다(새 탭)
 */
function LoginGuide({ org }: { org: CardImportOrganization }) {
  return (
    <div className="flex flex-col items-start">
      <p className="text-body-m-strong text-primary">{COPY.guideTitle(org.name)}</p>
      <div className="mt-1.5 flex flex-col gap-0.5 text-caption break-keep text-secondary">
        <p>
          <span className="font-medium">{COPY.guideNotBankStrong}</span>
          {COPY.guideNotBankRest[0]}
          <br />
          {COPY.guideNotBankRest[1]}
        </p>
        <p>{COPY.guideNoId}</p>
      </div>
      <IssuerHomepageLink org={org} className="mt-2 py-1" />
    </div>
  )
}

/**
 * WF-53h 카드 확인(현대·하나 — Figma HF-53h 149:16807 · 53hb 155:17045): Caption → [카드번호 | 카드 비밀번호 136] → (에러 한 줄) → Caption · 자물쇠 줄.
 * 카드번호는 포커스를 잃으면 가운데를 가리고(9410 •••• •••• 3456) 포커스하면 전체를 보인다. 원문은 HTTPS로 서버를 거치므로 "암호화" 표현을 쓰지 않는다.
 * form(CARD_LOGIN_FORM_PROPS)으로 감싸 브라우저 기본 제출(값이 URL로 나가는 것)을 막는다 — 제출은 버튼 처리기만 한다
 */
function CardCheck({
  org,
  digits,
  cardNumber,
  onCardNumber,
  onCardNumberBlur,
  cardPassword,
  onCardPassword,
  cardNumberRef,
  error,
  onEnter,
}: CardCheckProps & { org: CardImportOrganization; onEnter: (e: KeyboardEvent<HTMLInputElement>) => void }) {
  const [numberFocused, setNumberFocused] = useState(false)
  const errorId = useId()
  return (
    <form {...CARD_LOGIN_FORM_PROPS} className="flex flex-col gap-2.5 pt-2">
      <p className="text-caption text-secondary">{COPY.cardCheckReason(org.name)}</p>
      <div className="flex items-end gap-2.5">
        <Input
          ref={cardNumberRef}
          label={COPY.cardNumber}
          {...CARD_NUMBER_INPUT_PROPS}
          {...PASSWORD_MANAGER_IGNORE}
          value={numberFocused ? cardNumber : maskCardNumber(cardNumber)}
          onChange={(e) => onCardNumber(e.target.value)}
          onFocus={() => setNumberFocused(true)}
          onBlur={() => {
            setNumberFocused(false)
            onCardNumberBlur()
          }}
          onKeyDown={onEnter}
          error={error?.field === 'number'}
          aria-describedby={error?.field === 'number' ? errorId : undefined}
          className="min-w-0 flex-1"
        />
        <Input
          label={cardPasswordLabel(digits)}
          {...cardPasswordInputProps(digits)}
          {...PASSWORD_MANAGER_IGNORE}
          pin
          placeholder={COPY.cardPasswordPlaceholder(digits)}
          value={cardPassword}
          onChange={(e) => onCardPassword(e.target.value)}
          onKeyDown={onEnter}
          error={error?.field === 'password'}
          aria-describedby={error?.field === 'password' ? errorId : undefined}
          className="w-34 shrink-0"
        />
      </div>
      {error && (
        <p id={errorId} role="alert" className="text-caption text-error">
          {error.text}
        </p>
      )}
      <div className="flex flex-col gap-1.5">
        <p className="text-caption text-secondary">{COPY.cardAnyCard}</p>
        <LockNote>{COPY.cardNotStored}</LockNote>
      </div>
    </form>
  )
}

/** 기간 시트(부록 C-9 날짜 범위 시트 재사용): 카드사 한도 밖(과거 한도 이전 · 오늘 이후 · 1회 최대 넘음)은 흐림 */
function RangeSheet({
  open,
  range,
  limits,
  today,
  onClose,
  onPick,
}: {
  open: boolean
  range: Range
  limits: RangeLimits
  today: string
  onClose: () => void
  onPick: (range: Range) => void
}) {
  return (
    <BottomSheet open={open} title={COPY.range} onClose={onClose}>
      {open && <RangeSheetBody range={range} limits={limits} today={today} onPick={onPick} onClose={onClose} />}
    </BottomSheet>
  )
}

function RangeSheetBody({ range, limits, today, onPick, onClose }: { range: Range; limits: RangeLimits; today: string; onPick: (range: Range) => void; onClose: () => void }) {
  const [draft, setDraft] = useState<DateRangeValue>(() => toRangeValue(range))
  return (
    <SheetContentDateRange
      value={draft}
      onChange={setDraft}
      today={today}
      min={limits.min}
      max={limits.max}
      maxDays={limits.maxDays}
      startLabel={COPY.rangeStart}
      endLabel={COPY.rangeEnd}
      cta={{
        onClick: () => {
          if (!draft.start || !draft.end) return
          onPick({ from: draft.start, to: draft.end })
          onClose()
        },
      }}
    />
  )
}

/** WF-54 추가 인증(문자) — 남은 시간 m:ss(160초) */
export function TwoWayStep({
  code,
  onCode,
  error,
  remainingMs,
  expired,
  onBack,
  onSubmit,
}: {
  code: string
  onCode: (value: string) => void
  error: boolean
  remainingMs: number
  expired: boolean
  onBack: () => void
  onSubmit: () => void
}) {
  const live = !expired && remainingMs > 0
  const ready = code.length > 0 && live
  return (
    <ShellSub header={{ title: COPY.twoWayTitle, onBack }} cta={{ label: COPY.confirm, onClick: () => ready && onSubmit(), state: ready ? 'default' : 'disabled' }}>
      <Input
        label={COPY.twoWayCode}
        value={code}
        inputMode="numeric"
        autoComplete="one-time-code"
        maxLength={10}
        autoFocus
        onChange={(e) => onCode(e.target.value.replace(/\D/g, ''))}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && ready) onSubmit()
        }}
        onClear={() => onCode('')}
        suffix
        suffixText={countdown(live ? remainingMs : 0)}
        error={error}
        helper={error ? COPY.twoWayInvalid : undefined}
      />
    </ShellSub>
  )
}

/** WF-55 불러오는 중 — ‹(제목 없음) · 일러스트 · "불러오는 중" · 카드사 이름 · "취소" */
export function LoadingStep({ orgName, onCancel }: { orgName: string; onCancel: () => void }) {
  return (
    <ShellSub header={{ onBack: onCancel }}>
      <CenterStatus phase="pending" title={COPY.loading} sub={orgName} live />
      <button
        type="button"
        onClick={onCancel}
        className={clsx('mx-auto mb-6 rounded-sm px-4 py-2.5 text-body-m-strong text-brand active:opacity-70', focusRing)}
      >
        {COPY.cancel}
      </button>
    </ShellSub>
  )
}

/** WF-56 결과 목록 · 56s 스크롤(헤더·CTA 고정) */
export function ResultStep({
  orgName,
  items,
  selected,
  onToggle,
  onToggleAll,
  tripName,
  saving,
  onBack,
  onAdd,
}: {
  orgName: string
  items: readonly CardApprovalItem[]
  selected: ReadonlySet<string>
  onToggle: (importKey: string) => void
  onToggleAll: () => void
  tripName: (tripId: string) => string | undefined
  saving: boolean
  onBack: () => void
  onAdd: () => void
}) {
  const all = selectAllState(items, selected)
  return (
    <ShellSub
      header={{ title: COPY.resultTitle(orgName, items.length), onBack }}
      gutter={false}
      cta={{ label: COPY.add(all.count), onClick: () => all.count > 0 && !saving && onAdd(), state: saving ? 'loading' : all.count > 0 ? 'default' : 'disabled' }}
    >
      <fieldset disabled={saving} className="flex min-w-0 flex-col">
        <div className="flex items-center justify-between px-gutter py-1">
          <Checkbox
            label={COPY.selectAll}
            checked={all.checked}
            indeterminate={all.indeterminate}
            disabled={all.total === 0}
            onChange={onToggleAll}
          />
          <span className="text-caption text-secondary">{COPY.selectCount(all.total, all.count)}</span>
        </div>
        {groupResults(items).map((group, index) => (
          <section key={group.localDate} aria-label={group.label} className={clsx(index > 0 ? 'pt-4' : 'pt-1')}>
            <DateHeader style="plain" date={group.label} />
            {group.items.map((item) => {
              const disabled = !item.selectable || !item.itemToken
              return (
                <RowPick
                  key={item.importKey}
                  title={item.merchantName}
                  meta={resultMeta(item, tripName)}
                  chip={resultChip(item)}
                  {...resultAmounts(item)}
                  checked={!disabled && selected.has(item.importKey)}
                  disabled={disabled}
                  onChange={() => onToggle(item.importKey)}
                />
              )
            })}
          </section>
        ))}
        <div className="h-6" />
      </fieldset>
    </ShellSub>
  )
}

/** WF-56b 결과 0건 */
export function EmptyStep({ orgName, onBack, onManual, onChangeRange }: { orgName: string; onBack: () => void; onManual: () => void; onChangeRange: () => void }) {
  return (
    <ShellSub
      header={{ title: orgName, onBack }}
      cta={{
        layout: 'horizontal',
        secondary: { label: COPY.manualShort, onClick: onManual },
        primary: { label: COPY.changeRange, onClick: onChangeRange },
      }}
    >
      {/* HF-56b: HF-09와 같은 구성(일러스트 144 → 제목 H2, 설명 없음) · 남은 높이의 세로 가운데 */}
      <EmptyState type="illust" illust={<IllustEmptyTrip size={144} />} title={COPY.empty} className="flex-1 justify-center" />
    </ShellSub>
  )
}

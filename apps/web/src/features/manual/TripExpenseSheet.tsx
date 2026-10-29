import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Navigate, useLocation, useNavigate, useParams } from 'react-router'
import { handleApiError, isApiError, keys, type MemberSummary, type TripDetail } from '../../api'
import { paths } from '../../app/paths'
import { useTripDetail } from '../../app/trip'
import {
  BottomSheet,
  Dialog,
  orderMembers,
  RowField,
  RowFieldInput,
  RowFieldToggle,
  SheetContentSplitPick,
  type BottomSheetCtaValue,
  type SplitPickMember,
} from '../../ds'
import { toast } from '../../notifications'
import { expenseQuery } from '../payments/api'
import { clock } from '../payments/clock'
import { SheetSkeleton } from '../payments/components/SheetParts'
import { participantCandidates, perPersonText, toPerson } from '../payments/rules'
import { tripFxQuery } from '../wallet/api'
import { createTripExpense, deleteTripExpense, invalidateManual, updateTripExpense } from './api'
import { AmountField } from './components'
import { COPY, manualFieldErrors, type ManualFieldErrors } from './form'
import { useDateStep } from './useDateStep'
import {
  allowedCurrencies,
  dateValueLabel,
  fractionDigitsOf,
  isPersonalSplit,
  isPositiveAmount,
  newClientRequestId,
  normalizeAmount,
  overKrwLimit,
  previewKrw,
  sanitizeMemo,
  splitSummary,
  splitValid,
  trimAmount,
  tripRatePerUnit,
} from './rules'
import { MANUAL_DEFAULT_MERCHANT_NAME, MANUAL_MEMO_MAX_LENGTH, type ManualPaymentDetail, type UpdateTripExpenseRequest } from './types'

// WF-46 여정 결제 추가 · WF-47 결제자/나누기(같은 시트 안 단계) · WF-50 결제 수정(여정 폼) · WF-50b 공동 삭제 다이얼로그.
// 추가하면 바로 확정된다(나누기에 결제자 말고 한 명이라도 있으면 공동, 나만이면 개인). 금액만 필수.

type Step = 'form' | 'split' | 'payer' | 'date'

/** /trips/:tripId/payments/new — 진행 중 여정만(예정은 결제내역 탭이 잠겨 있고, 종료 후에는 추가할 수 없다) */
export function NewTripExpensePage() {
  const trip = useTripDetail()
  const close = useCloseSheet(paths.payments(trip.tripId))
  if (trip.status !== 'ONGOING') return <Navigate replace to={paths.payments(trip.tripId)} />
  return <TripExpenseForm trip={trip} onClose={close} />
}

/** /trips/:tripId/payments/:expenseId/edit — 작성자 · 종료 전 · 직접 입력 결제만. 아니면 상세로 돌아간다 */
export function EditTripExpensePage() {
  const trip = useTripDetail()
  const { expenseId = '' } = useParams()
  const navigate = useNavigate()
  const query = useQuery(expenseQuery(trip.tripId, expenseId))
  const close = useCloseSheet(paths.payment(trip.tripId, expenseId))
  const detail = query.data
  const editable = detail ? detail.origin === 'MANUAL' && detail.permissions.canEdit && detail.permissions.isAuthor !== false : null

  useEffect(() => {
    if (editable === false || (isApiError(query.error) && query.error.status === 404)) close()
  })

  if (!detail || !editable) {
    return (
      <BottomSheet open title="결제 수정" onClose={close}>
        <SheetSkeleton />
      </BottomSheet>
    )
  }
  return (
    <TripExpenseForm
      key={detail.version}
      trip={trip}
      detail={detail}
      onClose={close}
      onDeleted={() => navigate(paths.payments(trip.tripId), { replace: true })}
    />
  )
}

/** 목록·상세에서 열었으면 뒤로, 주소로 바로 왔으면 fallback으로 바꿔 간다 */
function useCloseSheet(fallback: string) {
  const navigate = useNavigate()
  const location = useLocation()
  const closed = useRef(false)
  return () => {
    if (closed.current) return
    closed.current = true
    if ((location.state as { fromList?: boolean; fromDetail?: boolean } | null)?.fromList) navigate(-1)
    else if ((location.state as { fromDetail?: boolean } | null)?.fromDetail) navigate(-1)
    else navigate(fallback, { replace: true })
  }
}

type FormProps = {
  trip: TripDetail
  /** 있으면 수정(WF-50) */
  detail?: ManualPaymentDetail
  onClose: () => void
  onDeleted?: () => void
}

const memoOf = (detail?: ManualPaymentDetail) =>
  !detail || detail.merchantName === MANUAL_DEFAULT_MERCHANT_NAME ? '' : detail.merchantName

/** 화면용 사람(member 꼬리표를 뗀다) */
const personOf = <T extends { member: MemberSummary }>({ member: _member, ...person }: T) => person

const sameSet = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((id) => b.includes(id))

function TripExpenseForm({ trip, detail, onClose, onDeleted }: FormProps) {
  const queryClient = useQueryClient()
  const me = trip.me.membershipId
  const editing = Boolean(detail)
  const pending = detail?.status === 'PENDING'
  const walletLinked = Boolean(detail?.walletEntryId)
  const [now] = useState(() => clock.now())
  const [clientRequestId] = useState(newClientRequestId)
  // 추가는 열자마자 금액 입력(숫자 키패드). 수정은 시트 기본(제목)
  const amountRef = useRef<HTMLInputElement>(null)

  // 후보: 새 결제는 활성 멤버, 수정은 + 이 결제에 있던 나간 멤버(해제만, Q-30). 나 먼저 → 가입 순
  const candidates: MemberSummary[] = useMemo(
    () => (detail ? participantCandidates(trip, detail) : trip.members.filter((m) => !m.isLeft)),
    [trip, detail],
  )
  const ordered = useMemo(() => orderMembers(candidates.map((m) => ({ ...toPerson(m), member: m }))), [candidates])
  const activeIds = ordered.filter((p) => !p.member.isLeft).map((p) => p.member.membershipId)

  // 처음 값(수정은 version이 바뀌면 key로 폼을 다시 만든다)
  const [initial] = useState(() => ({
      amount: detail ? trimAmount(detail.originalAmount, fractionDigitsOf(detail.originalCurrency)) : '',
      currency: detail?.originalCurrency ?? trip.currency,
      memo: memoOf(detail),
      payer: detail?.payer.membershipId ?? me,
      participants: detail
        ? detail.status === 'SHARED'
          ? (detail.participants ?? []).map((p) => p.membershipId)
          : [detail.payer.membershipId]
        : activeIds,
      occurredAt: detail?.occurredAt ?? null,
  }))

  const [step, setStep] = useState<Step>('form')
  const [amount, setAmount] = useState(initial.amount)
  const [currency, setCurrency] = useState(initial.currency)
  const [memo, setMemo] = useState(initial.memo)
  const [payer, setPayer] = useState(initial.payer)
  const [participants, setParticipants] = useState<string[]>(initial.participants)
  const [draft, setDraft] = useState<string[]>(initial.participants)
  const [occurredAt, setOccurredAt] = useState<string | null>(initial.occurredAt)
  // 내 지갑에도 기록: 결제자 = 나면 기본 켜짐(W6 QA). 결제자를 바꾸면 그 기본으로 다시
  const [addToWallet, setAddToWallet] = useState(true)
  const [errors, setErrors] = useState<ManualFieldErrors>({})
  const [confirm, setConfirm] = useState<'to-personal' | 'delete' | null>(null)
  const dateStep = useDateStep(now)

  const allowed = allowedCurrencies(trip.currency)
  const digits = fractionDigitsOf(currency)
  const fx = useQuery({ ...tripFxQuery(trip.tripId), enabled: currency !== 'KRW', meta: { silent: true } })
  const krw = previewKrw(amount, currency, tripRatePerUnit(fx.data))
  const people = ordered.filter((p) => participants.includes(p.member.membershipId))
  const personal = isPersonalSplit(participants, payer, me)
  const payerPerson = ordered.find((p) => p.member.membershipId === payer)
  const valid = isPositiveAmount(amount) && !overKrwLimit(krw) && (pending || splitValid(participants, payer, me))

  // 수정: 바뀐 필드만 보낸다
  const changes: Omit<UpdateTripExpenseRequest, 'version'> = {}
  if (detail) {
    if (Number(normalizeAmount(amount)) !== Number(detail.originalAmount) || currency !== detail.originalCurrency) {
      changes.amount = normalizeAmount(amount)
      changes.currency = currency
    }
    if (memo.trim() !== initial.memo) changes.memo = memo.trim()
    if (occurredAt && occurredAt !== detail.occurredAt) changes.occurredAt = occurredAt
    if (!pending) {
      if (payer !== initial.payer) changes.payerMembershipId = payer
      if (!sameSet(participants, initial.participants)) changes.participantMembershipIds = participants
    }
  }
  const dirty = Object.keys(changes).length > 0

  // 서버 에러의 화면 처리(화면명세 K-0)
  const fail = (error: unknown) => {
    setConfirm(null)
    const fields = manualFieldErrors(error)
    if (fields) {
      // 통화 에러면 칩을 여정 통화로 되돌리고 금액 아래에 보인다
      if (fields.currency) setCurrency(trip.currency)
      return setErrors({ ...fields, amount: fields.amount ?? fields.currency })
    }
    if (!isApiError(error)) return handleApiError(error)
    switch (error.code) {
      case 'VALIDATION_FAILED':
      case 'PARTICIPANTS_REQUIRED':
        // 버튼·행 조건으로 막는 필드(결제자·나누기·지갑 토글) — 멤버를 다시 받아 다시 그린다
        toast.error(COPY.retry)
        return void invalidateManual(queryClient)
      case 'PARTICIPANT_NOT_MEMBER':
        return void invalidateManual(queryClient)
      case 'VERSION_CONFLICT':
        // 최신 결제로 폼을 다시 채운다(key = version) + "최신 내용으로 바뀌었어요"
        if (detail && error.details?.current) queryClient.setQueryData(keys.trips.expense(trip.tripId, detail.id), error.details.current)
        return handleApiError(error)
      case 'EXPENSE_LOCKED':
        // 그사이 잠김 → 상세를 다시 받으면 수정 시트가 닫히고 잠금으로 그려진다
        return void invalidateManual(queryClient)
      case 'TRIP_PHASE_INVALID':
        toast.error(COPY.retry)
        void invalidateManual(queryClient)
        return onClose()
      case 'NOT_AUTHOR':
      case 'NOT_MANUAL_ENTRY':
        // 서버 문구 토스트 + 시트 닫고 상세를 읽기 전용으로 다시
        handleApiError(error)
        void invalidateManual(queryClient)
        return onClose()
      default:
        handleApiError(error)
    }
  }

  const create = useMutation({
    mutationFn: () =>
      createTripExpense(trip.tripId, {
        amount: normalizeAmount(amount),
        currency,
        ...(memo.trim() && { memo: memo.trim() }),
        ...(occurredAt && { occurredAt }),
        payerMembershipId: payer,
        participantMembershipIds: participants,
        ...(payer === me && addToWallet && { addToWallet: true }),
        clientRequestId,
      }),
    meta: { silent: true },
    onSuccess: () => {
      toast.success(COPY.added)
      void invalidateManual(queryClient)
      onClose()
    },
    onError: fail,
  })

  const save = useMutation({
    mutationFn: (confirmSharedToPersonal: boolean) =>
      updateTripExpense(trip.tripId, detail!.id, {
        version: detail!.version,
        ...changes,
        ...(confirmSharedToPersonal && { confirmSharedToPersonal: true }),
      }),
    meta: { silent: true },
    onSuccess: () => {
      toast.success(COPY.saved)
      void invalidateManual(queryClient)
      onClose()
    },
    onError: fail,
  })

  const remove = useMutation({
    mutationFn: () => deleteTripExpense(trip.tripId, detail!.id, detail!.version),
    meta: { silent: true },
    onSuccess: () => {
      toast.success(COPY.deleted)
      void invalidateManual(queryClient, { tripId: trip.tripId, expenseId: detail!.id })
      onDeleted?.()
    },
    onError: fail,
  })

  const busy = create.isPending || save.isPending || remove.isPending

  const submitSave = () => {
    if (!detail || !dirty || !valid || busy) return
    // 나누기를 결제자 혼자로 줄이면 공동 → 개인(WF-32)
    if (detail.status === 'SHARED' && changes.participantMembershipIds && participants.every((id) => id === payer)) {
      return setConfirm('to-personal')
    }
    save.mutate(false)
  }
  const submitDelete = () => {
    if (!detail || busy) return
    if (detail.status === 'SHARED') return setConfirm('delete')
    remove.mutate()
  }

  const formCta: BottomSheetCtaValue = editing
    ? {
        layout: 'horizontal',
        secondary: { label: '삭제', type: 'danger-weak', onClick: submitDelete, state: remove.isPending && !confirm ? 'loading' : 'default' },
        primary: { label: '저장', onClick: submitSave, state: save.isPending && !confirm ? 'loading' : dirty && valid ? 'default' : 'disabled' },
      }
    : { label: '추가', onClick: () => valid && !busy && create.mutate(), state: create.isPending ? 'loading' : valid ? 'default' : 'disabled' }

  const splitKrw = krw ?? null
  const summary = splitKrw !== null ? splitSummary(splitKrw, candidates, draft, payer) : null
  const members: SplitPickMember[] = ordered.map(({ member, ...person }) => ({
    ...person,
    id: member.membershipId,
    // 나간 멤버는 해제만(선택이 꺼진 뒤 고를 수 없다)
    disabled: member.isLeft && !draft.includes(member.membershipId),
  }))

  const titles: Record<Step, string> = { form: editing ? '결제 수정' : '결제 추가', split: '나누기', payer: '결제자', date: '날짜' }
  const cta: BottomSheetCtaValue | undefined =
    step === 'form'
      ? formCta
      : step === 'split'
        ? {
            label: '완료',
            state: splitValid(draft, payer, me) ? 'default' : 'disabled',
            onClick: () => {
              if (!splitValid(draft, payer, me)) return
              setParticipants(draft)
              setStep('form')
            },
          }
        : step === 'date'
          ? dateStep.cta((iso) => {
              setOccurredAt(iso)
              setErrors((e) => ({ ...e, occurredAt: undefined }))
              setStep('form')
            })
          : undefined

  return (
    <>
      <BottomSheet
        open
        title={titles[step]}
        leading={step === 'form' ? 'none' : 'back'}
        onBack={() => setStep('form')}
        onClose={() => !busy && onClose()}
        cta={cta}
        initialFocus={editing ? undefined : amountRef}
      >
        {step === 'form' && (
          <fieldset disabled={busy} className="flex min-w-0 flex-col">
            <AmountField
              value={amount}
              onChange={(raw) => {
                setAmount(raw)
                setErrors((e) => ({ ...e, amount: undefined }))
              }}
              currency={currency}
              allowed={allowed}
              onCurrencyChange={(next) => {
                setCurrency(next)
                setAmount((raw) => trimAmount(raw, fractionDigitsOf(next)))
              }}
              digits={digits}
              krw={krw}
              serverError={errors.amount}
              inputRef={amountRef}
            />
            <RowFieldInput
              label="내용"
              placeholder={COPY.memoPlaceholder}
              maxLength={MANUAL_MEMO_MAX_LENGTH * 2}
              value={memo}
              onChange={(e) => {
                setMemo(sanitizeMemo(e.target.value))
                setErrors((x) => ({ ...x, memo: undefined }))
              }}
              enterKeyHint="done"
            />
            {errors.memo && <FieldError>{errors.memo}</FieldError>}
            {!pending && (
              <>
                <RowField
                  label="결제자"
                  avatar={payerPerson && personOf(payerPerson)}
                  value={payerPerson?.me ? '나' : payerPerson?.name}
                  disabled={walletLinked}
                  onClick={() => setStep('payer')}
                />
                <RowField
                  label="나누기"
                  stack={personal ? undefined : people.map(personOf)}
                  personal={personal}
                  onClick={() => {
                    setDraft(participants)
                    setStep('split')
                  }}
                />
              </>
            )}
            <RowField
              label="날짜"
              value={dateValueLabel(occurredAt)}
              onClick={() => {
                dateStep.begin(occurredAt)
                setStep('date')
              }}
            />
            {errors.occurredAt && <FieldError>{errors.occurredAt}</FieldError>}
            {!editing && payer === me && <RowFieldToggle label="내 지갑에도 기록" value={addToWallet} onChange={setAddToWallet} />}
          </fieldset>
        )}
        {step === 'split' && (
          <SheetContentSplitPick
            members={members}
            selected={draft}
            onChange={setDraft}
            personal={isPersonalSplit(draft, payer, me)}
            perPerson={summary ? perPersonText(summary.perPerson) : undefined}
            remainder={summary?.remainder}
          />
        )}
        {step === 'payer' && (
          <SheetContentSplitPick
            mode="single"
            members={members.filter((m) => activeIds.includes(m.id))}
            selected={payer}
            onChange={(id) => {
              if (id !== payer) setAddToWallet(id === me)
              setPayer(id)
              setStep('form')
            }}
          />
        )}
        {step === 'date' && dateStep.body}
      </BottomSheet>
      {/* WF-32: 공동 → 개인 */}
      <Dialog
        open={confirm === 'to-personal'}
        type="shared-to-personal"
        confirmState={save.isPending ? 'loading' : 'default'}
        onCancel={() => !save.isPending && setConfirm(null)}
        onConfirm={() => save.mutate(true)}
      />
      {/* WF-50b: 여정 쪽 공동 결제 삭제(지갑 항목은 남고 연결만 끊긴다, Q-45) */}
      <Dialog
        open={confirm === 'delete'}
        type="danger"
        title={COPY.sharedDeleteTrip}
        message={COPY.sharedDeleteMessage}
        confirmLabel="삭제"
        confirmState={remove.isPending ? 'loading' : 'default'}
        onCancel={() => !remove.isPending && setConfirm(null)}
        onConfirm={() => remove.mutate()}
      />
    </>
  )
}

function FieldError({ children }: { children: React.ReactNode }) {
  return (
    <p role="alert" className="-mt-1 pb-1 text-right text-caption text-error">
      {children}
    </p>
  )
}

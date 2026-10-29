import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router'
import { handleApiError, isApiError } from '../../api'
import { paths } from '../../app/paths'
import { BottomSheet, Dialog, RowField, RowFieldInput, SheetContentOption, type BottomSheetCtaValue } from '../../ds'
import { toast } from '../../notifications'
import { clock } from '../payments/clock'
import { SheetSkeleton } from '../payments/components/SheetParts'
import { tripFxQuery } from '../wallet/api'
import {
  createWalletEntry,
  deleteWalletEntry,
  invalidateManual,
  latestFxQuery,
  tripCandidatesQuery,
  updateWalletEntry,
  walletEntriesQuery,
} from './api'
import { AmountField } from './components'
import { COPY, FIELD_COPY, manualFieldErrors, type ManualFieldErrors } from './form'
import { useDateStep } from './useDateStep'
import {
  allowedCurrencies,
  candidateSubtitle,
  dateValueLabel,
  fractionDigitsOf,
  isPositiveAmount,
  newClientRequestId,
  normalizeAmount,
  overKrwLimit,
  previewKrw,
  sanitizeMemo,
  trimAmount,
  tripRatePerUnit,
} from './rules'
import { MANUAL_MEMO_MAX_LENGTH, type UpdateWalletEntryRequest, type WalletEntry } from './types'

// WF-48 지갑 결제 추가 · WF-48b 여정 선택(같은 시트 안 단계) · WF-50 결제 수정(지갑 폼) · WF-50b 공동 삭제 다이얼로그.
// 여정 행 기본값 = trip-candidates의 suggestedTripId(날짜가 기간 안인 여정). 연결되면 그 여정에 미확정으로 들어간다.

type Step = 'form' | 'trip' | 'date'
const NONE = 'none'

/** /wallet/new */
export function NewWalletEntryPage() {
  const close = useClose()
  return <WalletEntryForm onClose={close} />
}

/** /wallet/:entryId/edit — 목록 캐시에서 항목을 찾는다(단건 API가 없다). 다 받아도 없으면 닫는다 */
export function EditWalletEntryPage() {
  const { entryId = '' } = useParams()
  const close = useClose()
  const query = useInfiniteQuery(walletEntriesQuery())
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = query
  const entry = query.data?.pages.flatMap((p) => p.items).find((e) => e.id === entryId)
  const missing = !entry && query.isSuccess && !hasNextPage

  useEffect(() => {
    if (!entry && hasNextPage && !isFetchingNextPage) void fetchNextPage()
    if (missing || query.isError) close()
  })

  if (!entry) {
    return (
      <BottomSheet open title="결제 수정" onClose={close}>
        <SheetSkeleton />
      </BottomSheet>
    )
  }
  return <WalletEntryForm key={`${entry.id}:${entry.version}`} entry={entry} onClose={close} />
}

function useClose() {
  const navigate = useNavigate()
  const location = useLocation()
  const closed = useRef(false)
  return () => {
    if (closed.current) return
    closed.current = true
    if ((location.state as { fromList?: boolean } | null)?.fromList) navigate(-1)
    else navigate(paths.wallet(), { replace: true })
  }
}

/** 여정 고르기: auto = 날짜로 추천(사용자가 직접 고르기 전), 그 밖 = 고른 여정(null = 추가 안 함) */
type TripPick = { mode: 'auto' } | { mode: 'picked'; tripId: string | null }

function WalletEntryForm({ entry, onClose }: { entry?: WalletEntry; onClose: () => void }) {
  const queryClient = useQueryClient()
  const editing = Boolean(entry)
  const editable = new Set(entry?.editableFields ?? ['amount', 'currency', 'memo', 'occurredAt'])
  const moneyLocked = !editable.has('amount')
  const canChangeTrip = entry ? entry.canChangeTrip : true
  const [now] = useState(() => clock.now())
  const [clientRequestId] = useState(newClientRequestId)
  // 추가는 열자마자 금액 입력(숫자 키패드). 수정은 시트 기본(제목)
  const amountRef = useRef<HTMLInputElement>(null)

  const [step, setStep] = useState<Step>('form')
  const [amount, setAmount] = useState(() => (entry ? trimAmount(entry.amount.replace(/^-/, ''), fractionDigitsOf(entry.currency)) : ''))
  const [currencyPick, setCurrencyPick] = useState<string | null>(entry?.currency ?? null)
  const [memo, setMemo] = useState(entry?.memo ?? '')
  const [occurredAt, setOccurredAt] = useState<string | null>(entry?.occurredAt ?? null)
  const [pick, setPick] = useState<TripPick>(entry ? { mode: 'picked', tripId: entry.linkedTrip?.tripId ?? null } : { mode: 'auto' })
  const [errors, setErrors] = useState<ManualFieldErrors>({})
  const [confirmDelete, setConfirmDelete] = useState(false)
  const dateStep = useDateStep(now)

  // 추천·후보는 결제 시각 기준. 수정에서는 후보 목록만 쓴다(여정 행을 바꿀 수 있을 때)
  const at = occurredAt ?? new Date(now).toISOString()
  const candidates = useQuery({ ...tripCandidatesQuery(at), enabled: !entry || canChangeTrip })
  const items = candidates.data?.items ?? []
  const defaultCurrency = candidates.data?.defaultCurrency ?? 'KRW'
  const tripId = pick.mode === 'picked' ? pick.tripId : (candidates.data?.suggestedTripId ?? null)
  const tripLoading = pick.mode === 'auto' && candidates.isPending
  const selected = items.find((c) => c.tripId === tripId)
  const tripName = selected?.groupName ?? (entry?.linkedTrip?.tripId === tripId ? entry?.linkedTrip?.groupName : undefined)

  // 통화: KRW ↔ 연결 여정 통화, 연결이 없으면 KRW ↔ defaultCurrency(수정은 항목의 외화 통화). 허용 밖이면 그 여정(기본) 통화로 보정
  const tripCurrency = selected?.currency ?? (entry?.linkedTrip?.tripId === tripId && tripId ? entry.currency : null)
  const other = tripId ? tripCurrency : entry && entry.currency !== 'KRW' ? entry.currency : defaultCurrency
  const allowed = allowedCurrencies(other)
  const fallbackCurrency = other ?? 'KRW'
  const currency = currencyPick && allowed.includes(currencyPick) ? currencyPick : fallbackCurrency
  const digits = fractionDigitsOf(currency)
  const shownAmount = trimAmount(amount, digits)

  const tripFx = useQuery({ ...tripFxQuery(tripId ?? ''), enabled: Boolean(tripId) && currency !== 'KRW', meta: { silent: true } })
  const spotFx = useQuery({ ...latestFxQuery(currency), enabled: !tripId && currency !== 'KRW' })
  const rate = tripId ? tripRatePerUnit(tripFx.data) : (spotFx.data?.rate ?? null)
  const krw = previewKrw(shownAmount, currency, rate)
  const valid = isPositiveAmount(shownAmount) && !overKrwLimit(krw)

  // 수정: 바뀐 필드만
  const changes: Omit<UpdateWalletEntryRequest, 'version'> = {}
  if (entry) {
    if (!moneyLocked && (Number(normalizeAmount(shownAmount)) !== Math.abs(Number(entry.amount)) || currency !== entry.currency)) {
      changes.amount = normalizeAmount(shownAmount)
      changes.currency = currency
    }
    if (memo.trim() !== (entry.memo ?? '')) changes.memo = memo.trim()
    if (!moneyLocked && occurredAt && occurredAt !== entry.occurredAt) changes.occurredAt = occurredAt
    if (canChangeTrip && tripId !== (entry.linkedTrip?.tripId ?? null)) changes.tripId = tripId
  }
  const dirty = Object.keys(changes).length > 0

  // 서버 에러의 화면 처리(화면명세 K-0)
  const recommendAgain = () => {
    setPick({ mode: 'auto' })
    void candidates.refetch()
  }
  const fail = (error: unknown) => {
    setConfirmDelete(false)
    const fields = manualFieldErrors(error)
    if (fields) {
      if (fields.currency) setCurrencyPick(null)
      if (fields.tripId) recommendAgain()
      return setErrors({ ...fields, amount: fields.amount ?? fields.currency })
    }
    if (!isApiError(error)) return handleApiError(error)
    switch (error.code) {
      case 'SHARED_DELETE_CONFIRM_REQUIRED':
        return setConfirmDelete(true)
      case 'NOT_FOUND':
        // 고른 여정이 내 여정이 아님(추가) · 항목이 없어짐(수정)
        if (!entry) {
          recommendAgain()
          return setErrors({ tripId: FIELD_COPY.tripId })
        }
        handleApiError(error)
        void invalidateManual(queryClient)
        return onClose()
      case 'TRIP_PHASE_INVALID':
        // 고른 여정이 그사이 종료 → 시트 유지, 여정 행 다시 추천
        recommendAgain()
        return void toast.error(COPY.retry)
      case 'VALIDATION_FAILED':
        return void toast.error(COPY.retry)
      case 'VERSION_CONFLICT':
      case 'EXPENSE_LOCKED':
        // 목록을 다시 받으면 새 version으로 폼이 다시 채워지거나(key) editableFields·canChangeTrip대로 잠긴다
        if (error.code === 'VERSION_CONFLICT') handleApiError(error)
        return void invalidateManual(queryClient)
      case 'NOT_AUTHOR':
      case 'NOT_MANUAL_ENTRY':
        handleApiError(error)
        void invalidateManual(queryClient)
        return onClose()
      default:
        handleApiError(error)
    }
  }

  const create = useMutation({
    mutationFn: () =>
      createWalletEntry({
        amount: normalizeAmount(shownAmount),
        currency,
        ...(memo.trim() && { memo: memo.trim() }),
        ...(occurredAt && { occurredAt }),
        // 보이는 여정 행 값을 그대로 보낸다(4-11-3 — 추천과 저장이 어긋나지 않게)
        tripId,
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
    mutationFn: () => updateWalletEntry(entry!.id, { version: entry!.version, ...changes }),
    meta: { silent: true },
    onSuccess: () => {
      toast.success(COPY.saved)
      void invalidateManual(queryClient)
      onClose()
    },
    onError: fail,
  })

  const remove = useMutation({
    mutationFn: (includeShared: boolean) => deleteWalletEntry(entry!.id, includeShared),
    meta: { silent: true },
    onSuccess: () => {
      toast.success(COPY.deleted)
      const linked = entry!.linkedTrip
      void invalidateManual(queryClient, linked ? { tripId: linked.tripId, expenseId: linked.expenseId } : undefined)
      onClose()
    },
    onError: fail,
  })

  const busy = create.isPending || save.isPending || remove.isPending
  // 열린 여정의 공동 결제에 연결된 항목은 먼저 묻는다(WF-50b). 서버 409가 와도 같은 다이얼로그
  const sharedOpen = entry?.linkedTrip?.expenseStatus === 'SHARED' && entry.linkedTrip.tripStatus !== 'ENDED'
  const submitDelete = () => {
    if (!entry || busy) return
    if (sharedOpen) return setConfirmDelete(true)
    remove.mutate(false)
  }

  const formCta: BottomSheetCtaValue = editing
    ? {
        layout: 'horizontal',
        secondary: {
          label: '삭제',
          type: 'danger-weak',
          onClick: submitDelete,
          state: remove.isPending && !confirmDelete ? 'loading' : entry?.canDelete === false ? 'disabled' : 'default',
        },
        primary: { label: '저장', onClick: () => dirty && valid && !busy && save.mutate(), state: save.isPending ? 'loading' : dirty && valid ? 'default' : 'disabled' },
      }
    : { label: '추가', onClick: () => valid && !busy && !tripLoading && create.mutate(), state: create.isPending ? 'loading' : valid && !tripLoading ? 'default' : 'disabled' }

  const titles: Record<Step, string> = { form: editing ? '결제 수정' : '결제 내역 추가', trip: '여정', date: '날짜' }
  // 날짜 단계는 시트 CTA를 끄고 SheetContentDateTime의 "확인"을 쓴다(HF-46d)
  const cta = step === 'form' ? formCta : undefined

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
              value={shownAmount}
              onChange={(raw) => {
                setAmount(raw)
                setErrors((e) => ({ ...e, amount: undefined }))
              }}
              currency={currency}
              allowed={allowed}
              onCurrencyChange={setCurrencyPick}
              digits={digits}
              krw={krw}
              disabled={moneyLocked}
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
            <RowField
              label="날짜"
              value={dateValueLabel(occurredAt)}
              disabled={moneyLocked}
              onClick={() => {
                dateStep.begin(occurredAt)
                setStep('date')
              }}
            />
            {errors.occurredAt && <FieldError>{errors.occurredAt}</FieldError>}
            <RowField
              label="여정"
              value={tripLoading ? undefined : (tripName ?? COPY.noTrip)}
              placeholder={tripLoading ? <span className="inline-block h-4 w-20 animate-pulse rounded-sm bg-subtle" /> : undefined}
              disabled={!canChangeTrip}
              aria-busy={tripLoading || undefined}
              onClick={() => {
                setErrors((e) => ({ ...e, tripId: undefined }))
                setStep('trip')
              }}
            />
            {errors.tripId && <FieldError>{errors.tripId}</FieldError>}
          </fieldset>
        )}
        {step === 'trip' && (
          <SheetContentOption
            aria-label="여정"
            value={tripId ?? NONE}
            onSelect={(value: string) => {
              // 탭하면 바로 돌아간다(완료 없음). 이미 고른 여정·"추가 안 함"을 다시 눌러도 돌아간다(onSelect — 라디오 onChange는 안 온다)
              setPick({ mode: 'picked', tripId: value === NONE ? null : value })
              setStep('form')
            }}
            options={[
              ...items.map((c) => ({ value: c.tripId, logo: false, title: c.groupName, subtitle: candidateSubtitle(c) })),
              { value: NONE, logo: false, title: COPY.noTrip },
            ]}
          />
        )}
        {step === 'date' &&
          dateStep.body((iso) => {
            setOccurredAt(iso)
            setErrors((e) => ({ ...e, occurredAt: undefined }))
            setStep('form')
          })}
      </BottomSheet>
      {/* WF-50b: 지갑 쪽 공동 결제 삭제 → includeShared=true */}
      <Dialog
        open={confirmDelete}
        type="danger"
        title={COPY.sharedDeleteWallet}
        message={COPY.sharedDeleteMessage}
        confirmLabel="삭제"
        confirmState={remove.isPending ? 'loading' : 'default'}
        onCancel={() => !remove.isPending && setConfirmDelete(false)}
        onConfirm={() => remove.mutate(true)}
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

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { clsx } from 'clsx'
import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router'
import { handleApiError, isApiError, keys, type MemberSummary } from '../../../api'
import { paths } from '../../../app/paths'
import { useTripDetail } from '../../../app/trip'
import {
  BottomSheet,
  Dialog,
  formatKrw,
  orderMembers,
  SheetContentPaymentDetail,
  SheetContentReadOnly,
  splitEvenly,
} from '../../../ds'
import { toast } from '../../../notifications'
import { classifyExpense, dismissDuplicate, expenseQuery, findCachedExpense } from '../api'
import { DetailText, LockedButton, LockedPersonal, RefundFacts, RefundSummary, SheetSkeleton } from '../components/SheetParts'
import {
  detailLine,
  initialDraft,
  participantCandidates,
  perPersonText,
  remainderLabel,
  sheetCta,
  sheetMode,
  SUCCESS_TOAST,
  toPerson,
} from '../rules'
import type { ClassificationInput, ExpenseRow, PaymentDetail, SheetAction, SheetDraft, SheetMode } from '../types'

// 409 처리 문구(명세 v0.5)
const COPY = {
  versionConflict: '최신 내용으로 바뀌었어요',
  sharedInOtherTrip: '다른 여정에서 이미 공동으로 확정됐어요',
  dismissed: '중복 표시를 해제했어요',
}

/**
 * 결제 상세 시트(/trips/:tripId/payments/:expenseId, 화면명세 부록 A).
 * 결제자 · 진행 중 = 편집(HF-20·21·31·35~37), 비결제자·결제자 나감 = 읽기 전용(HF-38), 종료 후 = 잠금(HF-39), 환불 묶음 = HF-41.
 * 낙관적 업데이트는 하지 않는다 — 저장 응답을 받은 뒤 닫고 여정 키 전체를 무효화한다.
 */
export default function PaymentSheet() {
  const { expenseId = '' } = useParams()
  const trip = useTripDetail()
  const navigate = useNavigate()
  const location = useLocation()
  const queryClient = useQueryClient()
  const query = useQuery(expenseQuery(trip.tripId, expenseId))
  const [preview] = useState(() => findCachedExpense(queryClient, trip.tripId, expenseId))

  const closed = useRef(false)
  const close = () => {
    if (closed.current) return
    closed.current = true
    if ((location.state as { fromList?: boolean } | null)?.fromList) navigate(-1)
    else navigate({ pathname: paths.payments(trip.tripId), search: location.search }, { replace: true })
  }

  // 남의 미확정·개인(또는 없는 결제) → 404 → 시트를 닫고 목록(FR-503)
  const notFound = isApiError(query.error) && query.error.status === 404
  useEffect(() => {
    if (notFound) close()
  })

  return <SheetView key={expenseId} detail={query.data} preview={preview} onClose={close} />
}

type SheetViewProps = {
  /** 상세 응답 전이면 undefined — 목록에서 받은 머리(preview)만 그린다 */
  detail: PaymentDetail | undefined
  preview: ExpenseRow | undefined
  onClose: () => void
}

/** 시트 하나(<dialog>)를 로딩 → 상세까지 그대로 쓴다(다시 열리며 깜빡이지 않게) */
function SheetView({ detail, preview, onClose }: SheetViewProps) {
  const trip = useTripDetail()
  const queryClient = useQueryClient()
  const mode = detail ? sheetMode(detail) : null
  const editable = mode !== null && mode.startsWith('EDIT')
  const candidates = detail ? participantCandidates(trip, detail) : []
  const activeIds = candidates.filter((m) => !m.isLeft).map((m) => m.membershipId)

  // 고르는 중인 값. 서버 상태(version·status)가 바뀌면 그 값에서 다시 시작한다
  const draftKey = detail ? `${detail.version}:${detail.status}` : ''
  const [draftState, setDraftState] = useState<{ key: string; draft: SheetDraft } | null>(null)
  const [sharedBlocked, setSharedBlocked] = useState(false)
  const base: SheetDraft = detail ? initialDraft(detail, activeIds) : { type: 'shared', selected: [] }
  const draft: SheetDraft =
    draftState?.key === draftKey ? draftState.draft : sharedBlocked ? { ...base, type: 'personal' } : base
  const setDraft = (next: SheetDraft) => setDraftState({ key: draftKey, draft: next })
  const [confirmOpen, setConfirmOpen] = useState(false)
  const expenseId = detail?.id ?? preview?.id ?? ''
  const version = detail?.version ?? 0

  const invalidate = () => queryClient.invalidateQueries({ queryKey: keys.trips.detail(trip.tripId) })

  const classify = useMutation({
    mutationFn: (input: ClassificationInput) => classifyExpense(trip.tripId, expenseId, input),
    meta: { silent: true },
    onError: (error) => {
      setConfirmOpen(false)
      if (isApiError(error) && error.code === 'VERSION_CONFLICT' && error.details?.current) {
        // 최신 결제로 시트를 다시 그린다(details.current = ExpenseDetailResponse)
        queryClient.setQueryData(keys.trips.expense(trip.tripId, expenseId), error.details.current as PaymentDetail)
        handleApiError(error)
      } else if (isApiError(error) && error.code === 'SHARED_IN_OTHER_TRIP') {
        // 시트는 그대로, [개인]만 고를 수 있다
        setSharedBlocked(true)
        setDraft({ ...draft, type: 'personal' })
        toast.info(COPY.sharedInOtherTrip)
        return
      } else {
        // EXPENSE_LOCKED·TRIP_PHASE_INVALID → 잠금, NOT_PAYER → 읽기 전용, PARTICIPANT_NOT_MEMBER → 멤버 다시 받기
        handleApiError(error)
      }
      void invalidate()
    },
  })

  const dismiss = useMutation({
    mutationFn: () => dismissDuplicate(trip.tripId, expenseId, version),
    onSuccess: () => toast.success(COPY.dismissed),
    onSettled: () => invalidate(),
  })

  const submit = (action: SheetAction, input: ClassificationInput) => {
    if (classify.isPending) return
    classify.mutate(input, {
      onSuccess: () => {
        toast.success(SUCCESS_TOAST[action])
        void invalidate()
        onClose()
      },
    })
  }

  const run = (action: SheetAction) => {
    if (action === 'TO_PERSONAL') return setConfirmOpen(true)
    if (action === 'CONFIRM_PERSONAL') return submit(action, { status: 'PERSONAL', version })
    submit(action, { status: 'SHARED', participantMembershipIds: [...draft.selected], version })
  }

  const cta = detail && mode && editable ? sheetCta(mode, draft, detail) : null
  const sharedDisabled = sharedBlocked && cta !== null
  return (
    <>
      <BottomSheet
        open
        title={(detail ?? preview)?.merchantName ?? ''}
        onClose={onClose}
        cta={
          cta
            ? {
                label: cta.label,
                disabled: cta.disabled || classify.isPending || (sharedDisabled && draft.type === 'shared'),
                onClick: () => run(cta.action),
              }
            : undefined
        }
      >
        {!detail || !mode ? (
          <SheetSkeleton amount={preview?.krwAmount} />
        ) : editable ? (
          <EditBody
            detail={detail}
            mode={mode}
            draft={draft}
            candidates={candidates}
            sharedBlocked={sharedBlocked}
            onDraft={setDraft}
            onDismiss={detail.duplicate?.canDismiss ? () => dismiss.mutate() : undefined}
            dismissing={dismiss.isPending}
          />
        ) : (
          <ReadBody detail={detail} locked={mode === 'LOCKED'} />
        )}
      </BottomSheet>
      {/* WF-32: 문구는 DS SharedToPersonal 변형(C-09 반영) 그대로. 취소하면 시트로 돌아가고 [개인] 선택은 남는다 */}
      <Dialog
        open={confirmOpen}
        type="shared-to-personal"
        onCancel={() => setConfirmOpen(false)}
        onConfirm={() => submit('TO_PERSONAL', { status: 'PERSONAL', version, confirmSharedToPersonal: true })}
      />
    </>
  )
}

// 부담 인원 4명 이하면 토글을 시트 폭에 고르게(HF-21: SPACE_BETWEEN + 좌우 8). DS는 왼쪽 정렬이라 배치만 덮는다
const SPREAD_TOGGLES = '[&_[role=group]>div:last-child]:justify-between [&_[role=group]>div:last-child]:px-2'
// [공동]을 고를 수 없을 때(SHARED_IN_OTHER_TRIP) 세그먼트 두 번째 칸을 흐리게
const SHARED_SEGMENT_OFF = '[&_[role=radiogroup]>label:nth-child(2)]:pointer-events-none [&_[role=radiogroup]>label:nth-child(2)]:opacity-40'
// 환불 묶음은 영웅 합계·내역 카드를 위에 따로 그려서 DS 금액 요약을 숨긴다
const HIDE_SUMMARY = '[&>div:first-child]:hidden'

function EditBody({
  detail,
  mode,
  draft,
  candidates,
  sharedBlocked,
  onDraft,
  onDismiss,
  dismissing,
}: {
  detail: PaymentDetail
  mode: SheetMode
  draft: SheetDraft
  candidates: MemberSummary[]
  sharedBlocked: boolean
  onDraft: (draft: SheetDraft) => void
  onDismiss?: () => void
  dismissing: boolean
}) {
  const refund = detail.refunds.length > 0
  const ordered = orderMembers(candidates.map((member) => ({ ...toPerson(member), member })))
  const selectedMembers = ordered.filter((p) => draft.selected.includes(p.member.membershipId)).map((p) => p.member)
  const split = splitEvenly(detail.krwAmount, selectedMembers.length)

  const toggle = (index: number, on: boolean) => {
    const { member } = ordered[index]
    const id = member.membershipId
    // 나간 멤버는 해제만 된다(Q-30)
    if (on && member.isLeft && !draft.selected.includes(id)) return
    onDraft({ ...draft, selected: on ? [...draft.selected, id] : draft.selected.filter((x) => x !== id) })
  }

  return (
    <div className="flex flex-col gap-5">
      {refund && <RefundSummary detail={detail} />}
      <SheetContentPaymentDetail
        className={clsx(ordered.length <= 4 && SPREAD_TOGGLES, sharedBlocked && SHARED_SEGMENT_OFF, refund && HIDE_SUMMARY)}
        merchant=""
        amount={detail.krwAmount}
        detail={<DetailText line={detailLine(detail)} duplicate={detail.flags.duplicateSuspected} onDismiss={onDismiss} dismissing={dismissing} />}
        pending={mode === 'EDIT_PENDING'}
        expenseType={draft.type}
        onExpenseTypeChange={(type) => {
          if (type === 'shared' && sharedBlocked) return
          onDraft({ ...draft, type })
        }}
        participants={ordered.map(({ member, ...person }) => ({ ...person, selected: draft.selected.includes(member.membershipId) }))}
        onParticipantChange={toggle}
        perPerson={<span className="font-amount text-amount-s text-primary">{perPersonText(split.perPerson)}</span>}
        remainder={remainderLabel(split.remainder, selectedMembers, detail.payer.membershipId)}
      />
    </div>
  )
}

function ReadBody({ detail, locked }: { detail: PaymentDetail; locked: boolean }) {
  const payer = toPerson(detail.payer)
  const participants = orderMembers((detail.participants ?? []).map(toPerson))
  const line = <DetailText line={detailLine(detail)} duplicate={detail.flags.duplicateSuspected} />

  if (detail.refunds.length > 0) {
    return (
      <div className="flex flex-col gap-5">
        <RefundSummary detail={detail} />
        <RefundFacts payer={payer} participants={participants} perPerson={detail.status === 'SHARED' ? detail.perPersonKrw : null} />
        {locked && <LockedButton />}
      </div>
    )
  }
  if (detail.status !== 'SHARED') return <LockedPersonal amount={detail.krwAmount} detail={line} />
  return (
    <SheetContentReadOnly
      amount={detail.krwAmount}
      detail={line}
      changed={detail.flags.changed}
      locked={locked}
      payer={payer}
      participants={participants}
      perPerson={detail.perPersonKrw !== null ? formatKrw(detail.perPersonKrw) : undefined}
    />
  )
}

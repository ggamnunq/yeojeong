import { useQuery, useQueryClient } from '@tanstack/react-query'
import { clsx } from 'clsx'
import { useEffect, useId } from 'react'
import { Navigate, useLocation, useNavigate, useParams } from 'react-router'
import { isApiError, keys, type ExpenseListItem } from '../../../api'
import { paths } from '../../../app/paths'
import { useTripDetail } from '../../../app/trip'
import { Avatar, BadgeMe, formatKrw, Icon, orderMembers, PaymentRow, ShellSub, Tag, type SettlementRowNet } from '../../../ds'
import { settlementMemberQuery } from '../api'
import type { SettlementMemberExpenses, SettlementView } from '../types'
import { CardsSkeleton, InlineError, SectionLabel } from '../ui'
import { originalAmountText, paymentDateMeta, settlementText, toPerson } from '../view'

// WF-26·44 / HF-26 멤버별 결제 내역(Sub 셸, 내비 없음). 영웅 = 그 사람의 ±(받을 돈·보낼 돈) + 프사,
// 공동 결제 n건(PaymentRow, 탭 → 결제 상세 시트), 개인 결제는 남이면 건수만 "비공개"(C-02), 본인이면 목록.
export default function SettlementMemberPage() {
  const trip = useTripDetail()
  const { membershipId = '' } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const queryClient = useQueryClient()
  const ended = trip.status === 'ENDED'
  const detail = useQuery({ ...settlementMemberQuery(trip.tripId, membershipId), enabled: ended })
  const status = isApiError(detail.error) ? detail.error.status : null

  // 아직 종료 전(409): 여정을 다시 받는다. 단계가 바뀌면 아래 !ended 분기가 현황으로 보낸다
  useEffect(() => {
    if (status === 409) void queryClient.invalidateQueries({ queryKey: keys.trips.detail(trip.tripId), exact: true })
  }, [status, queryClient, trip.tripId])

  if (!ended) return <Navigate replace to={paths.stats(trip.tripId)} />
  // 정산 대상이 아닌 멤버십(404)은 정산 요약으로
  if (status === 404) return <Navigate replace to={paths.settlement(trip.tripId)} />

  const goBack = () => {
    if (location.key !== 'default') navigate(-1)
    else navigate(paths.settlement(trip.tripId), { replace: true })
  }
  // 응답 전 제목: 정산 요약 캐시 → 활성 멤버 목록
  const cached = queryClient
    .getQueryData<SettlementView>(keys.trips.settlement(trip.tripId))
    ?.members.find((m) => m.member.membershipId === membershipId)
  const data = detail.data
  const member = data?.member ?? cached?.member ?? trip.members.find((m) => m.membershipId === membershipId)
  const left = Boolean(data ? data.isLeft || data.member.isLeft : cached ? cached.isLeft || cached.member.isLeft : false)

  return (
    <ShellSub
      gutter={false}
      header={{
        title: member ? (
          <span className="flex min-w-0 items-center gap-1.5">
            <span className="truncate">{member.nickname}</span>
            {member.isMe && <BadgeMe />}
            {left && <Tag type="left" size="s" />}
          </span>
        ) : (
          ''
        ),
        onBack: goBack,
      }}
    >
      {detail.isPending ? (
        <CardsSkeleton rows={3} />
      ) : !data ? (
        <InlineError onRetry={() => void detail.refetch()} />
      ) : (
        <MemberContent data={data} left={left} />
      )}
    </ShellSub>
  )
}

const NET_COLOR = {
  receive: 'text-amount-receive',
  send: 'text-amount-send',
  even: 'text-amount-default',
} satisfies Record<SettlementRowNet, string>

function MemberContent({ data, left }: { data: SettlementMemberExpenses; left: boolean }) {
  const heroId = useId()
  const sharedId = useId()
  const personalId = useId()
  const s = settlementText(data.direction, data.netKrw)
  const shared = data.sharedPayments
  const personal = data.personalPayments

  return (
    <div className="flex flex-col pb-8">
      <div className="px-gutter">
        {/* 영웅 카드 · 톤: "보낼 돈" → −₩26,340(40, 보낼 돈 색) + 프사 L · 아래 "결제 ₩ · 부담 ₩" */}
        <section aria-labelledby={heroId} className="flex flex-col rounded-xl bg-subtle px-5 pt-6 pb-5">
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 flex-col gap-1">
              <h2 id={heroId} className="text-body-s text-secondary">
                {s.label}
              </h2>
              <p className={clsx('font-amount text-amount-xl whitespace-nowrap', NET_COLOR[s.net])}>{s.amount}</p>
            </div>
            <Avatar {...toPerson(data.member, left)} size="l" ring alt="" />
          </div>
          <dl className="mt-2 flex items-center gap-1.5 text-body-s whitespace-nowrap">
            <div className="flex items-center gap-1.5">
              <dt className="text-secondary">결제</dt>
              <dd className="text-body-s-strong text-primary">{formatKrw(data.paidKrw)}</dd>
            </div>
            <span aria-hidden className="text-tertiary">
              ·
            </span>
            <div className="flex items-center gap-1.5">
              <dt className="text-secondary">부담</dt>
              <dd className="text-body-s-strong text-primary">{formatKrw(data.burdenKrw)}</dd>
            </div>
          </dl>
        </section>
      </div>

      <SectionLabel id={sharedId} className="px-gutter pt-8 pb-1">
        공동 결제 {shared.length}건
      </SectionLabel>
      {shared.length > 0 && <PaymentList items={shared} labelledBy={sharedId} />}

      {personal ? (
        <>
          <SectionLabel id={personalId} className="px-gutter pt-8 pb-1">
            개인 결제 {data.personalCount}건
          </SectionLabel>
          {personal.length > 0 && <PaymentList items={personal} labelledBy={personalId} />}
        </>
      ) : (
        // 남의 개인 결제: 건수만(가맹점·금액·날짜는 응답에도 없다). 0건이면 비공개 라벨 없음
        <div className="px-gutter pt-5">
          <div className="flex items-center justify-between gap-3 rounded-lg bg-subtle py-4 pr-4 pl-5">
            <h2 className="text-body-m-strong text-primary">개인 결제 {data.personalCount}건</h2>
            {data.personalCount > 0 && (
              <span className="flex items-center gap-1 text-body-s whitespace-nowrap text-tertiary">
                <Icon name="lock" size={16} className="shrink-0 text-icon-subtle" />
                비공개
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

/** 결제 행 목록. 공동 = 부담 인원 스택, 개인 = 「개인」 태그. 탭 → 결제 상세 시트(결제내역 플로우의 시트 라우트) */
function PaymentList({ items, labelledBy }: { items: ExpenseListItem[]; labelledBy: string }) {
  const trip = useTripDetail()
  const navigate = useNavigate()
  return (
    <ul aria-labelledby={labelledBy}>
      {items.map((e) => {
        const payer = toPerson(e.payer)
        return (
          <li key={e.id}>
            <PaymentRow
              type={e.status === 'SHARED' ? 'shared' : 'personal'}
              payer={payer}
              merchant={e.merchantName}
              meta={paymentDateMeta(e.occurredAt, payer)}
              amount={e.krwAmount}
              originalAmount={originalAmountText(e.originalAmount, e.originalCurrency)}
              participants={e.participants ? orderMembers(e.participants.map((p) => toPerson(p))) : undefined}
              changed={e.flags.changed}
              onClick={() => navigate(paths.payment(trip.tripId, e.id))}
            />
          </li>
        )
      })}
    </ul>
  )
}

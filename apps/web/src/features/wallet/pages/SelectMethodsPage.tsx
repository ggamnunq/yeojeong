import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useId, useState } from 'react'
import { Navigate, useNavigate, useSearchParams } from 'react-router'
import { isApiError, keys } from '../../../api'
import { paths, safeReturnTo } from '../../../app/paths'
import { LoadingScreen } from '../../../app/states'
import { Checkbox, Icon, ShellOnboarding } from '../../../ds'
import { attemptQuery, candidatesQuery, confirmConnection } from '../api'
import { connectPath, external, originPath, readAttemptContext, writeAttemptContext } from '../connect'
import { displayMaskedNumber } from '../format'
import type { ConnectionCandidate } from '../types'

/** WF-07 불러올 계좌·카드. 후보를 계좌 → 카드로 묶어 체크하고 "{n}개 연결" */
export default function SelectMethodsPage() {
  const [params] = useSearchParams()
  const attemptId = params.get('attempt')
  if (!attemptId) return <Navigate replace to={paths.wallet()} />
  return <SelectMethods key={attemptId} attemptId={attemptId} returnTo={safeReturnTo(params.get('returnTo'))} />
}

function SelectMethods({ attemptId, returnTo }: { attemptId: string; returnTo: string | null }) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [context] = useState(() => readAttemptContext(attemptId))
  const attempt = useQuery({ ...attemptQuery(attemptId), enabled: !context.purpose })
  const purpose = context.purpose ?? attempt.data?.purpose
  const candidates = useQuery(candidatesQuery(attemptId))
  const [picked, setPicked] = useState<ReadonlySet<string> | null>(null)
  const selected = picked ?? new Set(candidates.data?.filter((c) => c.preselected).map((c) => c.candidateId))
  const origin = originPath(purpose, context.from)
  // 시도가 만료(410)되면 WF-06이 "연결 시간이 지났어요" + 「다시 연결」을 보여 준다
  const toExpired = () => navigate(connectPath('toss', attemptId, { returnTo }), { replace: true })

  // 인증 창(새 창)이 콜백으로 여기 돌아왔으면 닫는다. 원래 탭이 폴링으로 이 화면을 이어 연다
  useEffect(() => {
    external.closeIfAuthWindow()
  }, [])

  const failed = isApiError(candidates.error) ? candidates.error.status : null
  useEffect(() => {
    if (failed === null) return
    navigate(failed === 410 ? connectPath('toss', attemptId, { returnTo }) : origin, { replace: true })
  }, [failed, origin, navigate, attemptId, returnTo])

  const confirm = useMutation({
    mutationFn: (candidateIds: string[]) => confirmConnection(attemptId, { candidateIds }),
    onSuccess: (result) => {
      writeAttemptContext(attemptId, { result })
      void queryClient.invalidateQueries({ queryKey: keys.wallet.all })
      void queryClient.invalidateQueries({ queryKey: keys.session })
      void queryClient.invalidateQueries({ queryKey: keys.me })
      navigate(connectPath('done', attemptId, { returnTo }), { replace: true })
    },
    onError: (error) => {
      if (isApiError(error) && error.status === 410) toExpired()
    },
  })

  const list = candidates.data ?? []
  const empty = candidates.data !== undefined && list.length === 0
  const allChecked = list.length > 0 && list.every((c) => selected.has(c.candidateId))
  const toggle = (id: string) => {
    const next = new Set(selected)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setPicked(next)
  }

  return (
    <ShellOnboarding
      onBack={() => navigate(origin, { replace: true })}
      progress={purpose === 'SIGNUP' ? 3 : undefined}
      cta={
        empty
          ? { label: '확인', onClick: () => navigate(origin, { replace: true }) }
          : {
                label: `${selected.size}개 연결`,
                disabled: selected.size === 0 || !candidates.data,
                onClick: () => confirm.mutate(list.filter((c) => selected.has(c.candidateId)).map((c) => c.candidateId)),
                state: confirm.isPending ? 'loading' : 'default',
              }
      }
    >
      <h1 className="text-h1 text-primary">불러올 계좌·카드</h1>
      {!candidates.data ? (
        <LoadingScreen inset />
      ) : empty ? (
        <p className="pt-5 text-body-m text-secondary">새로 불러올 계좌·카드가 없어요</p>
      ) : (
        <>
          <Checkbox
            label={<span className="min-w-0 flex-1 text-body-m text-secondary">전체 선택</span>}
            checked={allChecked}
            onChange={() => setPicked(allChecked ? new Set() : new Set(list.map((c) => c.candidateId)))}
            className="mt-5 flex w-full flex-row-reverse"
          />
          <CandidateGroup title="계좌" items={list.filter((c) => c.type === 'ACCOUNT')} selected={selected} onToggle={toggle} />
          <CandidateGroup title="카드" items={list.filter((c) => c.type === 'CARD')} selected={selected} onToggle={toggle} />
        </>
      )}
    </ShellOnboarding>
  )
}

type CandidateGroupProps = {
  title: string
  items: ConnectionCandidate[]
  selected: ReadonlySet<string>
  onToggle: (candidateId: string) => void
}

function CandidateGroup({ title, items, selected, onToggle }: CandidateGroupProps) {
  const id = useId()
  if (items.length === 0) return null
  return (
    <div role="group" aria-labelledby={id} className="flex flex-col">
      <h2 id={id} className="pt-6 pb-1 text-body-s-strong text-secondary">
        {title}
      </h2>
      {items.map((c) => (
        <Checkbox
          key={c.candidateId}
          checked={selected.has(c.candidateId)}
          onChange={() => onToggle(c.candidateId)}
          className="flex w-full flex-row-reverse py-3"
          label={
            <span className="flex min-w-0 flex-1 items-center gap-3.5">
              <span className="grid size-10 shrink-0 place-items-center rounded-full bg-subtle">
                <Icon name={c.type === 'CARD' ? 'card' : 'bank'} size={20} className="text-icon-default" />
              </span>
              <span className="flex min-w-0 flex-col gap-0.5">
                <span className="truncate text-body-m-strong text-primary">{c.productName}</span>
                <span className="truncate text-caption text-tertiary">{displayMaskedNumber(c.type, c.maskedNumber)}</span>
              </span>
            </span>
          }
        />
      ))}
    </div>
  )
}

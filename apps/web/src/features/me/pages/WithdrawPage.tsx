import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router'
import { keys } from '../../../api'
import { paths } from '../../../app/paths'
import { useSession } from '../../../app/session'
import { myTripsQuery } from '../../../app/trip'
import { Checkbox, Dialog, Icon, ShellSub, type IconName } from '../../../ds'
import { toast } from '../../../notifications'
import { forgetInvites } from '../../trips/pendingInvite'
import { useBack } from '../../wallet/useBack'
import { deleteAccount } from '../api'
import { withdrawFacts } from '../rules'

const ICONS = { wallet: 'trash', shared: 'users', leave: 'logout', leader: 'crown', solo: 'calendar' } as const satisfies Record<
  string,
  IconName
>

/**
 * HF-59 탈퇴(앱 안, FR-109 · 약관 제29조②1). 사실 줄 → 확인 체크 → "탈퇴하기"(Danger, 체크 전 비활성) → 확인 다이얼로그(HF-59b) → DELETE /users/me.
 * 그룹장인 여정·나만 남은 여정이 있으면 줄을 더한다(HF-59c, /me/trips의 isLeader·memberCount). 끝나면 로그인(HF-02) + "탈퇴했어요"(HF-59d).
 * 재동의 화면에서도 올 수 있다(약관 제3조⑤ — 동의 전에도 탈퇴는 할 수 있다). 서버는 DELETE /users/me를 재동의 전에도 받지만
 * 다른 API(GET /me/trips 등)는 막으므로, 그때는 여정 목록을 묻지 않고 고정 사실 3줄만 그린다.
 * 이메일 탈퇴는 로그인할 수 없는 회원의 보조 경로라 앱에 진입점이 없다(운영자가 관리자 페이지로 처리)
 */
export default function WithdrawPage() {
  const back = useBack(paths.me())
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [checked, setChecked] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const session = useSession()
  const reconsenting = session.reconsentRequired !== null
  // 못 받으면 조건부 줄만 빠진다(탈퇴는 그대로 할 수 있다). 재동의 대기 중에는 묻지 않는다(403)
  const trips = useQuery({ ...myTripsQuery(), enabled: !reconsenting, meta: { silent: true } })
  const facts = withdrawFacts(reconsenting ? [] : (trips.data?.items ?? []))

  const done = useRef(false)
  const withdraw = useMutation({
    mutationFn: deleteAccount,
    meta: { silent: true },
    onSuccess: async () => {
      // 로그아웃과 같은 순서: 세션 쿼리를 지우고 로그인으로 → 이 화면이 떨어지면 남은 캐시를 비운다(아래 effect)
      done.current = true
      setConfirming(false)
      forgetInvites()
      queryClient.removeQueries({ queryKey: keys.session, exact: true })
      await navigate(paths.login(), { replace: true })
      toast.success('탈퇴했어요')
    },
    onError: () => {
      setConfirming(false)
      toast.error('잠시 후 다시 시도해 주세요')
    },
  })
  useEffect(
    () => () => {
      if (!done.current) return
      queryClient.removeQueries({ predicate: (q) => q.queryKey[0] !== keys.session[0] })
      queryClient.getMutationCache().clear()
    },
    [queryClient],
  )

  return (
    <ShellSub
      header={{ title: '탈퇴', onBack: back }}
      cta={{
        label: '탈퇴하기',
        type: 'danger',
        state: withdraw.isPending ? 'loading' : checked ? 'default' : 'disabled',
        onClick: () => setConfirming(true),
      }}
    >
      <ul className="flex flex-col gap-5 pt-2">
        {facts.map((fact) => (
          <Fact key={fact.id} icon={ICONS[fact.id]}>
            {fact.strong && <span className="text-body-m-strong">{fact.strong}</span>}
            {fact.rest}
          </Fact>
        ))}
      </ul>
      <Checkbox
        className="mt-8"
        label="위 내용을 확인했어요"
        checked={checked}
        onChange={(event) => setChecked(event.currentTarget.checked)}
      />
      <Dialog
        open={confirming}
        type="danger"
        title="탈퇴할까요?"
        message="되돌릴 수 없어요"
        confirmLabel="탈퇴"
        confirmState={withdraw.isPending ? 'loading' : 'default'}
        onCancel={() => {
          if (!withdraw.isPending) setConfirming(false)
        }}
        onConfirm={() => withdraw.mutate()}
      />
    </ShellSub>
  )
}

function Fact({ icon, children }: { icon: IconName; children: ReactNode }) {
  return (
    <li className="flex items-center gap-3.5">
      <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-subtle">
        <Icon name={icon} size={20} className="text-icon-default" />
      </span>
      <span className="min-w-0 text-body-m text-primary">{children}</span>
    </li>
  )
}

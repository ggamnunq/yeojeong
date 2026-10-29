import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { clsx } from 'clsx'
import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { keys } from '../../../api'
import { paths } from '../../../app/paths'
import { useSession } from '../../../app/session'
import { ErrorScreen, LoadingScreen } from '../../../app/states'
import { Avatar, Dialog, Icon, ShellSub, Tag } from '../../../ds'
import { focusRing } from '../../../ds/styles'
import { toast } from '../../../notifications'
import { paymentMethodsQuery } from '../../wallet/api'
import { formatMethodCounts } from '../../wallet/format'
import { useBack } from '../../wallet/useBack'
import { logout, meQuery, requestDeletion } from '../api'
import { mailto } from '../mailto'
import type { DeletionRequestResponse } from '../types'

/** WF-30 마이페이지: 프사·닉네임 → 내 지갑 → (아래) 로그아웃 · 탈퇴·삭제 요청 · 푸터 링크(C-03 사용자 결정) */
export default function MePage() {
  const back = useBack(paths.splash())
  const session = useSession()
  const me = useQuery({ ...meQuery(), placeholderData: session.user ?? undefined })

  return (
    <ShellSub header={{ title: '마이페이지', onBack: back }}>
      {me.data ? (
        <MeContent nickname={me.data.nickname} profileImageUrl={me.data.profileImageUrl} />
      ) : me.isPending ? (
        <LoadingScreen inset />
      ) : (
        <ErrorScreen error={me.error} onRetry={() => void me.refetch()} />
      )}
    </ShellSub>
  )
}

function MeContent({ nickname, profileImageUrl }: { nickname: string; profileImageUrl: string | null }) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const methods = useQuery(paymentMethodsQuery())
  const [deletion, setDeletion] = useState<DeletionRequestResponse | null>(null)

  const signedOut = useRef(false)

  const signOut = useMutation({
    mutationFn: logout,
    onSuccess: async () => {
      // 세션 쿼리를 지우고(로그인 화면 가드가 새로 묻는다) 이동한다. 남은 캐시는 이 화면이 떨어질 때 비운다(아래 effect).
      // - 세션을 ANONYMOUS로 덮으면 이동(transition)이 끝나기 전에 RequireAuth가 먼저 /login?returnTo=/me로 보낸다
      // - 이 화면이 붙어 있을 때 queryClient.clear()를 부르면 이 화면 쿼리가 401로 다시 불려 같은 일이 생긴다
      signedOut.current = true
      queryClient.removeQueries({ queryKey: keys.session, exact: true })
      await navigate(paths.login(), { replace: true })
    },
  })
  // 로그아웃 뒤 이 화면이 떨어지면 다른 사람이 보면 안 되는 캐시를 모두 비운다(세션 쿼리는 로그인 화면 가드가 쓰는 중)
  useEffect(
    () => () => {
      if (!signedOut.current) return
      queryClient.removeQueries({ predicate: (q) => q.queryKey[0] !== keys.session[0] })
      queryClient.getMutationCache().clear()
    },
    [queryClient],
  )
  const askDeletion = useMutation({ mutationFn: requestDeletion, onSuccess: setDeletion })

  const counts = methods.data
    ? formatMethodCounts(methods.data.counts.accounts, methods.data.counts.cards) || '연결 안 됨'
    : null

  return (
    <>
      <div className="flex items-center gap-4">
        <Avatar size="xl" me name={nickname} src={profileImageUrl} alt="" />
        <h2 className="min-w-0 truncate text-h1 text-primary">{nickname}</h2>
      </div>

      <Link
        to={paths.wallet()}
        className={clsx(
          'mt-8 flex items-center gap-3.5 rounded-lg bg-subtle py-4.5 pr-4 pl-5 transition-[filter] active:brightness-95',
          focusRing,
        )}
      >
        <Icon name="wallet" size={20} className="shrink-0 text-icon-default" />
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="truncate text-body-m-strong text-primary">내 지갑</span>
          {counts !== null && <span className="truncate text-caption text-tertiary">{counts}</span>}
        </span>
        {/* 연결 만료(WF-30). DS Tag에 만료 변형이 없어 중립 회색 칩(미확정과 같은 모양)에 문구만 바꾼다 */}
        {methods.data?.hasExpiredConnection && <Tag type="pending" size="s" label="연결 만료" className="shrink-0" />}
        <Icon name="chevron-right" size={20} className="shrink-0 text-icon-subtle" />
      </Link>

      <div aria-hidden className="min-h-10 flex-1" />

      <div className="flex flex-col items-center pb-4">
        <button
          type="button"
          disabled={signOut.isPending}
          onClick={() => signOut.mutate()}
          className={clsx('flex items-center gap-1.5 rounded-sm px-3 pt-2.5 pb-1 text-body-m text-secondary', focusRing)}
        >
          <Icon name="logout" size={20} className="text-icon-subtle" />
          로그아웃
        </button>
        <button
          type="button"
          disabled={askDeletion.isPending}
          onClick={() => askDeletion.mutate()}
          className={clsx('rounded-sm px-3 pt-1.5 pb-2.5 text-body-s text-secondary', focusRing)}
        >
          탈퇴·삭제 요청
        </button>
        <p className="mt-5 text-caption text-tertiary">
          <Link to={paths.terms()} className={clsx('rounded-xs py-1', focusRing)}>
            이용약관
          </Link>
          {' · '}
          <Link to={paths.privacy()} className={clsx('rounded-xs py-1', focusRing)}>
            개인정보처리방침
          </Link>
        </p>
      </div>

      <Dialog
        open={deletion !== null}
        title="탈퇴·삭제 요청"
        message={
          <button
            type="button"
            className={clsx('rounded-sm px-1 py-0.5 text-body-m text-secondary', focusRing)}
            aria-label={`요청 코드 ${deletion?.code ?? ''} 복사`}
            onClick={() => {
              if (!deletion) return
              void navigator.clipboard.writeText(deletion.code).then(() => toast.success('복사했어요'))
            }}
          >
            요청 코드 <span className="font-amount font-medium text-primary">{deletion?.code}</span>
          </button>
        }
        cancelLabel="닫기"
        confirmLabel="메일 보내기"
        onCancel={() => setDeletion(null)}
        onConfirm={() => {
          if (deletion) mailto.open(deletion.mailto)
          setDeletion(null)
        }}
      />
    </>
  )
}

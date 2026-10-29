import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useId, useState } from 'react'
import { fieldErrors, isApiError, keys, type Me, type SessionResponse } from '../../../api'
import { paths } from '../../../app/paths'
import { useSession } from '../../../app/session'
import { ErrorScreen, LoadingScreen } from '../../../app/states'
import { ShellSub } from '../../../ds'
import { toast } from '../../../notifications'
import { isNicknameValid } from '../../auth/nickname'
import { useBack } from '../../wallet/useBack'
import { meQuery, updateMe } from '../api'
import { ProfileForm } from '../components/ProfileForm'
import { PROFILE_COPY } from '../copy'

/**
 * 내 정보(HF-63, FR-902): 헤더 ‹ "내 정보" → 프사 XL(읽기 전용) + 카카오 안내 → 닉네임(지금 값 채움) → 하단 「저장」.
 * 「저장」은 값이 바뀌고 가입 규칙(1~10자, 제어 문자 불가, 중복 허용)에 맞을 때만. 저장하면 마이페이지로 + 토스트.
 */
export default function ProfilePage() {
  const back = useBack(paths.me())
  const session = useSession()
  const me = useQuery({ ...meQuery(), placeholderData: session.user ?? undefined })

  return me.data ? (
    // 저장 뒤 서버 값이 바뀌면 입력도 새 값에서 시작한다
    <ProfileEditor key={me.data.nickname} me={me.data} onDone={back} onBack={back} />
  ) : (
    <ShellSub header={{ title: PROFILE_COPY.title, onBack: back }}>
      {me.isPending ? <LoadingScreen inset /> : <ErrorScreen error={me.error} onRetry={() => void me.refetch()} />}
    </ShellSub>
  )
}

function ProfileEditor({ me, onDone, onBack }: { me: Me; onDone: () => void; onBack: () => void }) {
  const queryClient = useQueryClient()
  const formId = useId()
  const [value, setValue] = useState(me.nickname)
  const [error, setError] = useState<string | null>(null)

  const save = useMutation({
    mutationFn: updateMe,
    onSuccess: (next) => {
      queryClient.setQueryData(keys.me, next)
      queryClient.setQueryData<SessionResponse>(keys.session, (old) => (old?.user ? { ...old, user: next } : old))
      // 그룹원 · 결제 · 정산 화면의 내 이름(서버가 users에서 조인한다)
      void queryClient.invalidateQueries({ queryKey: keys.trips.all })
      void queryClient.invalidateQueries({ queryKey: ['groups'] })
      toast.success(PROFILE_COPY.saved)
      onDone()
    },
    onError: (e) => {
      // 그 밖의 오류는 전역 처리기가 토스트로 알린다
      if (isApiError(e) && e.code === 'VALIDATION_FAILED') setError(fieldErrors(e).nickname ?? e.message)
    },
  })

  const changed = value.trim() !== me.nickname
  const canSave = changed && isNicknameValid(value)
  const submit = () => {
    if (!canSave || save.isPending) return
    save.mutate({ nickname: value.trim() })
  }

  return (
    <ShellSub
      header={{ title: PROFILE_COPY.title, onBack }}
      cta={{
        label: PROFILE_COPY.save,
        htmlType: 'submit',
        form: formId,
        disabled: !canSave,
        state: save.isPending ? 'loading' : 'default',
      }}
    >
      <ProfileForm
        formId={formId}
        nickname={me.nickname}
        profileImageUrl={me.profileImageUrl}
        value={value}
        error={error}
        onChange={(next) => {
          setValue(next)
          if (error) setError(null)
        }}
        onSubmit={submit}
      />
    </ShellSub>
  )
}

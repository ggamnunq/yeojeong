import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { handleApiError, keys } from '../../../api'
import { accountLinkOf } from '../../../app/features'
import { paths } from '../../../app/paths'
import { useSession } from '../../../app/session'
import { rememberSignupReturnTo } from '../../../app/signupReturnTo'
import { Input, ShellOnboarding } from '../../../ds'
import { forgetInvites } from '../../trips/pendingInvite'
import { postLogout } from '../api'
import { COPY } from '../copy'
import { useFlowState } from '../historyState'
import { signupProgress } from '../steps'
import {
  graphemeLength,
  isNicknameValid,
  NICKNAME_MAX_LENGTH,
  nicknameFromDraft,
  sanitizeNicknameInput,
} from '../nickname'

/** WF-03 닉네임 입력(HF-03, FR-103). 저장은 WF-04 가입 요청에서 함께 보낸다 */
export default function NicknamePage() {
  const session = useSession()
  const queryClient = useQueryClient()
  const { state, patch, navigate } = useFlowState()
  const formId = useId()
  const inputRef = useRef<HTMLInputElement>(null)
  const composing = useRef(false)
  const [value, setValue] = useState(
    () => state.nickname ?? nicknameFromDraft(session.data?.signupDraft?.kakaoNickname),
  )
  const [error, setError] = useState<string | null>(state.nicknameError ?? null)
  const [leaving, setLeaving] = useState(false)

  // 로그인 전에 열려던 경로(서버 가입 대기의 returnTo)를 가입 단계 끝까지 들고 간다. 필드가 없는 응답이면 그대로 둔다
  const draftReturnTo = session.data?.signupDraft?.returnTo
  useEffect(() => {
    if (draftReturnTo !== undefined) rememberSignupReturnTo(draftReturnTo)
  }, [draftReturnTo])

  const change = (next: string) => {
    // 한글 조합 중에는 자르지 않는다(조합이 깨진다). 조합이 끝나면 10자로 맞춘다
    setValue(sanitizeNicknameInput(next, { truncate: !composing.current }))
    if (error) setError(null)
  }

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (!isNicknameValid(value)) return
    const nickname = value.trim()
    // 뒤로 오면 입력값이 남도록 지금 항목에도 적어 둔다
    patch({ nickname, nicknameError: undefined })
    navigate(paths.signupTerms(), { state: { nickname } })
  }

  // ‹ → 로그인. 가입 티켓이 있으면 /login이 다시 이 화면으로 보내므로(RequireGuest) 티켓을 지우고 간다.
  // 돌아올 경로는 RequireSignup이 로그인 주소에 다시 붙인다
  const back = async () => {
    setLeaving(true)
    try {
      await postLogout()
      forgetInvites()
      // 세션이 ANONYMOUS가 되면 RequireSignup이 /login으로 보낸다
      await queryClient.invalidateQueries({ queryKey: keys.session })
    } catch (e) {
      handleApiError(e)
      setLeaving(false)
    }
  }

  return (
    <ShellOnboarding
      {...signupProgress(1, accountLinkOf(session.data))}
      onBack={() => void back()}
      cta={{ label: COPY.next, htmlType: 'submit', form: formId, disabled: !isNicknameValid(value) || leaving }}
    >
      <h1 className="sr-only">닉네임</h1>
      <h2 className="text-h1 text-primary">{COPY.nicknameTitle}</h2>
      <form id={formId} noValidate onSubmit={submit} className="pt-8">
        <Input
          ref={inputRef}
          size="l"
          labelVisible={false}
          label="닉네임"
          name="nickname"
          autoComplete="nickname"
          enterKeyHint="next"
          // 가입 첫 입력이라 바로 쓸 수 있게 포커스를 둔다(Figma State=Focus)
          autoFocus
          value={value}
          error={error !== null}
          helper={error ?? COPY.nicknameHelper(graphemeLength(value), NICKNAME_MAX_LENGTH)}
          onChange={(e) => change(e.currentTarget.value)}
          onCompositionStart={() => {
            composing.current = true
          }}
          onCompositionEnd={(e) => {
            composing.current = false
            change(e.currentTarget.value)
          }}
          onClear={() => {
            change('')
            inputRef.current?.focus()
          }}
        />
      </form>
    </ShellOnboarding>
  )
}

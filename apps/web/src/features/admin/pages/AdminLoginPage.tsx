import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { isApiError } from '../../../api'
import { ADMIN_TOTP } from '@yeojeong/shared'
import { Button, Input, Logo } from '../../../ds'
import { formatWait, isTotpComplete, totpDigits } from '../format'
import { useAdminLogin } from '../hooks'
import { adminPaths, safeAdminReturnTo } from '../paths'

function loginErrorMessage(error: unknown): string {
  if (!isApiError(error)) return '로그인하지 못했어요. 잠시 후 다시 시도해 주세요'
  if (error.code === 'ADMIN_LOGIN_RATE_LIMITED') {
    const fromBody = error.details?.retryAfterSec
    const seconds = typeof fromBody === 'number' ? fromBody : error.retryAfterSec
    return seconds ? `${error.message} (${formatWait(Math.ceil(seconds))} 후)` : error.message
  }
  return error.message
}

/** /admin/login: 아이디·비밀번호·인증 코드(TOTP). 실패 문구는 무엇이 틀렸는지 알려 주지 않는 서버 문구 그대로 */
export default function AdminLoginPage() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [totp, setTotp] = useState('')
  const ready = username !== '' && password !== '' && isTotpComplete(totp)
  const login = useAdminLogin()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const client = useQueryClient()

  // 로그인 화면에는 관리자 데이터를 남기지 않는다(로그아웃·세션 만료 뒤 이전 화면의 캐시)
  useEffect(() => client.clear(), [client])

  const onSubmit = (e: FormEvent) => {
    e.preventDefault()
    if (!ready || login.isPending) return
    login.mutate(
      { username, password, totp },
      {
        onSuccess: () => navigate(safeAdminReturnTo(params.get('returnTo')) ?? adminPaths.users(), { replace: true }),
        // 실패하면 비밀번호와 인증 코드를 비운다(아이디는 남긴다)
        onError: () => {
          setPassword('')
          setTotp('')
        },
      },
    )
  }

  return (
    <main className="flex min-h-svh items-center justify-center bg-canvas px-4 py-10">
      <form
        onSubmit={onSubmit}
        aria-labelledby="admin-login-title"
        className="flex w-full max-w-sm flex-col gap-5 rounded-xl bg-surface p-6 shadow-elevation-2 sm:p-8"
      >
        <div className="flex items-center gap-2">
          <Logo height={28} />
          <h1 id="admin-login-title" className="text-h2 text-primary">
            관리자 로그인
          </h1>
        </div>
        <Input
          label="아이디"
          name="username"
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          maxLength={64}
          value={username}
          onChange={(e) => setUsername(e.target.value)}
        />
        <Input
          label="비밀번호"
          type="password"
          name="password"
          autoComplete="current-password"
          maxLength={256}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <Input
          label="인증 코드"
          name="totp"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9]{6}"
          maxLength={ADMIN_TOTP.DIGITS}
          value={totp}
          onChange={(e) => setTotp(totpDigits(e.target.value))}
        />
        {login.isError && (
          <p role="alert" className="text-body-s text-error">
            {loginErrorMessage(login.error)}
          </p>
        )}
        <Button
          htmlType="submit"
          type="primary"
          size="l"
          label="로그인"
          state={login.isPending ? 'loading' : 'default'}
          disabled={!ready}
          className="w-full"
        />
      </form>
    </main>
  )
}

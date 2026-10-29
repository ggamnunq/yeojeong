import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router'
import { handleApiError, keys } from '../../../api'
import { paths } from '../../../app/paths'
import { KakaoLoginButton, Logo, ShellOnboarding } from '../../../ds'
import { toast } from '../../../notifications'
import { hasPendingInvite } from '../../trips/pendingInvite'
import { isMockApi, kakaoStartUrl, mockKakaoLogin } from '../api'
import { browser } from '../browser'
import { COPY } from '../copy'

/** WF-02 로그인(HF-02, FR-101). 카카오 인가는 서버가 302로 보내므로 최상위 이동한다 */
export default function LoginPage() {
  const [params] = useSearchParams()
  const location = useLocation()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [pending, setPending] = useState(false)
  // QR·공유 링크로 들어와 초대가 보관돼 있으면 카카오 버튼 위 한 줄(HF-62b). 그룹 이름은 로그인 전에 보이지 않는다
  const [invited] = useState(() => hasPendingInvite())
  const returnTo = params.get('returnTo')
  const error = params.get('error')

  // ?error=cancelled → 아무 표시 없음 · ?error=failed → 토스트. 둘 다 주소에서 지운다(returnTo는 남긴다)
  useEffect(() => {
    if (!error) return
    if (error === 'failed') toast.error(COPY.retryLater)
    navigate({ pathname: location.pathname, search: returnTo ? `?returnTo=${encodeURIComponent(returnTo)}` : '' }, { replace: true })
  }, [error, returnTo, location.pathname, navigate])

  // 카카오 화면에서 뒤로 와 bfcache로 복원되면 눌림 상태를 푼다
  useEffect(() => {
    const onShow = (event: PageTransitionEvent) => {
      if (event.persisted) setPending(false)
    }
    window.addEventListener('pageshow', onShow)
    return () => window.removeEventListener('pageshow', onShow)
  }, [])

  const login = async () => {
    setPending(true)
    if (!isMockApi()) {
      browser.assign(kakaoStartUrl(returnTo))
      return
    }
    try {
      // 목 모드: 세션이 바뀌면 RequireGuest가 가입 단계(/signup/nickname) 또는 returnTo로 보낸다
      await mockKakaoLogin(returnTo)
      await queryClient.invalidateQueries({ queryKey: keys.session })
    } catch (e) {
      handleApiError(e)
      setPending(false)
    }
  }

  return (
    <ShellOnboarding back={false} gutter={false}>
      <h1 className="sr-only">로그인</h1>
      {/* Figma: 내용 위 164(셸 24 + 140) · 워드마크 104 → 20 → 가치 제안 한 줄, 앱 컬럼 중앙 */}
      <div className="flex flex-col items-center gap-5 px-8 pt-35 text-center">
        <Logo height={104} />
        <p className="text-body-l text-secondary">{COPY.tagline}</p>
      </div>
      <div className="flex-1" />
      <div className="flex flex-col items-center gap-3 px-gutter pt-3 pb-4">
        {invited && <p className="text-caption text-secondary">{COPY.invited}</p>}
        <KakaoLoginButton size="l" disabled={pending} aria-busy={pending || undefined} onClick={() => void login()} />
        <Link to={paths.privacy()} className="rounded-sm px-2 py-1 text-caption text-tertiary focus-visible:shadow-focus-ring focus-visible:outline-hidden">
          {COPY.privacyLink}
        </Link>
      </div>
    </ShellOnboarding>
  )
}

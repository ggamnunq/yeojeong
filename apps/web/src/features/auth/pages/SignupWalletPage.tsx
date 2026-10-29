import { useEffect, useState } from 'react'
import { Navigate } from 'react-router'
import { paths } from '../../../app/paths'
import { isSignupConnected, markSignupConnected, readSignupReturnTo, takeSignupReturnTo } from '../../../app/signupReturnTo'
import { Icon, IllustLinking, ShellOnboarding, type IconName } from '../../../ds'
import { FinConsentSheet } from '../components/FinConsentSheet'
import { COPY } from '../copy'
import { useFlowState } from '../historyState'

const LABELS: { icon: IconName; label: string }[] = [
  { icon: 'receipt', label: COPY.readOnly },
  { icon: 'lock', label: COPY.privatePayments },
]

/** WF-05 토스 지갑 연동 안내(HF-05, FR-801). 동의는 여기서 받지 않고 WF-05b 시트에서 받는다 */
export default function SignupWalletPage() {
  const { state, navigate, location } = useFlowState()
  const sheetOpen = state.finConsentSheet === true
  // 연결을 마친 뒤(WF-08) 뒤로 가기로 왔으면 WF-08 「여정으로 가기」와 같은 곳으로(화면명세 WF-08 v0.5.8)
  const [connectedExit] = useState(() => (isSignupConnected() ? (readSignupReturnTo() ?? paths.splash()) : null))
  useEffect(() => {
    if (!connectedExit) return
    markSignupConnected(false)
    takeSignupReturnTo()
  }, [connectedExit])

  // 연결 없이 가입 끝: 로그인 전에 열려던 경로(공유 링크 등), 없으면 진입 라우팅(대부분 WF-09). 가입은 끝났으니 ‹도 같은 곳으로 간다
  const leave = () => navigate(takeSignupReturnTo() ?? paths.splash(), { replace: true })
  // 시트는 history 항목 하나: 열 때 push(뒤로 가기 = 닫기), 전문을 보고 돌아와도 열린 채로 남는다
  const openSheet = () => navigate(`${location.pathname}${location.search}`, { state: { finConsentSheet: true } })
  const closeSheet = () => navigate(-1)

  if (connectedExit) return <Navigate replace to={connectedExit} />

  return (
    <ShellOnboarding
      progress={3}
      onBack={leave}
      skip
      skipLabel={COPY.later}
      onSkip={leave}
      cta={{ label: COPY.connectToss, onClick: openSheet }}
    >
      <h1 className="sr-only">토스 지갑 연결</h1>
      <h2 className="text-h1 text-primary">{COPY.walletTitle}</h2>
      <div className="flex-1" />
      <div className="flex justify-center">
        <IllustLinking phase="before" width={308} />
      </div>
      <div className="flex-1" />
      <ul className="flex gap-2.5 pt-6 pb-2">
        {LABELS.map(({ icon, label }) => (
          <li key={label} className="flex min-w-0 flex-1 flex-col gap-2.5 rounded-lg bg-subtle px-4 py-4.5">
            <Icon name={icon} size={20} className="text-icon-default" />
            <span className="text-body-m-strong text-primary">{label}</span>
          </li>
        ))}
      </ul>
      <FinConsentSheet open={sheetOpen} onClose={closeSheet} screen="WF-05" purpose="SIGNUP" from={paths.signupWallet()} />
    </ShellOnboarding>
  )
}

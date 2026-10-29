import { useState } from 'react'
import { defineCatalog } from '../../catalog/catalog'
import { PhoneFrame } from '../../catalog/PhoneFrame'
import { Row, SlotScreen, Variant } from '../../catalog/ui'
import { IllustLinked, IllustLinking } from '../Illust/Illust'
import { Input } from '../Input/Input'
import { KakaoLoginButton } from '../KakaoLoginButton/KakaoLoginButton'
import { Logo } from '../Logo/Logo'
import type { ProgressStepsStep } from '../Progress/Steps'
import { ShellOnboarding } from './Onboarding'

function Nickname() {
  const [step, setStep] = useState<ProgressStepsStep>(1)
  return (
    <ShellOnboarding
      progress={step}
      onBack={() => setStep((s) => (s > 1 ? ((s - 1) as ProgressStepsStep) : s))}
      cta={{
        label: '다음',
        onClick: () => setStep((s) => (s < 4 ? ((s + 1) as ProgressStepsStep) : s)),
      }}
    >
      <h1 className="text-h1 text-primary">닉네임을 정해 주세요</h1>
      <div className="mt-8">
        <Input label="닉네임" defaultValue="준용" helper="중복 가능 · 2/10" />
      </div>
    </ShellOnboarding>
  )
}

export default defineCatalog({
  title: 'Shell/Onboarding',
  figma: '58:10474',
  group: 'components',
  order: 72,
  Demo: function ShellOnboardingCatalog() {
    return (
      <Row>
        <Variant name="Figma 기본 · back · progress={1} · cta">
          <PhoneFrame>
            <ShellOnboarding progress={1} cta={{ label: '다음' }}>
              <SlotScreen />
            </ShellOnboarding>
          </PhoneFrame>
        </Variant>
        <Variant name="닉네임(HF-03) · 다음/뒤로로 단계 이동">
          <PhoneFrame>
            <Nickname />
          </PhoneFrame>
        </Variant>
        <Variant name="연결 완료(HF-08) · progress={4}">
          <PhoneFrame>
            <ShellOnboarding progress={4} cta={{ label: '시작하기' }}>
              <h1 className="text-h1 text-primary">연결했어요</h1>
              <div className="mt-8 flex flex-col items-center gap-4">
                <IllustLinked size={140} />
                <p className="text-body-m text-secondary">계좌 1 · 카드 2</p>
              </div>
            </ShellOnboarding>
          </PhoneFrame>
        </Variant>
        <Variant name='skip · skipLabel="나중에" (HF-05)'>
          <PhoneFrame>
            <ShellOnboarding progress={2} skip skipLabel="나중에" cta={{ label: '토스 지갑 연결' }}>
              <SlotScreen />
            </ShellOnboarding>
          </PhoneFrame>
        </Variant>
        <Variant name='leading="close" (v1.6 · HF-06 외부 인증 대기)'>
          <PhoneFrame>
            <ShellOnboarding leading="close" progress={3}>
              <h1 className="text-h1 text-primary">토스에서 인증을 마쳐 주세요</h1>
              <p className="mt-2 text-body-m text-secondary">인증이 끝나면 자동으로 넘어가요</p>
              <div className="mt-12 flex justify-center">
                <IllustLinking phase="pending" />
              </div>
            </ShellOnboarding>
          </PhoneFrame>
        </Variant>
        <Variant name="로그인(HF-02) · back={false} · progress·cta 없음">
          <PhoneFrame>
            <ShellOnboarding back={false}>
              <div className="flex flex-1 flex-col pt-30 pb-4">
                <Logo height={104} />
                <p className="mt-4 text-body-l text-secondary">함께 쓰고, 정확히 나누는 여행 공동 지갑</p>
                <KakaoLoginButton className="mt-auto w-full" />
              </div>
            </ShellOnboarding>
          </PhoneFrame>
        </Variant>
      </Row>
    )
  },
})

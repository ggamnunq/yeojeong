import { useState } from 'react'
import { defineCatalog } from '../../catalog/catalog'
import { PhoneFrame } from '../../catalog/PhoneFrame'
import { Row, Sub, Variant } from '../../catalog/ui'
import { BottomNav } from '../BottomNav/BottomNav'
import { Button } from '../Button/Button'
import { Screen } from '../Screen/Screen'
import { TopHeader } from '../TopHeader/TopHeader'
import { Toast, ToastViewport, type ToastType } from './Toast'

const SAMPLES: { type: ToastType; message: string }[] = [
  { type: 'success', message: '초대코드를 복사했어요' },
  { type: 'info', message: '공동 지출로 바꿨어요' },
  { type: 'error', message: '저장하지 못했어요. 다시 시도해 주세요' },
]

export default defineCatalog({
  title: 'Toast',
  figma: '24:8745',
  group: 'components',
  order: 55,
  Demo: function ToastCatalog() {
    const [shown, setShown] = useState<ToastType[]>(['success'])
    return (
      <div className="flex flex-col gap-8">
        <Sub title="type × action (폭은 부모를 채운다 — 화면에서는 390 − 거터 = 350)">
          <Row>
            <div className="flex w-[350px] flex-col gap-3">
              {SAMPLES.map((s) => (
                <Variant key={s.type} name={`type="${s.type}"`}>
                  <Toast type={s.type} message={s.message} />
                </Variant>
              ))}
            </div>
            <div className="flex w-[350px] flex-col gap-3">
              {SAMPLES.map((s) => (
                <Variant key={s.type} name={`type="${s.type}" · action`}>
                  <Toast type={s.type} message={s.message} action={{ label: '실행 취소', onClick: () => {} }} />
                </Variant>
              ))}
            </div>
          </Row>
        </Sub>
        <Sub title="ToastViewport · 하단 내비 위 16 (큐·타이머는 src/notifications의 ToastHost — 아래 ToastHost 항목)">
          <Row>
            {SAMPLES.map((s) => (
              <Button
                key={s.type}
                type="secondary"
                size="s"
                label={`${s.type} 추가`}
                onClick={() => setShown((list) => [...list, s.type].slice(-3))}
              />
            ))}
            <Button type="ghost" size="s" label="모두 지우기" onClick={() => setShown([])} />
          </Row>
          <PhoneFrame height={640}>
            <Screen
              header={<TopHeader groupName="오사카 3박 4일" />}
              nav={<BottomNav aria-label="여정 메뉴 예시 토스트" />}
            >
              <p className="pt-6 text-body-m text-secondary">토스트는 내비 위에 뜬다.</p>
            </Screen>
            <ToastViewport>
              {shown.map((type, i) => (
                <Toast
                  key={`${type}-${i}`}
                  type={type}
                  message={SAMPLES.find((s) => s.type === type)!.message}
                  action={type === 'info' ? { label: '실행 취소', onClick: () => setShown((l) => l.filter((_, j) => j !== i)) } : undefined}
                />
              ))}
            </ToastViewport>
          </PhoneFrame>
        </Sub>
      </div>
    )
  },
})

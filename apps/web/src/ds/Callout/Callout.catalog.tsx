import { defineCatalog } from '../../catalog/catalog'
import { Row, Sub, Variant } from '../../catalog/ui'
import { Callout, type CalloutStyle, type CalloutTone } from './Callout'

const TONES: { tone: CalloutTone; label: string }[] = [
  { tone: 'pending', label: '확인 필요 2건' },
  { tone: 'info', label: '확인 필요 2건' },
  { tone: 'warning', label: '확인 필요 2건' },
  { tone: 'disconnected', label: '토스 연결 만료' },
]
const STYLES: CalloutStyle[] = ['default', 'tone']

export default defineCatalog({
  title: 'Callout',
  figma: '24:12804',
  group: 'components',
  order: 31,
  Demo: function CalloutCatalog() {
    return (
      <div className="flex flex-col gap-8">
        <Sub title="tone × style (폭 350 · onClick이 있으면 버튼)">
          <Row>
            {STYLES.map((style) => (
              <Variant key={style} name={`style="${style}"`}>
                <div className="flex w-[350px] flex-col gap-3">
                  {TONES.map(({ tone, label }) => (
                    <Callout key={tone} tone={tone} style={style} label={label} onClick={() => {}} />
                  ))}
                </div>
              </Variant>
            ))}
            <Variant name='style="inline" (Pending)'>
              <Callout style="inline" label="확인 필요 2건" onClick={() => {}} />
            </Variant>
          </Row>
        </Sub>
        <Sub title="chevron={false} · 누를 수 없는 안내 · 아이콘 교체">
          <div className="flex w-[350px] flex-col gap-3">
            <Callout tone="info" label="환율은 매일 오전 9시에 갱신돼요" chevron={false} />
            <Callout tone="warning" icon="clock" label="환율 갱신이 늦어지고 있어요" chevron={false} />
          </div>
        </Sub>
      </div>
    )
  },
})

import { defineCatalog } from '../../catalog/catalog'
import { ME, MINJI, SUBIN, TAEHYUN } from '../../catalog/people'
import { Row, Sub, Variant } from '../../catalog/ui'
import { BottomSheetPanel } from '../BottomSheet/BottomSheet'
import { SheetContentReadOnly } from './ReadOnly'

// 민지 시점: 준용이 낸 MK택시(나 = 민지가 스택 맨 앞)
const MINJI_ME = { ...MINJI, me: true }
const JUNYONG = { ...ME, me: false }

export default defineCatalog({
  title: 'SheetContent/ReadOnly',
  figma: '24:68666',
  group: 'components',
  order: 83,
  Demo: function SheetContentReadOnlyCatalog() {
    return (
      <div className="flex flex-col gap-8">
        <Sub title="Figma 기본 · changed · locked (350 폭)">
          <Row>
            <Variant name="기본(버튼 없음 = 읽기 전용)">
              <div className="w-[350px]">
                <SheetContentReadOnly
                  amount={26290}
                  detail="¥2,860 · 11.13 14:10"
                  payer={JUNYONG}
                  participants={[MINJI_ME, JUNYONG, TAEHYUN, SUBIN]}
                />
              </div>
            </Variant>
            <Variant name="changed">
              <div className="w-[350px]">
                <SheetContentReadOnly
                  amount={26290}
                  detail="¥2,860 · 11.13 14:10"
                  changed
                  payer={JUNYONG}
                  participants={[MINJI_ME, JUNYONG, TAEHYUN, SUBIN]}
                />
              </div>
            </Variant>
            <Variant name="locked · 결제자 본인(나)">
              <div className="w-[350px]">
                <SheetContentReadOnly
                  amount={227960}
                  detail="¥24,800 · 11.14 19:10 · 신한카드 1102"
                  locked
                  payer={ME}
                  participants={[ME, MINJI, TAEHYUN, SUBIN]}
                />
              </div>
            </Variant>
            <Variant name="결제자가 나간 멤버">
              <div className="w-[350px]">
                <SheetContentReadOnly
                  amount={44120}
                  detail="¥4,800 · 11.13 10:30"
                  payer={{ ...SUBIN, left: true }}
                  participants={[ME, MINJI, TAEHYUN, { ...SUBIN, left: true }]}
                />
              </div>
            </Variant>
          </Row>
        </Sub>
        <Sub title="BottomSheet Content 슬롯(HF-38) — 제목 = 가맹점">
          <div className="w-[390px]">
            <BottomSheetPanel title="MK택시">
              <SheetContentReadOnly
                amount={26290}
                detail="¥2,860 · 11.13 14:10"
                payer={JUNYONG}
                participants={[MINJI_ME, JUNYONG, TAEHYUN, SUBIN]}
              />
            </BottomSheetPanel>
          </div>
        </Sub>
      </div>
    )
  },
})

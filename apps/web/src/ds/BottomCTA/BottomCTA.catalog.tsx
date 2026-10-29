import { defineCatalog } from '../../catalog/catalog'
import { PhoneFrame } from '../../catalog/PhoneFrame'
import { Row, Sub, Variant } from '../../catalog/ui'
import { BottomSheetPanel } from '../BottomSheet/BottomSheet'
import { ShellSub } from '../Shell/Sub'
import { BottomCTA } from './BottomCTA'

// Figma BottomCTA(세트 69:10702, v1.6.2): 셸·시트 cta prop이 그리는 버튼 영역. 화면에서는 cta에 객체를 넘긴다.
export default defineCatalog({
  title: 'BottomCTA',
  figma: '69:10702',
  group: 'components',
  order: 59,
  Demo: function BottomCTACatalog() {
    return (
      <div className="flex flex-col gap-8">
        <Sub title="Layout=Single(기본, 69:10683) · Primary L FILL · state">
          <Row>
            <Variant name="cta={{ label }}">
              <div className="w-[350px]">
                <BottomCTA cta={{ label: '다음' }} />
              </div>
            </Variant>
            <Variant name='state="loading"'>
              <div className="w-[350px]">
                <BottomCTA cta={{ label: '다음', state: 'loading' }} />
              </div>
            </Variant>
            <Variant name='state="disabled"'>
              <div className="w-[350px]">
                <BottomCTA cta={{ label: '다음', state: 'disabled' }} />
              </div>
            </Variant>
          </Row>
        </Sub>
        <Sub title="Layout=Horizontal(69:10689) · 간격 8 · 1:1 · 왼쪽 secondary(Secondary / Danger-weak) · 오른쪽 primary">
          <Row>
            <Variant name='secondary (HF-09 "초대코드로 참여 · 여정 만들기")'>
              <div className="w-[350px]">
                <BottomCTA
                  cta={{ layout: 'horizontal', secondary: { label: '초대코드로 참여' }, primary: { label: '여정 만들기' } }}
                />
              </div>
            </Variant>
            <Variant name='danger-weak (HF-16 "그룹 삭제 · 여정 시작")'>
              <div className="w-[350px]">
                <BottomCTA
                  cta={{
                    layout: 'horizontal',
                    secondary: { label: '그룹 삭제', type: 'danger-weak' },
                    primary: { label: '여정 시작' },
                  }}
                />
              </div>
            </Variant>
          </Row>
          <Row>
            <Variant name='primary state="loading" · secondary state="disabled"'>
              <div className="w-[350px]">
                <BottomCTA
                  cta={{
                    layout: 'horizontal',
                    secondary: { label: '그룹 삭제', type: 'danger-weak', state: 'disabled' },
                    primary: { label: '여정 시작', state: 'loading' },
                  }}
                />
              </div>
            </Variant>
            <Variant name='secondary danger-weak state="loading"'>
              <div className="w-[350px]">
                <BottomCTA
                  cta={{
                    layout: 'horizontal',
                    secondary: { label: '그룹 삭제', type: 'danger-weak', state: 'loading' },
                    primary: { label: '기간 수정', state: 'disabled' },
                  }}
                />
              </div>
            </Variant>
          </Row>
        </Sub>
        <Sub title="셸·시트에서 (cta prop)">
          <Row>
            <Variant name="ShellSub cta={{ layout: 'horizontal', … }}">
              <PhoneFrame height={480}>
                <ShellSub
                  header={{ title: '여정 정보' }}
                  cta={{
                    layout: 'horizontal',
                    secondary: { label: '그룹 삭제', type: 'danger-weak' },
                    primary: { label: '여정 시작' },
                  }}
                >
                  <p className="text-body-m text-secondary">그룹장 · 시작 전 하단 고정 영역</p>
                </ShellSub>
              </PhoneFrame>
            </Variant>
            <Variant name="BottomSheetPanel cta={{ label, state: 'loading' }} · Horizontal">
              <div className="flex w-[390px] flex-col gap-6">
                <BottomSheetPanel title="결제 상세" cta={{ label: '저장하기', state: 'loading' }}>
                  <p className="text-body-m text-secondary">시트 CTA State=Loading(v1.6.2)</p>
                </BottomSheetPanel>
                <BottomSheetPanel
                  title="결제수단"
                  cta={{
                    layout: 'horizontal',
                    secondary: { label: '삭제', type: 'danger-weak' },
                    primary: { label: '저장하기' },
                  }}
                >
                  <p className="text-body-m text-secondary">시트 하단 2버튼도 같은 규칙</p>
                </BottomSheetPanel>
              </div>
            </Variant>
          </Row>
        </Sub>
      </div>
    )
  },
})

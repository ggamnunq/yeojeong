import { defineCatalog } from '../../catalog/catalog'
import { PhoneFrame } from '../../catalog/PhoneFrame'
import { Row, SlotScreen, Variant } from '../../catalog/ui'
import { Button } from '../Button/Button'
import { EmptyState } from '../EmptyState/EmptyState'
import { Input } from '../Input/Input'
import { RowAccount } from '../Row/Account'
import { RowAdd } from '../Row/Add'
import { ShellSub } from './Sub'

export default defineCatalog({
  title: 'Shell/Sub',
  figma: '24:61242',
  group: 'components',
  order: 71,
  Demo: function ShellSubCatalog() {
    return (
      <Row>
        <Variant name="Figma 기본 · TopHeader Back(구분선 없음 · action 숨김)">
          <PhoneFrame>
            <ShellSub header={{ title: '지갑' }}>
              <SlotScreen />
            </ShellSub>
          </PhoneFrame>
        </Variant>
        <Variant name="지갑 · gutter={false} + Row/Account · Row/Add">
          <PhoneFrame>
            <ShellSub header={{ title: '지갑' }} gutter={false}>
              <RowAccount name="하나은행 입출금" masked="입출금 · 1102" moreLabel="하나은행 입출금 더 보기" />
              <RowAccount type="card" name="신한카드 Deep Dream" masked="체크 · 1934" moreLabel="신한카드 Deep Dream 더 보기" />
              <RowAdd label="계좌·카드 추가" />
            </ShellSub>
          </PhoneFrame>
        </Variant>
        <Variant name="여정 생성 · cta (아래 16 + 안전영역)">
          <PhoneFrame>
            <ShellSub header={{ title: '여정 만들기' }} cta={{ label: '다음' }}>
              <div className="flex flex-col gap-6">
                <Input label="그룹 이름" placeholder="예: 오사카 3박 4일" />
                <Input label="여행지" placeholder="예: 일본 오사카" />
              </div>
            </ShellSub>
          </PhoneFrame>
        </Variant>
        <Variant name="여정 없음 · header={{ type: 'logo' }} + EmptyState type=illust (HF-09)">
          <PhoneFrame>
            <ShellSub header={{ type: 'logo' }}>
              <div className="flex flex-1 flex-col items-center pt-38 pb-4">
                <EmptyState type="illust" />
                <div className="mt-auto flex w-full flex-col gap-2">
                  <Button label="여정 만들기" className="w-full" />
                  <Button type="secondary" label="초대코드로 참여" className="w-full" />
                </div>
              </div>
            </ShellSub>
          </PhoneFrame>
        </Variant>
        <Variant name="생성 완료 · header={{ type: 'close' }} (v1.6 · HF-11)">
          <PhoneFrame>
            <ShellSub header={{ type: 'close' }} cta={{ label: '여정으로 가기' }}>
              <div className="flex flex-col items-center pt-30 text-center">
                <h1 className="text-h2 text-primary">여정을 만들었어요</h1>
                <p className="mt-2 text-body-m text-secondary">오사카 3박 4일</p>
              </div>
            </ShellSub>
          </PhoneFrame>
        </Variant>
      </Row>
    )
  },
})

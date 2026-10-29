import { defineCatalog } from '../../catalog/catalog'
import { Row, Sub, Variant } from '../../catalog/ui'
import { BannerNotice } from './Notice'

export default defineCatalog({
  title: 'Banner/Notice',
  figma: '131:15944',
  group: 'components',
  order: 31.5,
  Demo: function BannerNoticeCatalog() {
    return (
      <div className="flex flex-col gap-8">
        <Sub title="Label · Chevron · Close (폭 350, HF-60·60b)">
          <Row>
            <Variant name="기본 (chevron · close)">
              <div className="w-[350px]">
                <BannerNotice label="개인정보처리방침이 바뀌어요 · 11.20부터" onClick={() => {}} onClose={() => {}} />
              </div>
            </Variant>
            <Variant name="close 없음">
              <div className="w-[350px]">
                <BannerNotice label="서비스 이용약관과 개인정보처리방침을 게시했어요" onClick={() => {}} />
              </div>
            </Variant>
            <Variant name="누를 수 없는 안내 (onClick 없음)">
              <div className="w-[350px]">
                <BannerNotice label="점검 안내 · 11.20 02:00~04:00" onClose={() => {}} />
              </div>
            </Variant>
            <Variant name="긴 제목은 한 줄 말줄임">
              <div className="w-[350px]">
                <BannerNotice
                  label="서비스 이용약관과 개인정보처리방침, 개인정보 처리위탁 고지를 함께 게시했어요"
                  onClick={() => {}}
                  onClose={() => {}}
                />
              </div>
            </Variant>
          </Row>
        </Sub>
      </div>
    )
  },
})

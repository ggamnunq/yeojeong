import { defineCatalog } from '../../catalog/catalog'
import { Row, Variant } from '../../catalog/ui'
import { RowTone } from './Tone'

export default defineCatalog({
  title: 'Row/Tone',
  figma: '52:10240',
  group: 'components',
  order: 86,
  Demo: function RowToneCatalog() {
    return (
      <Row className="gap-8">
        <Variant name="Figma 기본 · action(Button Secondary S + copy)" className="w-[350px]">
          <RowTone
            label="초대코드"
            value="K7M-2QX"
            action={{
              label: '복사',
              icon: 'copy',
              'aria-label': '초대코드 복사',
              onClick: () => {},
            }}
          />
        </Variant>
        <Variant name="action 아이콘 없음(토스 연결 상태)" className="w-[350px]">
          <RowTone label="토스 연결" value="계좌 1 · 카드 2" action={{ label: '다시 연결', onClick: () => {} }} />
        </Variant>
        <Variant name="action 없음" className="w-[350px]">
          <RowTone label="초대코드" value="K7M-2QX" />
        </Variant>
        <Variant name='action state="loading"' className="w-[350px]">
          <RowTone label="토스 연결" value="계좌 1 · 카드 2" action={{ label: '다시 연결', state: 'loading' }} />
        </Variant>
      </Row>
    )
  },
})

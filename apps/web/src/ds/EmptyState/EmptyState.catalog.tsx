import { defineCatalog } from '../../catalog/catalog'
import { Row, Variant } from '../../catalog/ui'
import { Button } from '../Button/Button'
import { IllustSettled } from '../Illust/Illust'
import { EmptyState } from './EmptyState'

export default defineCatalog({
  title: 'EmptyState',
  figma: '24:8783',
  group: 'components',
  order: 32,
  Demo: function EmptyStateCatalog() {
    return (
      <Row className="rounded-lg bg-canvas">
        <Variant name='type="no-trip"'>
          <EmptyState
            className="w-[350px]"
            type="no-trip"
            actions={
              <>
                <Button size="m" label="여정 만들기" className="w-full" />
                <Button size="m" type="secondary" label="초대코드로 참여" className="w-full" />
              </>
            }
          />
        </Variant>
        <Variant name='type="no-payments"'>
          <EmptyState className="w-[350px]" type="no-payments" actions={<Button size="s" type="ghost" label="지갑 연결 확인" />} />
        </Variant>
        <Variant name='type="illust" layout="vertical" (v1.6 · 비권장) · 버튼 2개'>
          <EmptyState
            className="w-[350px] py-8"
            type="illust"
            actions={
              <>
                <Button label="여정 만들기" className="w-full" />
                <Button type="secondary" label="초대코드로 참여" className="w-full" />
              </>
            }
          />
        </Variant>
        <Variant name='type="illust" layout="horizontal" (v1.6.2 · 70:10489) · secondary | primary'>
          <EmptyState
            className="w-[350px] py-8"
            type="illust"
            layout="horizontal"
            actions={
              <>
                <Button type="secondary" label="초대코드로 참여" />
                <Button label="여정 만들기" />
              </>
            }
          />
        </Variant>
        <Variant name='type="illust" layout="horizontal" · Button 2 off'>
          <EmptyState
            className="w-[350px] py-8"
            type="illust"
            layout="horizontal"
            actions={<Button label="여정 만들기" />}
          />
        </Variant>
        <Variant name='type="illust" · Button 2 off · illust 교체'>
          <EmptyState
            className="w-[350px] py-8"
            type="illust"
            illust={<IllustSettled size={160} />}
            title="정산할 결제가 없어요"
            actions={<Button label="결제 내역 보기" className="w-full" />}
          />
        </Variant>
        <Variant name='type="illust" · actions 없음(버튼은 화면 하단)'>
          <EmptyState className="w-[350px] py-8" type="illust" title="아직 결제가 없어요" />
        </Variant>
      </Row>
    )
  },
})

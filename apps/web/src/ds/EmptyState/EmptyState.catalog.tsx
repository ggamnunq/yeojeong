import { defineCatalog } from '../../catalog/catalog'
import { Row, Variant } from '../../catalog/ui'
import { Button } from '../Button/Button'
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
      </Row>
    )
  },
})

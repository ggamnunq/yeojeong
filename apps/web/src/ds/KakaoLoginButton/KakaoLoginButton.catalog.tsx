import { defineCatalog } from '../../catalog/catalog'
import { Row, Variant } from '../../catalog/ui'
import { KakaoLoginButton } from './KakaoLoginButton'

export default defineCatalog({
  title: 'KakaoLoginButton',
  figma: '24:6419',
  group: 'components',
  order: 3,
  Demo: function KakaoLoginButtonCatalog() {
    return (
      <Row>
        <Variant name='size="l"' className="w-[350px]">
          <KakaoLoginButton />
        </Variant>
        <Variant name='size="m"' className="w-[350px]">
          <KakaoLoginButton size="m" />
        </Variant>
      </Row>
    )
  },
})

import { defineCatalog } from '../../catalog/catalog'
import { PHOTOS } from '../../catalog/people'
import { Row, Sub, Variant } from '../../catalog/ui'
import { Avatar } from './Avatar'
import { AVATAR_COLORS, type AvatarSize } from './rules'

const SIZES: AvatarSize[] = ['xs', 's', 'm', 'l', 'xl']
// 일부러 깨진 이미지: onError로 이니셜로 떨어지는지 본다
const BROKEN = 'data:image/png;base64,AAAA'

export default defineCatalog({
  title: 'Avatar',
  figma: '24:7235',
  group: 'components',
  order: 20,
  Demo: function AvatarCatalog() {
    return (
      <div className="flex flex-col gap-8">
        <Sub title='source="initial" · color(합류 순서 Violet→Sunset→Green→Blue→Amber→Gray) × size'>
          <div className="grid w-fit grid-cols-5 items-center justify-items-center gap-x-10 gap-y-4">
            {AVATAR_COLORS.flatMap((color) =>
              SIZES.map((size) => <Avatar key={color + size} name="민지" source="initial" color={color} size={size} />),
            )}
          </div>
        </Sub>
        <Sub title='source="photo"(src 있음) · source="default"(src 없음, 「여정」 기본 이미지 회색)'>
          <div className="grid w-fit grid-cols-5 items-center justify-items-center gap-x-10 gap-y-4">
            {SIZES.map((size) => (
              <Avatar key={size} name="준용" src={PHOTOS.a} size={size} />
            ))}
            {SIZES.map((size) => (
              <Avatar key={size} name="태현" size={size} />
            ))}
          </div>
        </Sub>
        <Sub title="ring · me · left (접근성 이름에 「(나)」 「(나간 멤버)」가 붙는다)">
          <Row className="rounded-md bg-muted p-4">
            {SIZES.map((size) => (
              <Variant key={size} name={`ring · ${size}`}>
                <Avatar name="민지" src={PHOTOS.b} size={size} ring />
              </Variant>
            ))}
          </Row>
          <Row>
            <Variant name="me · photo">
              <Avatar name="준용" src={PHOTOS.a} size="l" me />
            </Variant>
            <Variant name="me · default">
              <Avatar name="준용" size="l" me />
            </Variant>
            <Variant name="me · initial">
              <Avatar name="준용" source="initial" color="violet" size="l" me />
            </Variant>
            <Variant name="left · photo">
              <Avatar name="민지" src={PHOTOS.b} size="l" left />
            </Variant>
            <Variant name="left · default">
              <Avatar name="태현" size="l" left />
            </Variant>
            <Variant name="left · initial">
              <Avatar name="서준" source="initial" color="sunset" size="l" left />
            </Variant>
          </Row>
        </Sub>
        <Sub title="폴백: 사진 로딩 실패 → 이니셜(joinOrder 색) · joinOrder 6 = 다시 Violet">
          <Row>
            <Variant name="src 깨짐 → initial">
              <Avatar name="하린" src={BROKEN} joinOrder={2} size="l" />
            </Variant>
            <Variant name="src 없음 → default">
              <Avatar name="하린" src={null} size="l" />
            </Variant>
            <Variant name="joinOrder={6}">
              <Avatar name="Alex" source="initial" joinOrder={6} size="l" />
            </Variant>
          </Row>
        </Sub>
      </div>
    )
  },
})

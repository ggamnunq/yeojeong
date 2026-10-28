import { useState } from 'react'
import { defineCatalog } from '../../catalog/catalog'
import { GROUP, ME, MINJI, SUBIN, TAEHYUN } from '../../catalog/people'
import { Row, Sub, Variant } from '../../catalog/ui'
import { AvatarToggle } from './AvatarToggle'

export default defineCatalog({
  title: 'AvatarToggle',
  figma: '24:17006',
  group: 'components',
  order: 22,
  Demo: function AvatarToggleCatalog() {
    const [picked, setPicked] = useState(() => new Set([ME.name, MINJI.name, SUBIN.name]))
    return (
      <div className="flex flex-col gap-8">
        <Row>
          <Variant name="selected (On)">
            <AvatarToggle person={{ ...ME, me: false }} name="준용" selected />
          </Variant>
          <Variant name="Off">
            <AvatarToggle person={{ ...ME, me: false }} name="준용" selected={false} />
          </Variant>
          <Variant name="On · disabled">
            <AvatarToggle person={{ ...ME, me: false }} name="준용" selected disabled />
          </Variant>
          <Variant name="Off · disabled">
            <AvatarToggle person={{ ...ME, me: false }} name="준용" selected={false} disabled />
          </Variant>
          <Variant name="default 이미지 · Off">
            <AvatarToggle person={TAEHYUN} selected={false} />
          </Variant>
          <Variant name="initial · On">
            <AvatarToggle person={GROUP[4]} selected />
          </Variant>
        </Row>
        <Sub title="부담 인원 고르기 (눌러서 확인)">
          <div className="flex gap-5">
            {[ME, MINJI, TAEHYUN, SUBIN].map((person) => (
              <AvatarToggle
                key={person.name}
                person={person}
                selected={picked.has(person.name)}
                onChange={(on) =>
                  setPicked((prev) => {
                    const next = new Set(prev)
                    if (on) next.add(person.name)
                    else next.delete(person.name)
                    return next
                  })
                }
              />
            ))}
          </div>
        </Sub>
      </div>
    )
  },
})

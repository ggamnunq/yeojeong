import tokens from '../../../design-tokens/tokens.json'
import { defineCatalog } from '../catalog'
import { Sub } from '../ui'

const cssVar = (name: string) => `--color-${name.replaceAll('/', '-')}`

function Swatch({ name, hex, note }: { name: string; hex: string; note?: string }) {
  return (
    <div className="flex w-40 flex-col gap-1.5">
      <div className="h-12 rounded-md border border-default" style={{ background: `var(${cssVar(name)})` }} />
      <p className="text-body-s-strong">{name}</p>
      <p className="text-caption text-tertiary">
        {hex}
        {note && ` · ${note}`}
      </p>
    </div>
  )
}

export default defineCatalog({
  title: 'Color',
  group: 'foundations',
  order: 1,
  Demo: function ColorCatalog() {
    const groups = new Map<string, typeof tokens.roles>()
    for (const r of tokens.roles) {
      const g = r.name.split('/')[0]
      groups.set(g, [...(groups.get(g) ?? []), r])
    }
    return (
      <div className="flex flex-col gap-10">
        <Sub title="팔레트 (직접 쓰지 말고 역할 토큰을 거쳐 쓴다)">
          {Object.entries(tokens.palette).map(([group, steps]) => (
            <div key={group} className="flex flex-wrap gap-3">
              {Object.entries(steps).map(([step, hex]) => (
                <Swatch key={step} name={`${group}/${step}`} hex={hex} />
              ))}
            </div>
          ))}
        </Sub>
        {[...groups].map(([group, roles]) => (
          <Sub key={group} title={`역할 토큰 · ${group}/*`}>
            <div className="flex flex-wrap gap-3">
              {roles.map((r) => (
                <Swatch
                  key={r.name}
                  name={r.name}
                  hex={r.alpha == null ? r.hex : `${r.hex} ${r.alpha * 100}%`}
                  note={r.ref ?? undefined}
                />
              ))}
            </div>
          </Sub>
        ))}
      </div>
    )
  },
})

import tokens from '../../../design-tokens/tokens.json'
import { defineCatalog } from '../catalog'
import { Sub } from '../ui'

const slug = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, '-')

export default defineCatalog({
  title: 'Radius · Shadow · Layout',
  group: 'foundations',
  order: 3,
  Demo: function EffectsCatalog() {
    return (
      <div className="flex flex-col gap-10">
        <Sub title="radius/*">
          <div className="flex flex-wrap gap-6">
            {Object.entries(tokens.size.radius).map(([name, value]) => (
              <div key={name} className="flex flex-col items-center gap-2">
                <div className="size-20 border border-strong bg-brand-subtle" style={{ borderRadius: `var(--radius-${name})` }} />
                <p className="text-caption text-tertiary">
                  rounded-{name} · {value}
                </p>
              </div>
            ))}
          </div>
        </Sub>
        <Sub title="Effect style">
          <div className="flex flex-wrap gap-8 bg-canvas p-6">
            {Object.keys(tokens.elevation).map((name) => (
              <div key={name} className="flex flex-col items-center gap-3">
                <div className="size-24 rounded-lg bg-surface" style={{ boxShadow: `var(--shadow-${slug(name)})` }} />
                <p className="text-caption text-tertiary">shadow-{slug(name)}</p>
              </div>
            ))}
          </div>
        </Sub>
        <Sub title="layout/* (--spacing-*)">
          <div className="flex flex-col gap-2">
            {Object.entries(tokens.size.layout).map(([name, value]) => (
              <div key={name} className="flex items-center gap-4">
                <p className="w-36 text-caption text-tertiary">
                  {name} · {value}
                </p>
                <div className="h-3 rounded-full bg-brand" style={{ width: `var(--spacing-${name})` }} />
              </div>
            ))}
          </div>
        </Sub>
      </div>
    )
  },
})

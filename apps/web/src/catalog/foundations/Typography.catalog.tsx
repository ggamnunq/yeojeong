import styles from '../../../design-tokens/styles.json'
import { defineCatalog } from '../catalog'

const slug = (name: string) =>
  name
    .replace(/^Heading\//, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')

export default defineCatalog({
  title: 'Typography',
  group: 'foundations',
  order: 2,
  Demo: function TypographyCatalog() {
    return (
      <div className="flex flex-col divide-y divide-default rounded-lg border border-default bg-surface">
        {styles.text.map((t) => {
          const key = `--text-${slug(t.name)}`
          const amount = t.family === 'amount'
          return (
            <div key={t.name} className="flex items-center gap-6 px-5 py-4">
              <div className="w-44 shrink-0">
                <p className="text-body-s-strong">{t.name}</p>
                <p className="text-caption text-tertiary">
                  text-{slug(t.name)}
                  {amount && ' font-amount'} · {t.size}/{t.lineHeight} · {t.letterSpacing} · {t.weight}
                </p>
              </div>
              <p
                className={amount ? 'font-amount' : undefined}
                style={{
                  fontSize: `var(${key})`,
                  lineHeight: `var(${key}--line-height)`,
                  letterSpacing: `var(${key}--letter-spacing)`,
                  fontWeight: `var(${key}--font-weight)`,
                }}
              >
                {amount ? '₩1,284,000 · −₩25,000 · ¥2,860' : '함께 떠난 여행, 정확하게 나눠요 0123456789'}
              </p>
            </div>
          )
        })}
      </div>
    )
  },
})

import { useQuery } from '@tanstack/react-query'
import { clsx } from 'clsx'
import { BottomSheet, Button, Icon } from '../../../ds'
import { focusRing } from '../../../ds/styles'
import { currenciesQuery } from '../api'

// 현지 통화 시트(화면명세 부록 C-8 v0.5.8, HF-10b). 서버 목록 순서 그대로(KRW 맨 앞) "JPY · 일본 엔" 행 + 오른쪽 라디오 원.
// 고르면 바로 닫는다(시트 CTA 없음). DS Row/Option은 왼쪽 원 아이콘이 붙어서 행은 같은 라디오 모양으로 여기서 그린다.
export type CurrencySheetProps = {
  open: boolean
  selected: string | null
  onSelect: (code: string) => void
  onClose: () => void
}

export function CurrencySheet({ open, selected, onSelect, onClose }: CurrencySheetProps) {
  const currencies = useQuery({ ...currenciesQuery(), enabled: open })
  return (
    <BottomSheet open={open} title="현지 통화" onClose={onClose}>
      {currencies.error ? (
        <div role="alert" className="flex flex-col items-center gap-4 py-8 text-center">
          <p className="text-body-m-strong text-primary">불러오지 못했어요</p>
          <Button type="secondary" size="m" label="다시 시도" onClick={() => void currencies.refetch()} />
        </div>
      ) : (
        <ul aria-busy={currencies.isPending} className="-mx-5">
          {(currencies.data ?? []).map((c) => {
            const on = c.code === selected
            return (
              <li key={c.code}>
                <button
                  type="button"
                  aria-current={on ? 'true' : undefined}
                  onClick={() => onSelect(c.code)}
                  className={clsx(
                    'flex h-12.5 w-full items-center gap-3 px-5 text-left transition-colors select-none active:bg-pressed',
                    focusRing,
                  )}
                >
                  <span className="min-w-0 flex-1 truncate text-body-m text-primary">
                    {c.code} · {c.name}
                  </span>
                  <span
                    aria-hidden
                    className={clsx(
                      'grid size-5.5 shrink-0 place-items-center rounded-full',
                      on ? 'bg-brand' : 'border-[1.5px] border-strong bg-surface',
                    )}
                  >
                    {on && <Icon name="check" size={14} className="text-icon-inverse" />}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </BottomSheet>
  )
}

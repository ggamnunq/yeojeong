import { useState } from 'react'
import { Input } from '../../ds'
import { kst } from '../payments/rules'
import { isFuture, kstIso } from './rules'
import { MANUAL_OCCURRED_AT_PAST_DAYS } from './types'

/**
 * 날짜·시각 선택 단계(부록 B-27, DS 미정 — 기본 입력 두 개). 미래(지금 + 5분 초과)·365일 넘은 과거는 고를 수 없다.
 * 기간 밖 날짜도 고를 수 있다(여정 전/후 그룹). 시트는 하나로 두고 내용(body)과 CTA만 바꾼다.
 */
export function useDateStep(now: number) {
  const [draft, setDraft] = useState({ date: '', time: '' })
  const today = kst(now).date
  const min = kst(now - MANUAL_OCCURRED_AT_PAST_DAYS * 86_400_000).date
  const iso = draft.date && draft.time ? kstIso(draft.date, draft.time) : null
  const parsed = iso !== null && !Number.isNaN(Date.parse(iso))
  const future = parsed && isFuture(iso!, now)
  const invalid = !parsed || future || draft.date < min || draft.date > today

  return {
    /** 단계를 열 때 지금 값으로 채운다 */
    begin: (value: string | null) => {
      const at = kst(value ?? now)
      setDraft({ date: at.date, time: at.time })
    },
    cta: (onDone: (iso: string) => void) => ({
      label: '완료',
      state: invalid ? ('disabled' as const) : ('default' as const),
      onClick: () => {
        if (iso && !invalid) onDone(iso)
      },
    }),
    body: (
      <div className="flex flex-col gap-4">
        <Input label="날짜" type="date" value={draft.date} min={min} max={today} onChange={(e) => setDraft({ ...draft, date: e.target.value })} />
        <Input label="시각" type="time" value={draft.time} error={future} onChange={(e) => setDraft({ ...draft, time: e.target.value })} />
      </div>
    ),
  }
}


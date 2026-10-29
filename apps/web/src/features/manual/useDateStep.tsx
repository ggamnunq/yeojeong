import { useState } from 'react'
import { dateTimeDraft, dateTimeIso, dateTimeProblem, SheetContentDateTime, type DateTimeDraft } from '../../ds'
import { MANUAL_OCCURRED_AT_FUTURE_SECONDS, MANUAL_OCCURRED_AT_PAST_DAYS } from './types'

/**
 * 날짜·시각 선택 단계(부록 B-27 · HF-46d = DS19 SheetContent/DateTime). 미래(지금 + 5분 초과)·365일 넘은 과거는 고를 수 없다.
 * 기간 밖 날짜도 고를 수 있다(여정 전/후 그룹). 시트는 하나로 두고 내용만 바꾼다 — 이 단계에서는 시트 CTA를 끄고
 * 내용의 "확인"(SheetContentDateTime cta)을 쓴다(제목 "날짜" · leading back).
 */
export function useDateStep(now: number) {
  const [draft, setDraft] = useState<DateTimeDraft>(() => dateTimeDraft(null, now))
  const limits = { min: now - MANUAL_OCCURRED_AT_PAST_DAYS * 86_400_000, max: now + MANUAL_OCCURRED_AT_FUTURE_SECONDS * 1000 }

  return {
    /** 단계를 열 때 지금 값(없으면 지금)으로 채운다 */
    begin: (value: string | null) => setDraft(dateTimeDraft(value, now)),
    /** 시트 내용. "확인"을 누르면 KST ISO로 onDone */
    body: (onDone: (iso: string) => void) => (
      <SheetContentDateTime
        value={draft}
        onChange={setDraft}
        now={now}
        min={limits.min}
        max={limits.max}
        cta={{
          onClick: () => {
            const iso = dateTimeIso(draft)
            if (iso && dateTimeProblem(draft, limits) === null) onDone(iso)
          },
        }}
      />
    ),
  }
}

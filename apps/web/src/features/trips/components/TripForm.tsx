import { useQuery } from '@tanstack/react-query'
import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { Input, InputPicker, ShellSub } from '../../../ds'
import { currenciesQuery } from '../api'
import {
  budgetDigits,
  currencyLabel,
  editableFieldsOf,
  formatBudgetInput,
  formatPeriodInput,
  GROUP_NAME_MAX_LENGTH,
  isTripFormValid,
  periodError,
  PLACE_LABEL_MAX_LENGTH,
  tripUpdateBody,
  type TripFormMode,
} from '../rules'
import type { TripEditableField, TripFormValues } from '../types'
import { CurrencySheet } from './CurrencySheet'
import { PeriodSheet } from './PeriodSheet'
import { PickerField } from './PickerField'

// HF-10 여정 생성 폼(+ 수정 모드). 그룹명 · 여행 장소(자유 입력) · 현지 통화(시트) · 기간(시트) · 예산 다섯 칸, 헬퍼 문구 없음.
// 통화는 장소로 정하지 않고 사용자가 고른다(기본값 없음). 수정 모드는 서버 permissions.editableFields의 칸만 열고, 값이 바뀌었을 때만 저장할 수 있다.

/** 서버 검증 실패 경로(fieldErrors 키) → 폼 칸 */
type FieldKey = 'groupName' | 'place' | 'currency' | 'period' | 'budgetKrw'
const FIELD_ORDER: readonly FieldKey[] = ['groupName', 'place', 'currency', 'period', 'budgetKrw']

function fieldKeyOf(path: string): FieldKey | null {
  if (path === 'groupName') return 'groupName'
  if (path === 'place' || path.startsWith('place.')) return 'place'
  if (path === 'currency') return 'currency'
  if (path === 'startDate' || path === 'endDate') return 'period'
  if (path === 'budgetKrw') return 'budgetKrw'
  return null
}

/** 서버 fieldErrors → 칸별 첫 문구(고친 칸 제외) */
function serverFieldErrors(serverErrors: Record<string, string> | undefined, edited: readonly FieldKey[]) {
  const result: Partial<Record<FieldKey, string>> = {}
  for (const [path, message] of Object.entries(serverErrors ?? {})) {
    const key = fieldKeyOf(path)
    if (key && !result[key] && !edited.includes(key)) result[key] = message
  }
  return result
}

export type TripFormProps = {
  mode: TripFormMode
  /** 헤더 제목: "새 여정" · "여정 수정" */
  title: string
  /** 버튼: "여정 만들기" · "저장" */
  submitLabel: string
  initial: TripFormValues
  /** 수정 모드: 서버 permissions.editableFields. 없으면 단계 기본값 */
  editableFields?: readonly TripEditableField[]
  today: string
  busy?: boolean
  /** 서버 검증 실패(fieldErrors 결과). 바뀌면 첫 오류 칸에 포커스 */
  serverErrors?: Record<string, string>
  onBack: () => void
  onSubmit: (values: TripFormValues) => void
}

export function TripForm({
  mode,
  title,
  submitLabel,
  initial,
  editableFields,
  today,
  busy = false,
  serverErrors,
  onBack,
  onSubmit,
}: TripFormProps) {
  const formId = useId()
  const formRef = useRef<HTMLFormElement>(null)
  const [values, setValues] = useState(initial)
  const [sheet, setSheet] = useState<'currency' | 'period' | null>(null)
  // 서버 오류가 온 뒤 사용자가 고친 칸(그 칸의 서버 문구는 지운다)
  const [edited, setEdited] = useState<{ source?: Record<string, string>; keys: FieldKey[] }>({ keys: [] })

  const editable = editableFieldsOf(mode, editableFields)
  // 통화 표시 이름("JPY · 일본 엔"). 시트와 같은 쿼리라 한 번만 받는다
  const currencies = useQuery({ ...currenciesQuery(), enabled: values.currency !== null || sheet === 'currency' })
  const can = (field: (typeof editable)[number]) => editable.includes(field)

  const errors = serverFieldErrors(serverErrors, edited.source === serverErrors ? edited.keys : [])

  // 서버 검증 실패 → 첫 오류 칸 포커스
  useEffect(() => {
    const first = FIELD_ORDER.find((key) => serverFieldErrors(serverErrors, [])[key])
    if (first) (formRef.current?.elements.namedItem(first) as HTMLElement | null)?.focus()
  }, [serverErrors])

  const update = (patch: Partial<TripFormValues>, field: FieldKey) => {
    setValues((v) => ({ ...v, ...patch }))
    setEdited((e) => ({ source: serverErrors, keys: e.source === serverErrors ? [...e.keys, field] : [field] }))
  }

  const localPeriodError = periodError(values, mode, today)
  const changed = mode.kind === 'create' || tripUpdateBody(initial, values, editable, 0) !== null
  const canSubmit = isTripFormValid(values, mode, today) && changed

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (canSubmit && !busy) onSubmit({ ...values, groupName: values.groupName.trim(), place: values.place.trim() })
  }

  return (
    <ShellSub
      header={{ title, onBack }}
      cta={{ label: submitLabel, htmlType: 'submit', form: formId, disabled: !canSubmit, state: busy ? 'loading' : 'default' }}
    >
      <form id={formId} ref={formRef} noValidate onSubmit={submit} className="flex flex-col gap-6">
        <Input
          name="groupName"
          label="그룹명"
          placeholder="예) 오사카 3박 4일"
          maxLength={GROUP_NAME_MAX_LENGTH}
          autoComplete="off"
          // 처음 들어온 생성 폼은 첫 칸에 포커스(HF-10 Focus 상태)
          autoFocus={mode.kind === 'create'}
          disabled={!can('groupName')}
          value={values.groupName}
          error={Boolean(errors.groupName)}
          helper={errors.groupName}
          onChange={(e) => update({ groupName: e.target.value }, 'groupName')}
        />
        <Input
          name="place"
          label="여행 장소"
          placeholder="예) 오사카"
          // 40자를 넘으면 입력을 막는다(문구·카운터 없음)
          maxLength={PLACE_LABEL_MAX_LENGTH}
          autoComplete="off"
          disabled={!can('place')}
          value={values.place}
          error={Boolean(errors.place)}
          helper={errors.place}
          onChange={(e) => update({ place: e.target.value }, 'place')}
        />
        <InputPicker
          name="currency"
          label="현지 통화"
          placeholder="선택"
          value={currencyLabel(values.currency, currencies.data)}
          disabled={!can('currency')}
          error={Boolean(errors.currency)}
          helper={errors.currency}
          onClick={() => setSheet('currency')}
        />
        {/* 기간은 HF-10대로 달력 아이콘만(⌄ 없음) 붙는 입력 모양이라 InputPicker 대신 PickerField */}
        <PickerField
          name="period"
          label="기간"
          placeholder="출발일 – 도착일"
          icon="calendar"
          value={values.startDate && values.endDate ? formatPeriodInput(values.startDate, values.endDate) : undefined}
          disabled={!can('startDate') && !can('endDate')}
          error={localPeriodError ?? errors.period}
          onOpen={() => setSheet('period')}
        />
        <Input
          name="budgetKrw"
          label="예산"
          placeholder="₩0"
          inputMode="numeric"
          autoComplete="off"
          disabled={!can('budgetKrw')}
          value={formatBudgetInput(values.budget)}
          error={Boolean(errors.budgetKrw)}
          helper={errors.budgetKrw}
          onChange={(e) => update({ budget: budgetDigits(e.target.value, values.budget) }, 'budgetKrw')}
        />
      </form>

      <CurrencySheet
        open={sheet === 'currency'}
        selected={values.currency}
        onClose={() => setSheet(null)}
        onSelect={(currency) => {
          update({ currency }, 'currency')
          setSheet(null)
        }}
      />
      <PeriodSheet
        open={sheet === 'period'}
        value={{ startDate: values.startDate, endDate: values.endDate }}
        mode={mode}
        today={today}
        startLocked={!can('startDate')}
        onClose={() => setSheet(null)}
        onApply={(period) => {
          update(period, 'period')
          setSheet(null)
        }}
      />
    </ShellSub>
  )
}

import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { Input, ShellSub } from '../../../ds'
import {
  budgetDigits,
  editableFieldsOf,
  formatBudgetInput,
  formatPeriodInput,
  GROUP_NAME_MAX_LENGTH,
  isTripFormValid,
  periodError,
  tripUpdateBody,
  type TripFormMode,
} from '../rules'
import type { TripFormValues } from '../types'
import { PeriodSheet } from './PeriodSheet'
import { PickerField } from './PickerField'
import { PlaceSheet } from './PlaceSheet'

// HF-10 여정 생성 폼(+ 수정 모드). 그룹명 · 장소 · 기간 · 예산 네 칸, 헬퍼 문구 없음. 통화는 장소로 정해져 묻지 않는다.
// 수정 모드는 단계별로 고칠 수 있는 칸만 열고(진행 중: 그룹명 · 예산 · 종료일), 값이 바뀌었을 때만 저장할 수 있다.

/** 서버 검증 실패 경로(fieldErrors 키) → 폼 칸 */
type FieldKey = 'groupName' | 'place' | 'period' | 'budgetKrw'
const FIELD_ORDER: readonly FieldKey[] = ['groupName', 'place', 'period', 'budgetKrw']

function fieldKeyOf(path: string): FieldKey | null {
  if (path === 'groupName') return 'groupName'
  if (path === 'place' || path.startsWith('place.')) return 'place'
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
  today,
  busy = false,
  serverErrors,
  onBack,
  onSubmit,
}: TripFormProps) {
  const formId = useId()
  const formRef = useRef<HTMLFormElement>(null)
  const [values, setValues] = useState(initial)
  const [sheet, setSheet] = useState<'place' | 'period' | null>(null)
  // 서버 오류가 온 뒤 사용자가 고친 칸(그 칸의 서버 문구는 지운다)
  const [edited, setEdited] = useState<{ source?: Record<string, string>; keys: FieldKey[] }>({ keys: [] })

  const editable = editableFieldsOf(mode)
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
  const canSubmit = isTripFormValid(values, mode, today) && changed && !busy

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (canSubmit) onSubmit({ ...values, groupName: values.groupName.trim() })
  }

  return (
    <ShellSub
      header={{ title, onBack }}
      cta={{ label: submitLabel, htmlType: 'submit', form: formId, disabled: !canSubmit }}
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
        <PickerField
          name="place"
          label="장소"
          placeholder="도시 검색"
          icon="marker"
          value={values.place?.label}
          disabled={!can('place')}
          error={errors.place}
          onOpen={() => setSheet('place')}
        />
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

      <PlaceSheet
        open={sheet === 'place'}
        selected={values.place}
        onClose={() => setSheet(null)}
        onSelect={(place) => {
          update({ place }, 'place')
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

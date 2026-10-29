import { useState } from 'react'
import { useLocation, useNavigate } from 'react-router'
import { fieldErrors } from '../../../api'
import { paths } from '../../../app/paths'
import { useCreateTrip } from '../api'
import { TripForm } from '../components/TripForm'
import { EMPTY_TRIP_FORM, todayKst } from '../rules'
import type { TripFormValues } from '../types'

/** HF-10 여정 생성(FR-201). 성공하면 생성 완료(HF-11)로, 그 화면에서 뒤로 가면 여정 정보(생성 폼으로 돌아가지 않음) */
export default function NewTripPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const create = useCreateTrip()
  const [serverErrors, setServerErrors] = useState<Record<string, string>>()

  const submit = (values: TripFormValues) => {
    create.mutate(
      {
        groupName: values.groupName,
        place: { label: values.place },
        currency: values.currency!,
        startDate: values.startDate,
        endDate: values.endDate,
        budgetKrw: Number(values.budget),
      },
      {
        onSuccess: async ({ tripId }) => {
          // 기록: … → 여정 정보 → 생성 완료. 생성 완료에서 뒤로 가면 여정 정보가 나온다
          await navigate(paths.tripInfo(tripId), { replace: true })
          await navigate(paths.tripCreated(tripId), { state: { fromCreate: true } })
        },
        onError: (error) => setServerErrors(fieldErrors(error)),
      },
    )
  }

  return (
    <TripForm
      mode={{ kind: 'create' }}
      title="새 여정"
      submitLabel="여정 만들기"
      initial={EMPTY_TRIP_FORM}
      today={todayKst()}
      busy={create.isPending}
      serverErrors={serverErrors}
      // 입력은 버리고 이전 화면으로(확인 없음). 바로 들어온 주소면 진입 라우팅으로
      onBack={() => (location.key === 'default' ? navigate(paths.splash(), { replace: true }) : navigate(-1))}
      onSubmit={submit}
    />
  )
}

import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router'
import { errorMessage, fieldErrors, handleApiError, isApiError, keys } from '../../../api'
import { paths } from '../../../app/paths'
import { useTripDetail } from '../../../app/trip'
import { toast } from '../../../notifications'
import { useUpdateTrip } from '../api'
import { TripForm } from '../components/TripForm'
import { COPY, formValuesOf, todayKst, tripPermissions, tripUpdateBody } from '../rules'
import type { NavState, TripFormValues, TripInfo } from '../types'

/**
 * 여정 정보 수정(WF-10 수정 모드, FR-302). 그룹장만, 단계별로 고칠 수 있는 칸만(진행 중: 그룹명 · 예산 · 종료일). 종료 후는 들어올 수 없다.
 * 409(단계·version)는 최신 값으로 다시 채우고 "다른 곳에서 바뀌었어요", 403은 여정 정보로.
 */
export default function EditTripPage() {
  const trip: TripInfo = useTripDetail()
  const today = todayKst()
  const permissions = tripPermissions(trip, today)

  if (!permissions.canEdit) return <Navigate replace to={paths.tripInfo(trip.tripId)} />
  // version이 바뀌면(저장·충돌 후 최신 값) 폼을 새 값으로 다시 시작한다
  return <EditTripForm key={trip.version} trip={trip} today={today} />
}

function EditTripForm({ trip, today }: { trip: TripInfo; today: string }) {
  const navigate = useNavigate()
  const location = useLocation()
  const queryClient = useQueryClient()
  const update = useUpdateTrip(trip.tripId)
  const [serverErrors, setServerErrors] = useState<Record<string, string>>()
  const initial = formValuesOf(trip)
  const { editableFields } = tripPermissions(trip, today)

  // 여정 정보에서 왔으면 기록을 되돌리고, 주소로 바로 왔으면 여정 정보로 바꾼다
  const backToInfo = () =>
    (location.state as NavState)?.from === 'info'
      ? navigate(-1)
      : navigate(paths.tripInfo(trip.tripId), { replace: true })

  const submit = (values: TripFormValues) => {
    const body = tripUpdateBody(initial, values, editableFields, trip.version)
    if (!body) return
    update.mutate(body, {
      onSuccess: () => {
        toast.success(COPY.saved)
        void backToInfo()
      },
      onError: (error) => {
        if (!isApiError(error)) return handleApiError(error)
        if (error.code === 'VALIDATION_FAILED') return setServerErrors(fieldErrors(error))
        if (error.status === 409) {
          toast.info(COPY.changedElsewhere)
          const current = error.details?.current as TripInfo | undefined
          if (current) queryClient.setQueryData(keys.trips.detail(trip.tripId), current)
          else void queryClient.invalidateQueries({ queryKey: keys.trips.detail(trip.tripId) })
          return
        }
        if (error.status === 403) {
          toast.error(errorMessage(error))
          void queryClient.invalidateQueries({ queryKey: keys.trips.detail(trip.tripId) })
          return void navigate(paths.tripInfo(trip.tripId), { replace: true })
        }
        handleApiError(error)
      },
    })
  }

  return (
    <TripForm
      mode={{ kind: 'edit', status: trip.status }}
      title="여정 수정"
      submitLabel="저장"
      initial={initial}
      today={today}
      busy={update.isPending}
      serverErrors={serverErrors}
      onBack={backToInfo}
      onSubmit={submit}
    />
  )
}

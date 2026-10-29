import { Navigate, useNavigate } from 'react-router'
import { paths } from '../../../app/paths'
import { ErrorScreen, LoadingScreen } from '../../../app/states'
import { pickEntryTrip, readLastTripId, useMyTrips } from '../../../app/trip'
import { Button, IllustEmptyTrip, ShellSub } from '../../../ds'

/** HF-09 여정 없음(FR-205). 소속 여정이 생겼으면(다른 기기에서 참여 등) 진입 라우팅 규칙으로 보낸다 */
export default function NoTripPage() {
  const navigate = useNavigate()
  const myTrips = useMyTrips()

  if (myTrips.isPending) return <LoadingScreen />
  if (myTrips.error) return <ErrorScreen error={myTrips.error} onRetry={() => void myTrips.refetch()} />
  const entry = pickEntryTrip(myTrips.data, readLastTripId())
  if (entry) return <Navigate replace to={paths.trip(entry.tripId)} />

  return (
    <ShellSub header={{ type: 'logo', onWalletClick: () => navigate(paths.wallet()), onMyClick: () => navigate(paths.me()) }}>
      {/* Figma: 셸 슬롯 위에서 168(셸이 16을 준다) → 일러스트 144 + 제목 H2(간격 28) → 남은 높이 → 버튼 2(한 줄 2열, 간격 8, 아래 16) */}
      <div className="mt-38 flex flex-col items-center gap-7">
        <IllustEmptyTrip size={144} />
        <h2 className="text-center text-h2 text-primary">참여한 여정이 없어요</h2>
      </div>
      <div className="min-h-10 flex-1" />
      {/* 하단 2버튼은 한 줄 2열(간격 8, 1:1): 보조 왼쪽 · 주 액션 오른쪽 */}
      <div className="flex gap-2 pb-4">
        <Button type="secondary" size="l" label="초대코드로 참여" className="min-w-0 flex-1" onClick={() => navigate(paths.join())} />
        <Button type="primary" size="l" label="여정 만들기" className="min-w-0 flex-1" onClick={() => navigate(paths.tripNew())} />
      </div>
    </ShellSub>
  )
}

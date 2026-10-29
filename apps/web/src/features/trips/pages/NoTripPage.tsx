import { Navigate, useNavigate } from 'react-router'
import { paths } from '../../../app/paths'
import { ErrorScreen, LoadingScreen } from '../../../app/states'
import { pickEntryTrip, readLastTripId, useMyTrips } from '../../../app/trip'
import { EmptyState, IllustEmptyTrip, ShellSub } from '../../../ds'
import { NoticeBanner } from '../../notices/NoticeBanner'

/** HF-09 여정 없음(FR-205). 소속 여정이 생겼으면(다른 기기에서 참여 등) 진입 라우팅 규칙으로 보낸다 */
export default function NoTripPage() {
  const navigate = useNavigate()
  const myTrips = useMyTrips()

  if (myTrips.isPending) return <LoadingScreen />
  if (myTrips.error) return <ErrorScreen error={myTrips.error} onRetry={() => void myTrips.refetch()} />
  const entry = pickEntryTrip(myTrips.data, readLastTripId())
  if (entry) return <Navigate replace to={paths.trip(entry.tripId)} />

  return (
    <ShellSub
      header={{ type: 'logo', onWalletClick: () => navigate(paths.wallet()), onMyClick: () => navigate(paths.me()) }}
      // 하단 2버튼(DS BottomCTA Layout=Horizontal, 간격 8 · 1:1): 보조 왼쪽 · 주 액션 오른쪽
      cta={{
        layout: 'horizontal',
        secondary: { label: '초대코드로 참여', onClick: () => navigate(paths.join()) },
        primary: { label: '여정 만들기', onClick: () => navigate(paths.tripNew()) },
      }}
    >
      {/* 공지 배너(Q-57): 로그인 후 첫 화면 위 */}
      <NoticeBanner />
      {/* EmptyState Type=Illust(일러스트 160 + H2, 설명 없음). 버튼은 하단 CTA 자리에 둔다 */}
      <div className="flex flex-1 flex-col justify-center pb-16">
        <EmptyState type="illust" illust={<IllustEmptyTrip size={144} />} title="참여한 여정이 없어요" />
      </div>
    </ShellSub>
  )
}

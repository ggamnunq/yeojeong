import { Navigate } from 'react-router'
import { paths } from '../../../app/paths'
import { useSession } from '../../../app/session'
import { ErrorScreen } from '../../../app/states'
import { pickEntryTrip, readLastTripId, useMyTrips } from '../../../app/trip'
import { Logo } from '../../../ds'

/** WF-01 스플래시 · 진입 라우팅(FR-102) */
export default function SplashPage() {
  const session = useSession()
  const myTrips = useMyTrips({ enabled: session.isAuthenticated && !session.reconsentRequired })

  if (session.error) return <ErrorScreen error={session.error} onRetry={session.refetch} />
  if (!session.isPending) {
    if (session.reconsentRequired) return <Navigate replace to={paths.reconsent(session.reconsentRequired)} />
    if (session.signupRequired) return <Navigate replace to={paths.signupNickname()} />
    if (!session.isAuthenticated) return <Navigate replace to={paths.login()} />
    if (myTrips.error) return <ErrorScreen error={myTrips.error} onRetry={() => void myTrips.refetch()} />
    if (myTrips.data) {
      const trip = pickEntryTrip(myTrips.data, readLastTripId())
      return <Navigate replace to={trip ? paths.trip(trip.tripId) : paths.trips()} />
    }
  }

  return (
    <main className="mx-auto flex min-h-svh w-full max-w-screen-width items-center justify-center bg-brand">
      <h1>
        <Logo variant="inverse" height={104} />
      </h1>
    </main>
  )
}

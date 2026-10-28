import { lazy, Suspense } from 'react'
import { LoadingScreen } from '../../../app/states'

const PaymentsPage = lazy(() => import('./PaymentsPage'))

/**
 * 결제내역 탭 자리. 화면 제목(화면리더용)은 바로 그리고, 목록·타임라인 chunk는 따로 받는다.
 * 헤더에는 그룹명이 보이므로 "결제내역"은 화면리더에만 읽힌다.
 */
export default function PaymentsRoute() {
  return (
    <>
      <h2 className="sr-only">결제내역</h2>
      <Suspense fallback={<LoadingScreen inset />}>
        <PaymentsPage />
      </Suspense>
    </>
  )
}

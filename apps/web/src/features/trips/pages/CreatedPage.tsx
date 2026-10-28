import { useLocation, useNavigate } from 'react-router'
import { paths } from '../../../app/paths'
import { useTripDetail } from '../../../app/trip'
import { Button, IconButton, Screen } from '../../../ds'
import { copyInviteCode, shareInvite } from '../invite'
import { formatInviteCode } from '../rules'
import type { NavState } from '../types'

/**
 * HF-11 생성 완료 · 초대코드(FR-202). 초대코드가 화면의 영웅(Plex 40, 자간 4, 톤 카드) + 복사 · 공유.
 * ✕ · 「여정으로 가기」 · 뒤로 가기 → 시작 전 여정 정보(HF-16).
 * Shell/Sub의 Back 헤더는 ‹만 있어서(✕ 변형 없음) Screen에 ✕ 헤더를 직접 붙였다(DS 추가 요청: TopHeader Back 닫기 아이콘).
 */
export default function CreatedPage() {
  const trip = useTripDetail()
  const navigate = useNavigate()
  const location = useLocation()
  const code = trip.inviteCode

  // 생성 폼에서 왔으면 바로 아래 기록이 여정 정보다
  const goToTrip = () =>
    (location.state as NavState)?.fromCreate ? navigate(-1) : navigate(paths.tripInfo(trip.tripId), { replace: true })

  return (
    <Screen
      background="surface"
      contentClassName="pt-4"
      header={
        <header className="flex h-header-height items-center gap-1 bg-surface pr-2 pl-1">
          <IconButton size="m" icon="close" label="닫기" onClick={goToTrip} />
        </header>
      }
    >
      {/* Figma: 셸 슬롯 위 136(셸 16 + 120) → 제목 H2 + 그룹명(간격 6) → 36 → 초대코드 톤 카드 */}
      <div className="mt-30 flex flex-col items-center gap-1.5 text-center">
        <h1 className="text-h2 text-primary">여정을 만들었어요</h1>
        <p className="text-body-m text-secondary">{trip.groupName}</p>
      </div>

      {code && (
        <section aria-labelledby="invite-code-label" className="mt-9 flex flex-col items-center rounded-xl bg-subtle px-5 pt-7 pb-5">
          <h2 id="invite-code-label" className="text-body-s text-secondary">
            초대코드
          </h2>
          <p className="mt-1.5 font-amount text-amount-xl tracking-[4px] whitespace-nowrap text-amount-default">
            {formatInviteCode(code)}
          </p>
          <div className="mt-6 flex w-full gap-2">
            <Button
              type="secondary"
              size="m"
              leadingIcon
              icon="copy"
              label="복사"
              className="min-w-0 flex-1"
              onClick={() => void copyInviteCode(code)}
            />
            <Button
              type="secondary"
              size="m"
              leadingIcon
              icon="share"
              label="공유"
              className="min-w-0 flex-1"
              onClick={() => void shareInvite({ groupName: trip.groupName, code })}
            />
          </div>
        </section>
      )}

      <div className="min-h-10 flex-1" />
      <div className="pb-4">
        <Button type="primary" size="l" label="여정으로 가기" className="w-full" onClick={goToTrip} />
      </div>
    </Screen>
  )
}

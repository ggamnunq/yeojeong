import { useLocation, useNavigate } from 'react-router'
import { paths } from '../../../app/paths'
import { useTripDetail } from '../../../app/trip'
import { Button, ShellSub } from '../../../ds'
import { copyInviteCode, shareInvite } from '../invite'
import { formatInviteCode } from '../rules'
import type { NavState } from '../types'

/**
 * HF-11 생성 완료 · 초대코드(FR-202). 초대코드가 화면의 영웅(Plex 40, 자간 4, 톤 카드) + 복사 · 공유.
 * ✕ · 「여정으로 가기」 · 뒤로 가기 → 시작 전 여정 정보(HF-16). 셸 = Shell/Sub + TopHeader Type=Close(v1.6), 버튼은 하단 CTA(토스트가 그 위에 뜬다).
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
    <ShellSub header={{ type: 'close', onClose: goToTrip }} cta={{ label: '여정으로 가기', onClick: () => void goToTrip() }}>
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

    </ShellSub>
  )
}

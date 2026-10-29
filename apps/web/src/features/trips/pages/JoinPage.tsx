import { useQuery } from '@tanstack/react-query'
import { INVITE_CODE_LENGTH, normalizeInviteCode } from '@yeojeong/shared'
import { useEffect, useState } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router'
import { handleApiError, isApiError } from '../../../api'
import { paths } from '../../../app/paths'
import { AvatarStack, Input, RouteProgress, ShellSub } from '../../../ds'
import { toast } from '../../../notifications'
import { invitePreviewQuery, useJoinTrip } from '../api'
import { useDebouncedValue } from '../hooks'
import { inviteErrorText } from '../invite'
import { inviteCodeFromLink, inviteCodeInLocation, rememberPendingInvite } from '../pendingInvite'
import { COPY, daysBetween, formatInviteCode, formatRouteDate, inviteInputChars, todayKst } from '../rules'
import type { InvitePreview } from '../types'

// HF-12 초대코드로 참여(FR-203·204). 코드 없이 들어온 /join에서만(C-42). 6자가 차면 300ms 뒤 미리보기, 미리보기가 있을 때만 「참여하기」.
// 참여하면 단계별 기본 탭(시작 전 → 여정 정보, 진행 중 → 결제내역). 이미 멤버면 그 여정으로 + "이미 참여한 여정이에요".
// #code=(QR·공유 링크) 또는 예전 ?code=(옛 링크·returnTo)가 있으면 코드를 이 탭에 보관하고 진입 라우팅 첫 화면으로 replace — 첫 화면 위 응답 시트(HF-62).
// 앱 밖에서 연 링크는 앱 시작 때 같은 일을 먼저 한다(pendingInvite.captureInviteLink).

/** 붙여 넣은 참여 링크(…/join#code=K7M2QX · 예전 …/join?code=K7M2QX)면 코드만 꺼낸다 */
function codeFromInput(value: string): string {
  const fromLink = /[?&#]code=([^&#\s]+)/.exec(value)?.[1]
  return inviteInputChars(fromLink ?? value)
}

export default function JoinPage() {
  const location = useLocation()
  const linked = inviteCodeInLocation(location)
  if (linked !== null) return <InviteLinkRedirect code={linked} />
  return <JoinForm />
}

/** /join#code=… · 예전 ?code=…: 코드를 보관하고(같은 코드면 다시 써도 같다) 주소에서 지우며 첫 화면으로. 글자가 없으면 코드 없는 /join */
function InviteLinkRedirect({ code }: { code: string | null }) {
  const [kept] = useState(() => (inviteCodeFromLink(code) ? rememberPendingInvite(code ?? '') : false))
  return <Navigate replace to={kept ? paths.splash() : paths.join()} />
}

function JoinForm() {
  const navigate = useNavigate()
  const location = useLocation()
  const [chars, setChars] = useState('')
  const code = normalizeInviteCode(chars)
  // 멈춘 뒤 300ms
  const lookup = useDebouncedValue(code, 300)
  const preview = useQuery({ ...invitePreviewQuery(lookup ?? ''), enabled: lookup !== null && lookup === code })
  const join = useJoinTrip()

  const current = code !== null && lookup === code ? preview : null
  const previewError = current?.error ?? null
  const joinError = join.error
  const localError = chars.length === INVITE_CODE_LENGTH && code === null ? COPY.inviteInvalid : null
  const errorText = localError ?? inviteErrorText(previewError) ?? inviteErrorText(joinError)
  const data: InvitePreview | undefined = current?.data

  // 입력란에서 안내하지 않는 조회 실패(429 등)는 전역 토스트로
  useEffect(() => {
    if (previewError && inviteErrorText(previewError) === null) handleApiError(previewError)
  }, [previewError])

  const goToTrip = (tripId: string) => navigate(paths.trip(tripId), { replace: true })

  const submit = () => {
    if (!code || !data) return
    if (data.alreadyMember && data.tripId) {
      toast.info(COPY.alreadyMember)
      return void goToTrip(data.tripId)
    }
    join.mutate(code, {
      onSuccess: ({ tripId }) => void goToTrip(tripId),
      onError: (error) => {
        if (isApiError(error) && error.code === 'ALREADY_MEMBER' && data.tripId) {
          toast.info(COPY.alreadyMember)
          return void goToTrip(data.tripId)
        }
        if (inviteErrorText(error) === null) handleApiError(error)
      },
    })
  }

  const onChange = (value: string) => {
    setChars(codeFromInput(value))
    join.reset()
  }

  return (
    <ShellSub
      header={{
        title: '초대코드로 참여',
        onBack: () => (location.key === 'default' ? navigate(paths.splash(), { replace: true }) : navigate(-1)),
      }}
      cta={{ label: '참여하기', onClick: submit, disabled: !data || errorText !== null, state: join.isPending ? 'loading' : 'default' }}
    >
      <Input
        label="초대코드"
        // Figma: 라벨 숨김(DS Input Label 끄기 속성 없음 → 화면에서만 숨김), 값 자간 2
        className="[&_input]:tracking-[2px] [&>label]:sr-only"
        value={formatInviteCode(chars)}
        maxLength={INVITE_CODE_LENGTH + 1}
        autoFocus
        autoCapitalize="characters"
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        enterKeyHint="go"
        error={errorText !== null}
        helper={errorText ?? undefined}
        onChange={(e) => onChange(e.target.value)}
        onClear={() => onChange('')}
        onKeyDown={(e) => {
          if (e.key === 'Enter') submit()
        }}
      />

      {current?.isFetching && !data && (
        <div role="status" aria-label="불러오는 중" className="mt-6 h-49 animate-pulse rounded-xl bg-muted motion-reduce:animate-none" />
      )}
      {data && errorText === null && <InviteCard preview={data} />}
    </ShellSub>
  )
}

/** 미리보기 톤 영웅 카드: 여정명 H2 · 장소 · 경로(시작 전) · 그룹원 스택 + "{n}명 참여 중" */
function InviteCard({ preview }: { preview: InvitePreview }) {
  const days = daysBetween(preview.startDate, preview.endDate) + 1
  const ongoing = preview.status === 'ONGOING'
  const today = daysBetween(preview.startDate, todayKst()) + 1
  return (
    <section aria-label="여정 미리보기" className="mt-6 flex flex-col rounded-xl bg-subtle px-5 pt-6 pb-5">
      <h2 className="text-h2 text-primary">{preview.groupName}</h2>
      {/* 장소는 사용자가 적은 글자 그대로 — 길면 한 줄 말줄임(0-5) */}
      <p className="mt-0.5 truncate text-body-s text-secondary">{preview.placeLabel}</p>
      <RouteProgress
        className="mt-5"
        phase={ongoing ? 'ongoing' : 'upcoming'}
        start={formatRouteDate(preview.startDate)}
        end={formatRouteDate(preview.endDate)}
        days={days}
        current={ongoing ? today : undefined}
      />
      <div className="mt-5 flex items-center gap-2">
        {preview.membersPreview.length > 0 && (
          <AvatarStack
            size="s"
            overflow={false}
            people={preview.membersPreview.map((m, i) => ({ name: m.nickname, src: m.profileImageUrl, joinOrder: i + 1 }))}
          />
        )}
        <span className="text-body-s text-secondary">{preview.memberCount}명 참여 중</span>
      </div>
    </section>
  )
}

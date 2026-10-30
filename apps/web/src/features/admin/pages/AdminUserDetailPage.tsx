import { ADMIN_FEATURE_GRANT_NOTE_MAX, ADMIN_TOTP, ADMIN_WITHDRAW_REASON_LENGTH, type AdminUserDetail } from '@yeojeong/shared'
import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { isApiError } from '../../../api'
import { LoadingScreen } from '../../../app/states'
import { Button, Callout, Dialog, Input, Tag } from '../../../ds'
import { focusRing } from '../../../ds/styles'
import { EmptyRow, ErrorText, InfoList, Metric, Section, StatusTag, Table, TableBox, Td, Th } from '../components'
import { FeatureGrantControl } from '../FeatureGrantControl'
import { useFeatureGrantFlow } from '../featureGrantFlow'
import { cardImportLabel, CONSENT_LABEL, FEATURE_LABEL, FEATURE_MODE_LABEL, formatCount, formatDate, formatDateTime, formatWait, isTotpComplete, maskedKakaoId, totpDigits, TRIP_STATUS_LABEL } from '../format'
import { useAdminFeatureGrants, useAdminUser, useAdminWithdraw } from '../hooks'
import { adminPaths } from '../paths'
import type { AdminUsersNotice } from './AdminUsersPage'

/** /admin/users/:userId: 회원 정보·동의·여정·건수(내용 없음) + 탈퇴 처리 */
export default function AdminUserDetailPage() {
  const { userId = '' } = useParams()
  const user = useAdminUser(userId)

  return (
    <>
      <Link to={adminPaths.users()} className={`self-start rounded-xs text-body-s text-secondary hover:underline ${focusRing}`}>
        ← 회원 목록
      </Link>
      {user.isPending ? (
        <LoadingScreen inset />
      ) : user.isError ? (
        isApiError(user.error) && user.error.code === 'NOT_FOUND' ? (
          <p role="alert" className="text-body-m text-secondary">
            회원을 찾을 수 없어요
          </p>
        ) : (
          <div className="flex flex-col items-start gap-3">
            <ErrorText error={user.error} />
            <Button type="secondary" size="m" label="다시 시도" onClick={() => void user.refetch()} />
          </div>
        )
      ) : (
        <UserDetail user={user.data} />
      )}
    </>
  )
}

function UserDetail({ user }: { user: AdminUserDetail }) {
  return (
    <>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-h1 break-all text-primary">{user.nickname}</h1>
        <StatusTag status={user.status} />
      </div>
      <InfoList
        items={[
          { label: '사용자 ID', value: <span className="font-mono text-body-s">{user.id}</span> },
          { label: '가입일', value: formatDateTime(user.createdAt) },
          { label: '최근 로그인', value: formatDateTime(user.lastLoginAt) },
          { label: '카카오 회원번호', value: maskedKakaoId(user.kakaoIdLast4) },
          { label: '카드 불러오기', value: cardImportLabel(user.cardImport) },
          {
            label: '탈퇴 요청',
            value: user.deletionRequest
              ? `${formatDateTime(user.deletionRequest.requestedAt)} 요청`
              : '없음',
          },
        ]}
      />

      <Section title="건수">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
          <Metric label="참여 여정" value={formatCount(user.tripCount)} />
          <Metric label="결제" value={formatCount(user.counts.expenses)} />
          <Metric label="지갑 항목" value={formatCount(user.counts.walletEntries)} />
          <Metric label="결제수단" value={formatCount(user.counts.paymentMethods)} />
          <Metric label="활성 세션" value={formatCount(user.counts.activeSessions)} />
        </div>
      </Section>

      <Section title="동의 현황">
        <TableBox label="동의 현황 표">
          <Table>
            <thead>
              <tr>
                <Th>종류</Th>
                <Th>버전</Th>
                <Th>동의</Th>
                <Th>동의 일시</Th>
                <Th>철회 일시</Th>
              </tr>
            </thead>
            <tbody>
              {user.consents.length === 0 ? (
                <EmptyRow colSpan={5} label="동의 기록이 없어요" />
              ) : (
                user.consents.map((c, i) => (
                  <tr key={`${c.consentId}-${c.version}-${i}`}>
                    <Td>{CONSENT_LABEL[c.consentId] ?? c.consentId}</Td>
                    <Td mono>{c.version}</Td>
                    <Td>{c.agreed ? '동의' : '미동의'}</Td>
                    <Td>{formatDateTime(c.agreedAt)}</Td>
                    <Td>{c.withdrawnAt ? `${formatDateTime(c.withdrawnAt)}${c.withdrawChannel ? ` (${c.withdrawChannel})` : ''}` : '—'}</Td>
                  </tr>
                ))
              )}
            </tbody>
          </Table>
        </TableBox>
      </Section>

      <Section title="그룹 · 여정">
        <TableBox label="그룹 · 여정 표">
          <Table minWidth="min-w-[760px]">
            <thead>
              <tr>
                <Th>이름</Th>
                <Th>상태</Th>
                <Th>기간</Th>
                <Th>역할</Th>
                <Th>참여</Th>
                <Th>나감</Th>
              </tr>
            </thead>
            <tbody>
              {user.trips.length === 0 ? (
                <EmptyRow colSpan={6} label="참여한 여정이 없어요" />
              ) : (
                user.trips.map((t) => (
                  <tr key={t.groupId}>
                    <Td>
                      <span className="flex items-center gap-2">
                        {t.name}
                        {t.deleted && <Tag type="left" size="s" label="삭제됨" />}
                      </span>
                    </Td>
                    <Td>{t.tripStatus ? (TRIP_STATUS_LABEL[t.tripStatus] ?? t.tripStatus) : '—'}</Td>
                    <Td>{t.startDate ? `${formatDate(t.startDate)} ~ ${formatDate(t.endDate)}` : '—'}</Td>
                    <Td>{t.role === 'LEADER' ? '그룹장' : '멤버'}</Td>
                    <Td>{formatDateTime(t.joinedAt)}</Td>
                    <Td>{t.leftAt ? formatDateTime(t.leftAt) : '—'}</Td>
                  </tr>
                ))
              )}
            </tbody>
          </Table>
        </TableBox>
      </Section>

      <FeatureGrantSection user={user} />

      <WithdrawSection user={user} />
    </>
  )
}

/**
 * 기능 권한(ADMIN3): 이 회원의 기능별 권한 토글. 기능 권한 탭과 같은 조각·같은 API(q = 사용자 ID)를 쓴다.
 * 부여·회수 모두 확인 다이얼로그를 거치고(되돌릴 수 있어 재인증은 없다), env 목록으로 준 권한은 여기서 회수할 수 없다
 */
function FeatureGrantSection({ user }: { user: AdminUserDetail }) {
  const grants = useAdminFeatureGrants(user.id)
  const [note, setNote] = useState('')
  const [notice, setNotice] = useState<string | null>(null)
  const flow = useFeatureGrantFlow({
    features: grants.data?.features,
    note,
    onDone: (message) => {
      setNotice(message)
      setNote('')
    },
  })
  const row = grants.data?.items.find((item) => item.userId === user.id)

  return (
    <Section
      title="기능 권한"
      actions={
        <Link to={adminPaths.features()} className={`rounded-xs text-body-s-strong text-brand underline-offset-2 hover:underline ${focusRing}`}>
          기능 권한 탭
        </Link>
      }
    >
      {notice && (
        <div role="status">
          <Callout tone="info" style="tone" chevron={false} label={notice} />
        </div>
      )}
      <div className="flex flex-col gap-3 rounded-xl bg-surface p-5 shadow-elevation-1">
        {grants.isPending ? (
          <p className="text-body-s text-tertiary">불러오는 중…</p>
        ) : grants.isError || !row ? (
          <ErrorText error={grants.error ?? new Error('not found')} />
        ) : (
          <ul className="flex flex-col divide-y divide-default">
            {row.cells.map((cell) => {
              const mode = grants.data.features.find((f) => f.feature === cell.feature)?.effectiveMode ?? 'off'
              return (
                <li key={cell.feature} aria-label={FEATURE_LABEL[cell.feature]} className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
                  <div className="flex min-w-0 flex-col gap-0.5">
                    <span className="text-body-m-strong text-primary">{FEATURE_LABEL[cell.feature]}</span>
                    <span className="text-caption text-tertiary">
                      단계 {FEATURE_MODE_LABEL[mode]}
                      {cell.sources.includes('ENV') && !cell.sources.includes('ADMIN') && ' · env로 준 권한이라 여기서 회수할 수 없어요(tfvars에서 빼야 해요)'}
                      {cell.note && ` · 메모: ${cell.note}`}
                    </span>
                  </div>
                  <FeatureGrantControl row={row} cell={cell} onRequest={flow.request} />
                </li>
              )
            })}
          </ul>
        )}
        <Input
          label="부여 메모(선택)"
          name="featureGrantNote"
          maxLength={ADMIN_FEATURE_GRANT_NOTE_MAX}
          value={note}
          helper="권한을 줄 때 함께 남겨요. 개인정보를 적지 마세요"
          onChange={(e) => setNote(e.target.value)}
          className="sm:max-w-md"
        />
        <ErrorText error={flow.error} />
      </div>
      {flow.dialog}
    </Section>
  )
}

/** 재인증 시도 제한 문구(남은 시간) */
function stepUpLimitMessage(error: unknown): string | null {
  if (!isApiError(error) || error.code !== 'ADMIN_STEP_UP_RATE_LIMITED') return null
  const fromBody = error.details?.retryAfterSec
  const seconds = typeof fromBody === 'number' ? fromBody : error.retryAfterSec
  return seconds ? `${error.message} (${formatWait(Math.ceil(seconds))} 후)` : error.message
}

/**
 * 탈퇴 처리: ① 사유 + 닉네임 다시 입력 + 재인증(관리자 비밀번호 + 지금 인증 코드) → ② 확인 다이얼로그(Danger).
 * 서비스 내 탈퇴와 같은 파이프라인. 비밀번호는 이 컴포넌트 상태에만 두고(저장소 없음) 실패하면 인증 코드를 비운다
 */
function WithdrawSection({ user }: { user: AdminUserDetail }) {
  const [reason, setReason] = useState('')
  const [confirmNickname, setConfirmNickname] = useState('')
  const [password, setPassword] = useState('')
  const [totp, setTotp] = useState('')
  const [dialogOpen, setDialogOpen] = useState(false)
  const withdraw = useAdminWithdraw(user.id)
  const navigate = useNavigate()

  const reasonLength = reason.trim().length
  const reasonOk = reasonLength >= ADMIN_WITHDRAW_REASON_LENGTH.MIN && reasonLength <= ADMIN_WITHDRAW_REASON_LENGTH.MAX
  const nicknameOk = confirmNickname === user.nickname
  const mismatch = isApiError(withdraw.error) && withdraw.error.code === 'ADMIN_CONFIRM_MISMATCH'
  const stepUpFailed = isApiError(withdraw.error) && withdraw.error.code === 'ADMIN_STEP_UP_FAILED'
  const stepUpLimited = stepUpLimitMessage(withdraw.error)
  const stepUpOk = password !== '' && isTotpComplete(totp)

  const onConfirm = () => {
    withdraw.mutate(
      { reason: reason.trim(), confirmNickname, password, totp },
      {
        onSuccess: () => {
          setDialogOpen(false)
          navigate(adminPaths.users(), { replace: true, state: { notice: `${user.nickname} 님을 탈퇴 처리했어요` } satisfies AdminUsersNotice })
        },
        onError: () => {
          setDialogOpen(false)
          // 한 번 보낸 인증 코드는 다시 쓸 수 없다
          setTotp('')
        },
      },
    )
  }

  return (
    <Section title="회원 탈퇴 처리" className="rounded-xl border border-feedback-error-border p-5">
      <p className="text-body-s text-secondary">되돌릴 수 없어요. 사유는 접근 기록에 남으니 개인정보를 적지 마세요.</p>
      <div className="grid gap-4 md:grid-cols-2">
        <Input
          label="사유"
          name="reason"
          maxLength={ADMIN_WITHDRAW_REASON_LENGTH.MAX}
          value={reason}
          helper={`${reasonLength}/${ADMIN_WITHDRAW_REASON_LENGTH.MAX}`}
          onChange={(e) => setReason(e.target.value)}
        />
        <Input
          label="닉네임 다시 입력"
          name="confirmNickname"
          autoComplete="off"
          placeholder={user.nickname}
          value={confirmNickname}
          error={mismatch}
          helper={mismatch ? withdraw.error?.message : undefined}
          onChange={(e) => setConfirmNickname(e.target.value)}
        />
        <Input
          label="관리자 비밀번호"
          type="password"
          name="stepUpPassword"
          autoComplete="current-password"
          maxLength={256}
          value={password}
          error={stepUpFailed}
          onChange={(e) => setPassword(e.target.value)}
        />
        <Input
          label="인증 코드"
          name="stepUpTotp"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9]{6}"
          maxLength={ADMIN_TOTP.DIGITS}
          value={totp}
          error={stepUpFailed}
          helper={stepUpFailed ? withdraw.error?.message : (stepUpLimited ?? undefined)}
          onChange={(e) => setTotp(totpDigits(e.target.value))}
        />
      </div>
      {withdraw.isError && !mismatch && !stepUpFailed && !stepUpLimited && <ErrorText error={withdraw.error} />}
      <Button
        type="danger"
        size="m"
        label="탈퇴 처리"
        className="self-start"
        disabled={!reasonOk || !nicknameOk || !stepUpOk}
        onClick={() => {
          withdraw.reset()
          setDialogOpen(true)
        }}
      />
      <Dialog
        open={dialogOpen}
        type="danger"
        title={`${user.nickname} 님을 탈퇴 처리할까요?`}
        message="세션·결제수단·개인 기록이 지워지고 되돌릴 수 없어요"
        confirmLabel="탈퇴 처리"
        confirmState={withdraw.isPending ? 'loading' : 'default'}
        onCancel={() => {
          if (!withdraw.isPending) setDialogOpen(false)
        }}
        onConfirm={onConfirm}
      />
    </Section>
  )
}

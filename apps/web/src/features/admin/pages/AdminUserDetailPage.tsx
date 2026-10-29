import { ADMIN_WITHDRAW_REASON_LENGTH, type AdminUserDetail } from '@yeojeong/shared'
import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { isApiError } from '../../../api'
import { LoadingScreen } from '../../../app/states'
import { Button, Dialog, Input, Tag } from '../../../ds'
import { focusRing } from '../../../ds/styles'
import { EmptyRow, ErrorText, InfoList, Metric, Section, StatusTag, Table, TableBox, Td, Th } from '../components'
import { cardImportLabel, CONSENT_LABEL, formatCount, formatDate, formatDateTime, maskedKakaoId, TRIP_STATUS_LABEL } from '../format'
import { useAdminUser, useAdminWithdraw } from '../hooks'
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
              ? `${formatDateTime(user.deletionRequest.requestedAt)} 요청 · ${formatDateTime(user.deletionRequest.expiresAt)} 만료`
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

      <WithdrawSection user={user} />
    </>
  )
}

/** 탈퇴 처리: ① 사유 + 닉네임 다시 입력 → ② 확인 다이얼로그(Danger). 서비스 내 탈퇴와 같은 파이프라인 */
function WithdrawSection({ user }: { user: AdminUserDetail }) {
  const [reason, setReason] = useState('')
  const [confirmNickname, setConfirmNickname] = useState('')
  const [dialogOpen, setDialogOpen] = useState(false)
  const withdraw = useAdminWithdraw(user.id)
  const navigate = useNavigate()

  const reasonLength = reason.trim().length
  const reasonOk = reasonLength >= ADMIN_WITHDRAW_REASON_LENGTH.MIN && reasonLength <= ADMIN_WITHDRAW_REASON_LENGTH.MAX
  const nicknameOk = confirmNickname === user.nickname
  const mismatch = isApiError(withdraw.error) && withdraw.error.code === 'ADMIN_CONFIRM_MISMATCH'

  const onConfirm = () => {
    withdraw.mutate(
      { reason: reason.trim(), confirmNickname },
      {
        onSuccess: () => {
          setDialogOpen(false)
          navigate(adminPaths.users(), { replace: true, state: { notice: `${user.nickname} 님을 탈퇴 처리했어요` } satisfies AdminUsersNotice })
        },
        onError: () => setDialogOpen(false),
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
      </div>
      {withdraw.isError && !mismatch && <ErrorText error={withdraw.error} />}
      <Button
        type="danger"
        size="m"
        label="탈퇴 처리"
        className="self-start"
        disabled={!reasonOk || !nicknameOk}
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

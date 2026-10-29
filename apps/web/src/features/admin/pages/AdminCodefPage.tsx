import type { AdminCodefUsage } from '@yeojeong/shared'
import { Link } from 'react-router'
import { LoadingScreen } from '../../../app/states'
import { Button } from '../../../ds'
import { focusRing } from '../../../ds/styles'
import { EmptyRow, ErrorText, InfoList, Metric, Section, Table, TableBox, Td, Th } from '../components'
import { formatCount, formatDateTime } from '../format'
import { useAdminCodefUsage } from '../hooks'
import { adminPaths } from '../paths'

const percent = (value: number, total: number) => (total > 0 ? Math.min(100, Math.round((value / total) * 100)) : 0)

/** /admin/codef: CODEF 호출 한도·횟수 현황(읽기 전용 — 예산·플래그는 Terraform/env로만 바꾼다) */
export default function AdminCodefPage() {
  const usage = useAdminCodefUsage()

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-h1 text-primary">CODEF 현황</h1>
        <div className="flex items-center gap-3">
          {usage.data && <span className="text-caption text-tertiary">{formatDateTime(usage.data.asOf)} 기준</span>}
          <Button
            type="secondary"
            size="s"
            label="새로고침"
            state={usage.isFetching ? 'loading' : 'default'}
            onClick={() => void usage.refetch()}
          />
        </div>
      </div>
      {usage.isPending ? (
        <LoadingScreen inset />
      ) : usage.isError ? (
        <ErrorText error={usage.error} />
      ) : (
        <CodefUsage data={usage.data} />
      )}
    </>
  )
}

function CodefUsage({ data }: { data: AdminCodefUsage }) {
  const { today } = data
  const used = percent(today.calls, today.budget)
  return (
    <>
      <Section title={`오늘 (${today.day})`}>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
          <Metric label="사용 호출" value={`${formatCount(today.calls)} / ${formatCount(today.budget)}`} sub={`예산의 ${used}%`} />
          <Metric label="예약 중" value={formatCount(today.reserved)} />
          <Metric label="진행 중 조회" value={formatCount(today.inProgress)} />
          <Metric label="남은 호출" value={formatCount(today.remaining)} />
          <Metric label="로그인 쿨다운" value={`${formatCount(data.loginCooldownUsers)}명`} />
        </div>
        <div
          role="meter"
          aria-label="오늘 예산 사용"
          aria-valuemin={0}
          aria-valuemax={today.budget}
          aria-valuenow={Math.min(today.calls, today.budget)}
          className="h-2 overflow-hidden rounded-full bg-muted"
        >
          <div className="h-full rounded-full bg-brand" style={{ width: `${used}%` }} />
        </div>
        <div className="grid grid-cols-3 gap-3">
          <Metric label="조회 시작" value={formatCount(today.fetchStarts)} />
          <Metric label="성공" value={formatCount(today.successes)} />
          <Metric label="실패" value={formatCount(today.failures)} />
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <TableBox label="오늘 결과 코드별">
            <Table minWidth="min-w-[360px]">
              <thead>
                <tr>
                  <Th>단계</Th>
                  <Th>결과</Th>
                  <Th align="right">건수</Th>
                </tr>
              </thead>
              <tbody>
                {today.byResult.length === 0 ? (
                  <EmptyRow colSpan={3} label="오늘 조회가 없어요" />
                ) : (
                  today.byResult.map((r) => (
                    <tr key={`${r.step}-${r.result}`}>
                      <Td>{r.step === 'TWO_WAY' ? '추가 인증' : r.step === 'START' ? '새 조회' : r.step}</Td>
                      <Td mono>{r.result}</Td>
                      <Td align="right">{formatCount(r.count)}</Td>
                    </tr>
                  ))
                )}
              </tbody>
            </Table>
          </TableBox>
          <TableBox label="오늘 카드사별">
            <Table minWidth="min-w-[280px]">
              <thead>
                <tr>
                  <Th>카드사 코드</Th>
                  <Th align="right">새 조회</Th>
                </tr>
              </thead>
              <tbody>
                {today.byOrganization.length === 0 ? (
                  <EmptyRow colSpan={2} label="오늘 조회가 없어요" />
                ) : (
                  today.byOrganization.map((o) => (
                    <tr key={o.organization}>
                      <Td mono>{o.organization}</Td>
                      <Td align="right">{formatCount(o.count)}</Td>
                    </tr>
                  ))
                )}
              </tbody>
            </Table>
          </TableBox>
        </div>
      </Section>

      <Section title={`최근 ${data.days.length}일`}>
        <TableBox label="일별 호출 표">
          <Table minWidth="min-w-[720px]">
            <thead>
              <tr>
                <Th>날짜</Th>
                <Th align="right">CODEF 호출</Th>
                <Th>예산 대비</Th>
                <Th align="right">조회 시작</Th>
                <Th align="right">성공</Th>
                <Th align="right">실패</Th>
              </tr>
            </thead>
            <tbody>
              {data.days.map((d) => (
                <tr key={d.day}>
                  <Td>{d.day}</Td>
                  <Td align="right">{d.codefCalls === null ? '—' : formatCount(d.codefCalls)}</Td>
                  <Td>
                    {d.codefCalls === null ? (
                      <span className="text-caption text-tertiary">—</span>
                    ) : (
                      <div aria-hidden className="h-2 w-40 overflow-hidden rounded-full bg-muted">
                        <div className="h-full rounded-full bg-brand" style={{ width: `${percent(d.codefCalls, today.budget)}%` }} />
                      </div>
                    )}
                  </Td>
                  <Td align="right">{formatCount(d.fetchStarts)}</Td>
                  <Td align="right">{formatCount(d.successes)}</Td>
                  <Td align="right">{formatCount(d.failures)}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </TableBox>
        <p className="text-caption text-tertiary">CODEF 호출 수는 7일 보관이라 그 전 날은 —로 보여요. 조회 기록은 1년 보관이에요.</p>
      </Section>

      <Section title="오늘 조회가 많은 회원">
        <TableBox label="회원별 오늘 조회 표">
          <Table minWidth="min-w-[560px]">
            <thead>
              <tr>
                <Th>사용자 ID</Th>
                <Th>닉네임</Th>
                <Th align="right">오늘 조회</Th>
              </tr>
            </thead>
            <tbody>
              {data.topUsers.length === 0 ? (
                <EmptyRow colSpan={3} label="오늘 조회한 회원이 없어요" />
              ) : (
                data.topUsers.map((u) => (
                  <tr key={u.userId}>
                    <Td mono>{u.userId}</Td>
                    <Td>
                      {u.nickname === null ? (
                        <span className="text-tertiary">탈퇴한 회원</span>
                      ) : (
                        <Link to={adminPaths.user(u.userId)} className={`rounded-xs text-brand hover:underline ${focusRing}`}>
                          {u.nickname}
                        </Link>
                      )}
                    </Td>
                    <Td align="right">
                      {formatCount(u.count)} / {formatCount(u.limit)}
                    </Td>
                  </tr>
                ))
              )}
            </tbody>
          </Table>
        </TableBox>
      </Section>

      <Section title="설정 · 대기">
        <InfoList
          items={[
            { label: 'FEATURE_CARD_IMPORT', value: data.flags.featureCardImport },
            { label: '실제 단계', value: data.flags.effectiveMode },
            { label: 'CODEF_ENV', value: data.flags.codefEnv },
            { label: 'CODEF_LOGIN_MODE', value: data.flags.codefLoginMode },
            { label: '허용 목록 인원', value: `${formatCount(data.flags.allowlistCount)}명` },
            {
              label: '계정 삭제 대기',
              value: data.pendingDeletions.count
                ? `${formatCount(data.pendingDeletions.count)}건 · 가장 오래된 것 ${formatDateTime(data.pendingDeletions.oldestCreatedAt)}`
                : '없음',
            },
          ]}
        />
      </Section>
    </>
  )
}

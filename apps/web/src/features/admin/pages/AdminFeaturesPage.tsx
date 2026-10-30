import {
  ADMIN_FEATURE_GRANT_NOTE_MAX,
  ADMIN_FEATURE_GRANT_SEARCH_LIMIT,
  ADMIN_USER_QUERY_MAX,
  FEATURE_KEY_VALUES,
  type AdminFeatureGrantList,
  type AdminFeatureStatus,
} from '@yeojeong/shared'
import { useState, type FormEvent } from 'react'
import { Link } from 'react-router'
import { LoadingScreen } from '../../../app/states'
import { Button, Callout, Input, Tag } from '../../../ds'
import { focusRing } from '../../../ds/styles'
import { EmptyRow, ErrorText, Section, Table, TableBox, Td, Th } from '../components'
import { FeatureGrantControl } from '../FeatureGrantControl'
import { useFeatureGrantFlow, type FeatureGrantTarget } from '../featureGrantFlow'
import { FEATURE_ENV_NAME, FEATURE_LABEL, FEATURE_MODE_LABEL, FEATURE_MODE_NOTICE, FEATURE_OFF_REASON, formatCount, formatDateTime } from '../format'
import { useAdminFeatureGrants } from '../hooks'
import { adminPaths } from '../paths'

/**
 * /admin/features: 회원별 기능 권한(ADMIN3). 회원 × 기능(카드 불러오기 · 위챗페이 파일 · 알리페이 파일) 표.
 * 기능별 전역 단계(off · allowlist · on)와 env 목록은 읽기 전용(Terraform/env로만 바꾼다). 권한은 allowlist 단계에서만 쓰인다.
 * 기본은 권한이 있는 회원(관리자 부여 + env 목록), 검색하면 닉네임·사용자 ID로 찾은 회원(권한 없어도)을 보여 준다.
 */
export default function AdminFeaturesPage() {
  const [draft, setDraft] = useState('')
  const [q, setQ] = useState('')
  const [note, setNote] = useState('')
  const [notice, setNotice] = useState<string | null>(null)
  const grants = useAdminFeatureGrants(q)
  const flow = useFeatureGrantFlow({
    features: grants.data?.features,
    note,
    onDone: (message) => {
      setNotice(message)
      setNote('')
    },
  })

  const search = (e: FormEvent) => {
    e.preventDefault()
    setQ(draft.trim())
  }
  const showAll = () => {
    setDraft('')
    setQ('')
  }

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-h1 text-primary">기능 권한</h1>
        <div className="flex items-center gap-3">
          {grants.data && <span className="text-caption text-tertiary">{formatDateTime(grants.data.asOf)} 기준</span>}
          <Button
            type="secondary"
            size="s"
            label="새로고침"
            state={grants.isFetching ? 'loading' : 'default'}
            onClick={() => void grants.refetch()}
          />
        </div>
      </div>
      {notice && (
        <div role="status">
          <Callout tone="info" style="tone" chevron={false} label={notice} />
        </div>
      )}
      {grants.isPending ? (
        <LoadingScreen inset />
      ) : grants.isError ? (
        <div className="flex flex-col items-start gap-3">
          <ErrorText error={grants.error} />
          <Button type="secondary" size="m" label="다시 시도" onClick={() => void grants.refetch()} />
        </div>
      ) : (
        <>
          <FeatureStatusSection features={grants.data.features} />
          <Section title={q ? `검색 결과 (${formatCount(grants.data.items.length)}명)` : `권한 있는 회원 (${formatCount(grants.data.items.length)}명)`}>
            <form role="search" aria-label="회원 찾기" onSubmit={search} className="flex flex-wrap items-end gap-2">
              <Input
                label="회원 검색"
                labelVisible={false}
                placeholder="닉네임 또는 사용자 ID"
                maxLength={ADMIN_USER_QUERY_MAX}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onClear={() => setDraft('')}
                className="min-w-0 flex-1 sm:max-w-md"
              />
              <Button htmlType="submit" type="secondary" size="m" label="회원 찾기" disabled={draft.trim() === ''} />
              {q !== '' && <Button type="secondary" size="m" label="권한 있는 회원 보기" onClick={showAll} />}
            </form>
            <Input
              label="부여 메모(선택)"
              name="featureGrantNote"
              maxLength={ADMIN_FEATURE_GRANT_NOTE_MAX}
              value={note}
              helper={`${note.trim().length}/${ADMIN_FEATURE_GRANT_NOTE_MAX} · 권한을 줄 때 함께 남겨요. 개인정보를 적지 마세요`}
              onChange={(e) => setNote(e.target.value)}
              className="sm:max-w-md"
            />
            <ErrorText error={flow.error} />
            <GrantMatrix data={grants.data} searching={q !== ''} onRequest={flow.request} />
            {grants.data.truncated && (
              <p className="text-caption text-tertiary">
                검색 결과가 많아 최근 가입한 {ADMIN_FEATURE_GRANT_SEARCH_LIMIT}명만 보여요. 더 자세히 찾아 주세요
              </p>
            )}
          </Section>
          {flow.dialog}
        </>
      )}
    </>
  )
}

/** 기능별 전역 단계(읽기 전용) */
function FeatureStatusSection({ features }: { features: AdminFeatureStatus[] }) {
  return (
    <Section title="기능별 단계">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {features.map((f) => (
          <div
            key={f.feature}
            role="group"
            aria-label={`${FEATURE_LABEL[f.feature]} 단계`}
            className="flex min-w-0 flex-col gap-1.5 rounded-xl bg-surface p-5 shadow-elevation-1"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-body-m-strong text-primary">{FEATURE_LABEL[f.feature]}</p>
              <Tag type={f.effectiveMode === 'off' ? 'warning' : 'pending'} size="s" label={FEATURE_MODE_LABEL[f.effectiveMode]} />
            </div>
            <p className="text-body-s text-secondary">{FEATURE_MODE_NOTICE[f.effectiveMode]}</p>
            <p className="text-caption break-all text-tertiary">
              <span className="font-mono">
                {FEATURE_ENV_NAME[f.feature]}={f.configuredMode}
              </span>
              {f.offReason && ` · ${FEATURE_OFF_REASON[f.offReason]}`}
            </p>
            {f.feature === 'CARD_IMPORT' && (
              <p className="text-caption text-tertiary">env 목록 {formatCount(f.envUserCount)}명 · tfvars에서만 바꿀 수 있어요</p>
            )}
          </div>
        ))}
      </div>
    </Section>
  )
}

/** 회원 × 기능 표. 좁은 화면에서는 표 상자 안에서만 가로로 넘친다 */
function GrantMatrix({
  data,
  searching,
  onRequest,
}: {
  data: AdminFeatureGrantList
  searching: boolean
  onRequest: (target: FeatureGrantTarget) => void
}) {
  return (
    <TableBox label="기능 권한 표">
      <Table minWidth="min-w-[680px]">
        <thead>
          <tr>
            <Th>회원</Th>
            {FEATURE_KEY_VALUES.map((feature) => (
              <Th key={feature}>{FEATURE_LABEL[feature]}</Th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.items.length === 0 ? (
            <EmptyRow colSpan={FEATURE_KEY_VALUES.length + 1} label={searching ? '검색 결과가 없어요' : '권한을 준 회원이 없어요'} />
          ) : (
            data.items.map((row) => (
              <tr key={row.userId} className="hover:bg-subtle">
                <Td>
                  <div className="flex flex-col gap-0.5">
                    {row.nickname === null ? (
                      <span className="text-tertiary">없는 회원</span>
                    ) : (
                      <Link
                        to={adminPaths.user(row.userId)}
                        className={`self-start rounded-xs text-body-s-strong text-brand underline-offset-2 hover:underline ${focusRing}`}
                      >
                        {row.nickname}
                      </Link>
                    )}
                    <span className="font-mono text-caption text-tertiary" title={row.userId}>
                      {row.userId.slice(0, 8)}
                    </span>
                  </div>
                </Td>
                {row.cells.map((cell) => (
                  <Td key={cell.feature}>
                    <FeatureGrantControl
                      row={row}
                      cell={cell}
                      onRequest={onRequest}
                      extra={
                        cell.feature === 'CARD_IMPORT' && row.nickname !== null
                          ? ` · ${row.cardImport.consent ? '동의' : '미동의'} · 오늘 ${formatCount(row.cardImport.todayFetchCount)}/${formatCount(data.cardImportDailyLimit)}`
                          : undefined
                      }
                    />
                  </Td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </Table>
    </TableBox>
  )
}

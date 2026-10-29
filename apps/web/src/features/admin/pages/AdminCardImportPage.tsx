import { ADMIN_CARD_IMPORT_GRANT_NOTE_MAX, ADMIN_USER_QUERY_MAX, type AdminCardImportGrant, type AdminCardImportGrantList, type AdminUserListItem } from '@yeojeong/shared'
import { useState, type FormEvent } from 'react'
import { Link } from 'react-router'
import { LoadingScreen } from '../../../app/states'
import { Button, Callout, Dialog, Input, Tag } from '../../../ds'
import { focusRing } from '../../../ds/styles'
import { EmptyRow, ErrorText, Section, Table, TableBox, Td, Th } from '../components'
import { CARD_IMPORT_MODE_NOTICE, cardImportLabel, formatCount, formatDateTime } from '../format'
import { useAdminCardImportGrants, useAdminGrantCardImport, useAdminRevokeCardImport, useAdminUsers } from '../hooks'
import { adminPaths } from '../paths'

/**
 * /admin/card-import: 카드 승인내역 불러오기(S8) 권한 관리. FEATURE_CARD_IMPORT=allowlist일 때
 * env CARD_IMPORT_ALLOWED_USER_IDS와 여기서 준 권한의 합집합에게만 보인다. env 항목은 보여 주기만 한다(회수 불가).
 */
export default function AdminCardImportPage() {
  const grants = useAdminCardImportGrants()
  const [notice, setNotice] = useState<string | null>(null)

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-h1 text-primary">카드 불러오기 권한</h1>
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
          <ModeNotice flags={grants.data.flags} />
          <GrantTable data={grants.data} onDone={setNotice} />
          <AddGrantSection grantedIds={new Set(grants.data.items.filter((i) => i.revocable).map((i) => i.userId))} onDone={setNotice} />
        </>
      )}
    </>
  )
}

function ModeNotice({ flags }: { flags: AdminCardImportGrantList['flags'] }) {
  const mode = flags.effectiveMode
  return (
    <div className="flex flex-col gap-2">
      <Callout
        tone={mode === 'off' ? 'warning' : 'info'}
        style="tone"
        chevron={false}
        label={CARD_IMPORT_MODE_NOTICE[mode] ?? `실제 단계 ${mode}`}
      />
      <p className="text-caption text-tertiary">
        FEATURE_CARD_IMPORT <span className="font-mono">{flags.featureCardImport}</span> · 실제 단계{' '}
        <span className="font-mono">{mode}</span>
        {flags.featureCardImport !== mode && ' (CODEF 키가 없어 꺼짐)'}
      </p>
    </div>
  )
}

/** 권한 추가: 회원 검색(회원 목록 검색 API 그대로 — 닉네임 부분 · 사용자 ID 정확) → 선택 → 메모(선택) → 추가 */
function AddGrantSection({ grantedIds, onDone }: { grantedIds: ReadonlySet<string>; onDone: (notice: string) => void }) {
  const [draft, setDraft] = useState('')
  const [q, setQ] = useState('')
  const [selected, setSelected] = useState<AdminUserListItem | null>(null)
  const [note, setNote] = useState('')
  const users = useAdminUsers(q, 'createdAt', { enabled: q !== '' })
  const grant = useAdminGrantCardImport()
  const results = users.data?.pages[0]?.items ?? []

  const search = (e: FormEvent) => {
    e.preventDefault()
    setQ(draft.trim())
    setSelected(null)
    grant.reset()
  }

  const submit = () => {
    if (!selected) return
    const trimmed = note.trim()
    grant.mutate(
      { userId: selected.id, ...(trimmed && { note: trimmed }) },
      {
        onSuccess: () => {
          onDone(`${selected.nickname} 님에게 카드 불러오기 권한을 줬어요`)
          setSelected(null)
          setNote('')
          setDraft('')
          setQ('')
        },
      },
    )
  }

  return (
    <Section title="권한 추가">
      <form role="search" aria-label="권한 줄 회원 찾기" onSubmit={search} className="flex flex-wrap items-end gap-2">
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
      </form>
      {q !== '' && (
        <>
          <ErrorText error={users.error} />
          <TableBox label="회원 검색 결과 표">
            <Table minWidth="min-w-[720px]">
              <thead>
                <tr>
                  <Th>닉네임</Th>
                  <Th>사용자 ID</Th>
                  <Th>카드 불러오기</Th>
                  <Th>선택</Th>
                </tr>
              </thead>
              <tbody>
                {users.isPending ? (
                  <EmptyRow colSpan={4} label="찾는 중…" />
                ) : results.length === 0 ? (
                  <EmptyRow colSpan={4} label="검색 결과가 없어요" />
                ) : (
                  results.map((user) => {
                    const already = grantedIds.has(user.id) || user.cardImport.granted
                    const isSelected = selected?.id === user.id
                    return (
                      <tr key={user.id} className={isSelected ? 'bg-brand-subtle' : 'hover:bg-subtle'}>
                        <Td>{user.nickname}</Td>
                        <Td mono>{user.id}</Td>
                        <Td>{cardImportLabel(user.cardImport)}</Td>
                        <Td>
                          {already ? (
                            <span className="text-caption text-tertiary">이미 권한 있음</span>
                          ) : (
                            <Button
                              type={isSelected ? 'primary' : 'secondary'}
                              size="s"
                              label={isSelected ? '선택됨' : '선택'}
                              aria-label={`${user.nickname} 선택`}
                              aria-pressed={isSelected}
                              onClick={() => {
                                grant.reset()
                                setSelected(isSelected ? null : user)
                              }}
                            />
                          )}
                        </Td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </Table>
          </TableBox>
        </>
      )}
      {selected && (
        <div className="flex flex-col gap-3 rounded-xl bg-surface p-5 shadow-elevation-1">
          <p className="text-body-m text-primary">
            <span className="text-body-m-strong">{selected.nickname}</span> 님에게 권한을 줘요
            <span className="ml-2 font-mono text-caption text-tertiary">{selected.id}</span>
          </p>
          <Input
            label="메모(선택)"
            name="grantNote"
            maxLength={ADMIN_CARD_IMPORT_GRANT_NOTE_MAX}
            value={note}
            helper={`${note.trim().length}/${ADMIN_CARD_IMPORT_GRANT_NOTE_MAX} · 접근 기록에도 남으니 개인정보를 적지 마세요`}
            onChange={(e) => setNote(e.target.value)}
            className="sm:max-w-md"
          />
          <ErrorText error={grant.error} />
          <Button
            type="primary"
            size="m"
            label="권한 추가"
            className="self-start"
            state={grant.isPending ? 'loading' : 'default'}
            onClick={submit}
          />
        </div>
      )}
    </Section>
  )
}

function SourceTags({ item }: { item: AdminCardImportGrant }) {
  return (
    <span className="flex items-center gap-1">
      {item.sources.includes('ADMIN') && <Tag type="pending" size="s" label="관리자" />}
      {item.sources.includes('ENV') && <Tag type="warning" size="s" label="env" />}
    </span>
  )
}

const displayName = (item: AdminCardImportGrant) => item.nickname ?? item.userId

function GrantTable({ data, onDone }: { data: AdminCardImportGrantList; onDone: (notice: string) => void }) {
  const [target, setTarget] = useState<AdminCardImportGrant | null>(null)
  const revoke = useAdminRevokeCardImport()

  const onConfirm = () => {
    if (!target) return
    revoke.mutate(target.userId, {
      onSuccess: () => {
        onDone(`${displayName(target)} 님의 카드 불러오기 권한을 회수했어요`)
        setTarget(null)
      },
      onError: () => setTarget(null),
    })
  }

  return (
    <Section title={`권한 목록 (${formatCount(data.items.length)}명)`}>
      <ErrorText error={revoke.error} />
      <TableBox label="카드 불러오기 권한 표">
        <Table minWidth="min-w-[1120px]">
          <thead>
            <tr>
              <Th>닉네임</Th>
              <Th>사용자 ID</Th>
              <Th>출처</Th>
              <Th>부여 시각</Th>
              <Th>부여자</Th>
              <Th>메모</Th>
              <Th>동의</Th>
              <Th align="right">오늘 조회</Th>
              <Th>회수</Th>
            </tr>
          </thead>
          <tbody>
            {data.items.length === 0 ? (
              <EmptyRow colSpan={9} label="권한을 준 회원이 없어요" />
            ) : (
              data.items.map((item) => (
                <tr key={item.userId} className="hover:bg-subtle">
                  <Td>
                    {item.nickname === null ? (
                      <span className="text-tertiary">없는 회원</span>
                    ) : (
                      <Link
                        to={adminPaths.user(item.userId)}
                        className={`rounded-xs text-body-s-strong text-brand underline-offset-2 hover:underline ${focusRing}`}
                      >
                        {item.nickname}
                      </Link>
                    )}
                  </Td>
                  <Td mono>{item.userId}</Td>
                  <Td>
                    <SourceTags item={item} />
                  </Td>
                  <Td>{formatDateTime(item.grantedAt)}</Td>
                  <Td mono>{item.grantedBy ? item.grantedBy.slice(0, 8) : '—'}</Td>
                  <Td>{item.note ?? '—'}</Td>
                  <Td>{item.cardImportConsent ? '동의' : '미동의'}</Td>
                  <Td align="right">{`${formatCount(item.todayFetchCount)} / ${formatCount(data.dailyLimit)}`}</Td>
                  <Td>
                    {item.revocable ? (
                      <Button
                        type="secondary"
                        size="s"
                        label="회수"
                        aria-label={`${displayName(item)} 권한 회수`}
                        onClick={() => {
                          revoke.reset()
                          setTarget(item)
                        }}
                      />
                    ) : (
                      <span className="text-caption text-tertiary">env — tfvars에서 빼야 해요</span>
                    )}
                  </Td>
                </tr>
              ))
            )}
          </tbody>
        </Table>
      </TableBox>
      <Dialog
        open={target !== null}
        type="danger"
        title={target ? `${displayName(target)} 님의 권한을 회수할까요?` : ''}
        message={
          target?.sources.includes('ENV')
            ? 'env 목록에도 있어 회수해도 계속 보여요'
            : '다음 요청부터 카드 불러오기가 보이지 않아요'
        }
        confirmLabel="회수"
        confirmState={revoke.isPending ? 'loading' : 'default'}
        onCancel={() => {
          if (!revoke.isPending) setTarget(null)
        }}
        onConfirm={onConfirm}
      />
    </Section>
  )
}

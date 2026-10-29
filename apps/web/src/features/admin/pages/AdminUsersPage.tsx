import { ADMIN_USER_QUERY_MAX, type AdminUserSort } from '@yeojeong/shared'
import { useState, type FormEvent } from 'react'
import { Link, useLocation, useSearchParams } from 'react-router'
import { Button, Callout, Input, SegmentedControl } from '../../../ds'
import { focusRing } from '../../../ds/styles'
import { EmptyRow, ErrorText, Section, StatusTag, Table, TableBox, Td, Th } from '../components'
import { cardImportLabel, formatCount, formatDateTime } from '../format'
import { useAdminUsers } from '../hooks'
import { adminPaths } from '../paths'

export type AdminUsersNotice = { notice?: string }

function SearchForm({ initial, onSearch }: { initial: string; onSearch: (q: string) => void }) {
  const [draft, setDraft] = useState(initial)
  const submit = (e: FormEvent) => {
    e.preventDefault()
    onSearch(draft.trim())
  }
  return (
    <form role="search" onSubmit={submit} className="flex flex-wrap items-end gap-2">
      <Input
        label="검색"
        labelVisible={false}
        placeholder="닉네임 또는 사용자 ID"
        maxLength={ADMIN_USER_QUERY_MAX}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onClear={() => setDraft('')}
        className="min-w-0 flex-1 sm:max-w-md"
      />
      <Button htmlType="submit" type="primary" size="m" label="검색" />
      {initial && <Button type="ghost" size="m" label="검색 지우기" onClick={() => onSearch('')} />}
    </form>
  )
}

/** /admin/users: 검색(닉네임 부분 · 사용자 ID 정확) · 정렬(가입일 · 최근 로그인) · 커서 "더 보기" */
export default function AdminUsersPage() {
  const [params, setParams] = useSearchParams()
  const q = (params.get('q') ?? '').slice(0, ADMIN_USER_QUERY_MAX)
  const sort: AdminUserSort = params.get('sort') === 'lastLoginAt' ? 'lastLoginAt' : 'createdAt'
  const users = useAdminUsers(q, sort)
  const location = useLocation()
  const notice = (location.state as AdminUsersNotice | null)?.notice

  const update = (next: { q?: string; sort?: AdminUserSort }) => {
    const search = new URLSearchParams()
    const nq = next.q ?? q
    const ns = next.sort ?? sort
    if (nq) search.set('q', nq)
    if (ns !== 'createdAt') search.set('sort', ns)
    setParams(search)
  }

  const items = users.data?.pages.flatMap((p) => p.items) ?? []

  return (
    <>
      <h1 className="text-h1 text-primary">회원</h1>
      {notice && (
        <div role="status">
          <Callout tone="info" style="tone" chevron={false} label={notice} />
        </div>
      )}
      <Section
        title="회원 목록"
        actions={
          <SegmentedControl
            size="s"
            aria-label="정렬"
            labels={['가입일', '최근 로그인']}
            selected={sort === 'createdAt' ? 'first' : 'second'}
            onChange={(_, index) => update({ sort: index === 0 ? 'createdAt' : 'lastLoginAt' })}
          />
        }
      >
        {/* 주소의 q가 바뀌면(검색 지우기·뒤로 가기) 입력도 그 값으로 다시 시작한다 */}
        <SearchForm key={q} initial={q} onSearch={(next) => update({ q: next })} />
        <ErrorText error={users.error} />
        <TableBox label="회원 목록 표">
          <Table minWidth="min-w-[1040px]">
            <thead>
              <tr>
                <Th>사용자 ID</Th>
                <Th>닉네임</Th>
                <Th>가입일</Th>
                <Th>최근 로그인</Th>
                <Th align="right">참여 여정</Th>
                <Th align="right">지갑 항목</Th>
                <Th>상태</Th>
                <Th>카드 불러오기</Th>
              </tr>
            </thead>
            <tbody>
              {users.isPending ? (
                <EmptyRow colSpan={8} label="불러오는 중…" />
              ) : items.length === 0 ? (
                <EmptyRow colSpan={8} label={q ? '검색 결과가 없어요' : '회원이 없어요'} />
              ) : (
                items.map((user) => (
                  <tr key={user.id} className="hover:bg-subtle">
                    <Td mono>{user.id}</Td>
                    <Td>
                      <Link to={adminPaths.user(user.id)} className={`rounded-xs text-body-s-strong text-brand underline-offset-2 hover:underline ${focusRing}`}>
                        {user.nickname}
                      </Link>
                    </Td>
                    <Td>{formatDateTime(user.createdAt)}</Td>
                    <Td>{formatDateTime(user.lastLoginAt)}</Td>
                    <Td align="right">{formatCount(user.tripCount)}</Td>
                    <Td align="right">{formatCount(user.walletEntryCount)}</Td>
                    <Td>
                      <StatusTag status={user.status} />
                    </Td>
                    <Td>{cardImportLabel(user.cardImport)}</Td>
                  </tr>
                ))
              )}
            </tbody>
          </Table>
        </TableBox>
        {users.hasNextPage && (
          <Button
            type="secondary"
            size="m"
            label="더 보기"
            className="self-center"
            state={users.isFetchingNextPage ? 'loading' : 'default'}
            onClick={() => void users.fetchNextPage()}
          />
        )}
      </Section>
    </>
  )
}

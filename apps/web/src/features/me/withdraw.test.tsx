import { configure, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { keys, type MyTripsResponse } from '../../api'
import { db } from '../../mocks/data'
import { server } from '../../mocks/server'
import { renderApp } from '../../test/render'
import { withdrawFacts } from './rules'

configure({ asyncUtilTimeout: 3000 })
vi.setConfig({ testTimeout: 15_000 })

afterEach(() => {
  vi.restoreAllMocks()
})

const trips = (items: { isLeader: boolean; memberCount: number }[]) =>
  server.use(
    http.get('/api/me/trips', () =>
      HttpResponse.json<MyTripsResponse>({
        lastViewedTripId: null,
        items: items.map((t, i) => ({
          tripId: `trip-${i}`,
          groupId: `group-${i}`,
          groupName: `여정 ${i}`,
          status: 'ONGOING',
          startDate: '2026-11-11',
          endDate: '2026-11-14',
          ...t,
        })),
      }),
    ),
  )

const facts = async () =>
  (await screen.findAllByRole('listitem')).map((li) => li.textContent)
const cta = () => screen.getByRole('button', { name: '탈퇴하기' }) as HTMLButtonElement

describe('탈퇴 사실 줄(HF-59·59c)', () => {
  it('그룹장 여정(다른 멤버 있음) → 승계 줄, 나만 남은 여정 → 삭제 줄', () => {
    const ids = (t: { isLeader: boolean; memberCount: number }[]) => withdrawFacts(t).map((f) => f.id)
    expect(ids([])).toEqual(['wallet', 'shared', 'leave'])
    expect(ids([{ isLeader: false, memberCount: 3 }])).toEqual(['wallet', 'shared', 'leave'])
    expect(ids([{ isLeader: true, memberCount: 2 }])).toEqual(['wallet', 'shared', 'leave', 'leader'])
    expect(ids([{ isLeader: true, memberCount: 1 }])).toEqual(['wallet', 'shared', 'leave', 'solo'])
    expect(ids([{ isLeader: true, memberCount: 4 }, { isLeader: true, memberCount: 1 }])).toEqual([
      'wallet',
      'shared',
      'leave',
      'leader',
      'solo',
    ])
  })
})

describe('탈퇴(HF-59)', () => {
  it('마이페이지 "탈퇴" → 사실 3줄 · 확인 체크 전에는 "탈퇴하기" 비활성', async () => {
    trips([{ isLeader: false, memberCount: 3 }])
    const { router } = renderApp('/me')
    fireEvent.click(await screen.findByRole('link', { name: '탈퇴' }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/me/withdraw'))
    expect(await screen.findByRole('heading', { level: 1, name: '탈퇴' })).toBeTruthy()
    expect(await facts()).toEqual([
      '지갑과 개인·미확정 결제가 삭제돼요',
      '공동 결제와 정산은 ‘탈퇴한 멤버’로 남아요',
      '참여한 여정에서 모두 나가요',
    ])
    expect(screen.getByText('지갑과 개인·미확정 결제').className).toContain('text-body-m-strong')
    expect(cta().disabled).toBe(true)
    fireEvent.click(screen.getByRole('checkbox', { name: '위 내용을 확인했어요' }))
    await waitFor(() => expect(cta().disabled).toBe(false))
  })

  it('그룹장인 여정이 있으면 "그룹장은 다음 멤버가 맡아요", 나만 남은 여정이 있으면 "나만 남은 여정은 삭제돼요"(HF-59c)', async () => {
    trips([
      { isLeader: true, memberCount: 4 },
      { isLeader: true, memberCount: 1 },
    ])
    renderApp('/me/withdraw')
    await waitFor(async () =>
      expect(await facts()).toEqual([
        '지갑과 개인·미확정 결제가 삭제돼요',
        '공동 결제와 정산은 ‘탈퇴한 멤버’로 남아요',
        '참여한 여정에서 모두 나가요',
        '그룹장은 다음 멤버가 맡아요',
        '나만 남은 여정은 삭제돼요',
      ]),
    )
  })

  it('탈퇴하기 → "탈퇴할까요?"(되돌릴 수 없어요) → 취소하면 아무 일도 없다', async () => {
    const calls: unknown[] = []
    server.use(
      http.delete('/api/users/me', async ({ request }) => {
        calls.push(await request.json())
        return new HttpResponse(null, { status: 204 })
      }),
    )
    renderApp('/me/withdraw')
    fireEvent.click(await screen.findByRole('checkbox', { name: '위 내용을 확인했어요' }))
    await waitFor(() => expect(cta().disabled).toBe(false))
    fireEvent.click(cta())
    const dialog = await screen.findByRole('alertdialog', { name: '탈퇴할까요?' })
    expect(within(dialog).getByText('되돌릴 수 없어요')).toBeTruthy()
    fireEvent.click(within(dialog).getByRole('button', { name: '취소' }))
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull())
    expect(calls).toEqual([])
  })

  it('탈퇴 → DELETE /users/me { confirm: true } → 로그인 화면 + "탈퇴했어요", 캐시를 비운다(HF-59d)', async () => {
    const calls: unknown[] = []
    server.use(
      http.delete('/api/users/me', async ({ request }) => {
        calls.push(await request.json())
        db.session = 'ANONYMOUS'
        return new HttpResponse(null, { status: 204 })
      }),
    )
    const { router, queryClient } = renderApp('/me/withdraw')
    fireEvent.click(await screen.findByRole('checkbox', { name: '위 내용을 확인했어요' }))
    await waitFor(() => expect(cta().disabled).toBe(false))
    fireEvent.click(cta())
    const dialog = await screen.findByRole('alertdialog', { name: '탈퇴할까요?' })
    fireEvent.click(within(dialog).getByRole('button', { name: '탈퇴' }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/login'))
    expect(calls).toEqual([{ confirm: true }])
    expect(await screen.findByText('탈퇴했어요')).toBeTruthy()
    await waitFor(() => expect(queryClient.getQueryData(keys.session)).toMatchObject({ status: 'ANONYMOUS' }))
    await waitFor(() => {
      expect(queryClient.getQueryData(keys.me)).toBeUndefined()
      expect(queryClient.getQueryData(keys.trips.list)).toBeUndefined()
    })
  })

  it('실패하면 그 화면에 남고 "잠시 후 다시 시도해 주세요"', async () => {
    server.use(http.delete('/api/users/me', () => HttpResponse.json({ code: 'INTERNAL', message: 'x' }, { status: 500 })))
    const { router } = renderApp('/me/withdraw')
    fireEvent.click(await screen.findByRole('checkbox', { name: '위 내용을 확인했어요' }))
    await waitFor(() => expect(cta().disabled).toBe(false))
    fireEvent.click(cta())
    fireEvent.click(within(await screen.findByRole('alertdialog', { name: '탈퇴할까요?' })).getByRole('button', { name: '탈퇴' }))
    expect(await screen.findByText('잠시 후 다시 시도해 주세요')).toBeTruthy()
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull())
    expect(router.state.location.pathname).toBe('/me/withdraw')
    expect(db.session).toBe('AUTHENTICATED')
  })

  it('재동의 화면에서도 탈퇴할 수 있다(약관 제3조⑤): "탈퇴" → 탈퇴 화면(재동의로 되돌리지 않음) → 탈퇴', async () => {
    db.consentRequired = ['TOS', 'PRIVACY', 'AGE14']
    const { router } = renderApp('/reconsent?required=TOS%2CPRIVACY%2CAGE14')
    fireEvent.click(await screen.findByRole('button', { name: '탈퇴' }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/me/withdraw'))
    expect(await screen.findByRole('heading', { level: 1, name: '탈퇴' })).toBeTruthy()
    // 재동의 대기 중에는 여정 목록을 묻지 않고(서버가 403) 고정 사실 3줄만 — 준용은 그룹장이지만 승계 줄이 없다
    expect(await facts()).toEqual([
      '지갑과 개인·미확정 결제가 삭제돼요',
      '공동 결제와 정산은 ‘탈퇴한 멤버’로 남아요',
      '참여한 여정에서 모두 나가요',
    ])
    expect(screen.queryByText('그룹장은 다음 멤버가 맡아요')).toBeNull()
    fireEvent.click(screen.getByRole('checkbox', { name: '위 내용을 확인했어요' }))
    await waitFor(() => expect(cta().disabled).toBe(false))
    expect(router.state.location.pathname).toBe('/me/withdraw')
    fireEvent.click(cta())
    fireEvent.click(within(await screen.findByRole('alertdialog', { name: '탈퇴할까요?' })).getByRole('button', { name: '탈퇴' }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/login'))
    expect(db.session).toBe('ANONYMOUS')
  })
})

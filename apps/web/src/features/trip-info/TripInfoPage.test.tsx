import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { http } from 'msw'
import { describe, expect, it } from 'vitest'
import { apiFetch } from '../../api'
import { db, findTrip, TRIP, USER } from '../../mocks/data'
import { server } from '../../mocks/server'
import { mockError } from '../../mocks/utils'
import { renderApp } from '../../test/render'
import { makeMeLeader, stubNavigator, toastMessages, setupMockToday } from '../trips/test-utils'

setupMockToday()

const path = (router: ReturnType<typeof renderApp>['router']) => router.state.location.pathname
const button = (name: string) => screen.queryByRole('button', { name })
// 셸의 그룹원 패널(닫힌 dialog)에도 초대코드·인원 글자가 있어 본문(main)으로 좁힌다
const main = () => within(screen.getByRole('main'))
const expirebusan = () => Object.assign(findTrip(TRIP.busan)!, { startDate: '2026-11-01', endDate: '2026-11-02' })

describe('HF-16 시작 전 여정 정보', () => {
  it('그룹장: 출발까지 D-n · 경로 · 메타 · 그룹원 · 초대코드 + 연필 · 「여정 시작」 · 「그룹 삭제」', async () => {
    makeMeLeader(TRIP.busan)
    renderApp('/trips/trip-busan/info')
    expect(await screen.findByText('출발까지')).toBeTruthy()
    expect(screen.getByText('D-44')).toBeTruthy()
    expect(screen.getByRole('img', { name: '출발 전' })).toBeTruthy()
    expect(screen.getByText('12.27 (일)')).toBeTruthy()
    expect(screen.getByText('부산 · 예산 ₩600,000')).toBeTruthy()
    expect(screen.getByRole('heading', { name: '그룹원 3명' })).toBeTruthy()
    expect(main().getByText('B8N-4RT')).toBeTruthy()
    expect(button('여정 정보 수정')).toBeTruthy()
    expect(button('여정 시작')).toBeTruthy()
    expect(button('그룹 삭제')).toBeTruthy()
    // 시작 전에는 프사 줄 「추가」가 없다(HF-16)
    expect(button('추가')).toBeNull()
  })

  it('그룹원 순서: 나 먼저 → 가입 순, 그룹장 왕관', async () => {
    renderApp('/trips/trip-busan/info')
    const list = within(await screen.findByRole('region', { name: '그룹원 3명' })).getAllByRole('listitem')
    expect(list.map((li) => li.textContent)).toEqual(['준용(나)', '민지', '수빈'])
    expect(within(list[1]).getByRole('img', { name: '그룹장' })).toBeTruthy()
  })

  it('멤버: 연필 · 「여정 시작」 · 「그룹 삭제」 없음(초대코드는 있음)', async () => {
    renderApp('/trips/trip-busan/info')
    await screen.findByText('출발까지')
    expect(main().getByText('B8N-4RT')).toBeTruthy()
    expect(button('여정 정보 수정')).toBeNull()
    expect(button('여정 시작')).toBeNull()
    expect(button('그룹 삭제')).toBeNull()
  })

  it('HF-17 「여정 시작」 → 확인 다이얼로그 → 진행 중 + 결제내역 탭', async () => {
    makeMeLeader(TRIP.busan)
    const { router } = renderApp('/trips/trip-busan/info')
    fireEvent.click(await screen.findByRole('button', { name: '여정 시작' }))
    const dialog = await screen.findByRole('alertdialog', { name: '여정을 시작할까요?' })
    expect(within(dialog).getByText('시작 후에는 그룹을 삭제할 수 없어요')).toBeTruthy()

    fireEvent.click(within(dialog).getByRole('button', { name: '시작하기' }))
    await waitFor(() => expect(path(router)).toBe('/trips/trip-busan/payments'))
    expect(findTrip(TRIP.busan)?.status).toBe('ONGOING')
  })

  it('다이얼로그 「취소」면 아무것도 바뀌지 않는다', async () => {
    makeMeLeader(TRIP.busan)
    renderApp('/trips/trip-busan/info')
    fireEvent.click(await screen.findByRole('button', { name: '여정 시작' }))
    fireEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: '취소' }))
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull())
    expect(findTrip(TRIP.busan)?.status).toBe('UPCOMING')
  })

  it('다른 기기에서 이미 시작(409)이면 다이얼로그를 닫고 진행 중으로 다시 그린다', async () => {
    makeMeLeader(TRIP.busan)
    renderApp('/trips/trip-busan/info')
    fireEvent.click(await screen.findByRole('button', { name: '여정 시작' }))
    findTrip(TRIP.busan)!.status = 'ONGOING'
    fireEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: '시작하기' }))
    expect(await screen.findByText('여행 중')).toBeTruthy()
    expect(screen.queryByRole('alertdialog')).toBeNull()
    expect(toastMessages()).toContain('지금 단계에서는 할 수 없어요')
  })

  it('그룹 삭제(Danger) → 진입 라우팅, 여정이 목록에서 사라진다', async () => {
    makeMeLeader(TRIP.busan)
    const { router } = renderApp('/trips/trip-busan/info')
    fireEvent.click(await screen.findByRole('button', { name: '그룹 삭제' }))
    const dialog = await screen.findByRole('alertdialog', { name: '그룹을 삭제할까요?' })
    expect(within(dialog).getByText('모든 멤버에게서 사라져요')).toBeTruthy()
    fireEvent.click(within(dialog).getByRole('button', { name: '삭제' }))

    await waitFor(() => expect(path(router)).toBe('/trips/trip-osaka/payments'))
    expect(findTrip(TRIP.busan)).toBeUndefined()
  })

  it('비그룹장이 시작을 요청하면 서버가 403 NOT_LEADER', async () => {
    await expect(apiFetch(`/trips/${TRIP.busan}/start`, { body: { version: 0 } })).rejects.toMatchObject({
      code: 'NOT_LEADER',
      status: 403,
    })
  })
})

describe('Q-26 종료일이 지난 시작 전 여정', () => {
  it('그룹장: 「여정 시작」 대신 「기간 수정」 → 수정 화면', async () => {
    makeMeLeader(TRIP.busan)
    expirebusan()
    const { router } = renderApp('/trips/trip-busan/info')
    fireEvent.click(await screen.findByRole('button', { name: '기간 수정' }))
    expect(button('여정 시작')).toBeNull()
    await waitFor(() => expect(path(router)).toBe('/trips/trip-busan/edit'))
  })

  it('멤버: 비활성 「여정 시작」(설명 문구 없음)', async () => {
    expirebusan()
    renderApp('/trips/trip-busan/info')
    const start = (await screen.findByRole('button', { name: '여정 시작' })) as HTMLButtonElement
    expect(start.disabled).toBe(true)
    expect(button('기간 수정')).toBeNull()
  })

  it('서버도 시작을 거부한다(409)', async () => {
    makeMeLeader(TRIP.busan)
    expirebusan()
    await expect(apiFetch(`/trips/${TRIP.busan}/start`, { body: { version: 0 } })).rejects.toMatchObject({
      code: 'TRIP_PHASE_INVALID',
      status: 409,
    })
  })
})

describe('HF-23 진행 중 여정 정보', () => {
  it('그룹장: 여행 중 Day 2 / 4 · 그룹원 + 「추가」 · 초대코드 · 「여정 종료하기」 · 연필', async () => {
    renderApp('/trips/trip-osaka/info')
    expect(await screen.findByText('여행 중')).toBeTruthy()
    expect(screen.getByText('Day 2')).toBeTruthy()
    expect(screen.getByText('/ 4')).toBeTruthy()
    expect(screen.getByRole('img', { name: '4일 중 2일차' })).toBeTruthy()
    expect(screen.getByText('일본 오사카 · 예산 ₩1,200,000')).toBeTruthy()
    expect(screen.getByRole('heading', { name: '그룹원 4명' })).toBeTruthy()
    expect(button('추가')).toBeTruthy()
    expect(main().getByText('K7M-2QX')).toBeTruthy()
    expect(button('여정 종료하기')).toBeTruthy()
    expect(button('여정 정보 수정')).toBeTruthy()
    expect(button('여정 시작')).toBeNull()
    expect(button('그룹 삭제')).toBeNull()
  })

  it('멤버: 「여정 종료하기」 · 연필 없음, 「추가」는 있음', async () => {
    db.meUserId = USER.minji
    renderApp('/trips/trip-osaka/info')
    expect(await screen.findByText('여행 중')).toBeTruthy()
    expect(button('추가')).toBeTruthy()
    expect(button('여정 종료하기')).toBeNull()
    expect(button('여정 정보 수정')).toBeNull()
  })

  it('「추가」 → 공유 시트(코드 + 참여 링크), 초대코드 「복사」 → 토스트', async () => {
    const nav = stubNavigator({ share: true })
    renderApp('/trips/trip-osaka/info')
    fireEvent.click(await screen.findByRole('button', { name: '추가' }))
    await waitFor(() => expect(nav.share).toHaveBeenCalledWith(expect.objectContaining({ text: '오사카 3박 4일 초대코드 K7M-2QX' })))
    fireEvent.click(screen.getByRole('button', { name: '초대코드 복사' }))
    await waitFor(() => expect(toastMessages()).toContain('복사했어요'))
  })

  it('HF-24 「여정 종료하기」 → end-preview 미확정 건수 → 종료 → 정산 탭, 미확정은 개인으로', async () => {
    const { router } = renderApp('/trips/trip-osaka/info')
    fireEvent.click(await screen.findByRole('button', { name: '여정 종료하기' }))
    const dialog = await screen.findByRole('alertdialog', { name: '여정을 종료할까요?' })
    expect(within(dialog).getByText('미확정 2건은 개인으로 처리돼요')).toBeTruthy()

    fireEvent.click(within(dialog).getByRole('button', { name: '종료하기' }))
    await waitFor(() => expect(path(router)).toBe('/trips/trip-osaka/settlement'))
    expect(findTrip(TRIP.osaka)?.status).toBe('ENDED')
    expect(db.expenses.filter((e) => e.tripId === TRIP.osaka && e.status === 'PENDING')).toEqual([])
  })

  it('미확정이 없으면 다이얼로그 본문 줄을 생략한다', async () => {
    for (const e of db.expenses) if (e.status === 'PENDING') e.status = 'PERSONAL'
    renderApp('/trips/trip-osaka/info')
    fireEvent.click(await screen.findByRole('button', { name: '여정 종료하기' }))
    const dialog = await screen.findByRole('alertdialog', { name: '여정을 종료할까요?' })
    expect(within(dialog).queryByText(/미확정/)).toBeNull()
  })

  it('종료 요청이 409(이미 종료)면 최신 상태를 받아 정산 탭으로', async () => {
    server.use(http.post('/api/trips/:tripId/end', () => mockError('TRIP_PHASE_INVALID')))
    const { router } = renderApp('/trips/trip-osaka/info')
    fireEvent.click(await screen.findByRole('button', { name: '여정 종료하기' }))
    const dialog = await screen.findByRole('alertdialog')
    findTrip(TRIP.osaka)!.status = 'ENDED'
    fireEvent.click(within(dialog).getByRole('button', { name: '종료하기' }))
    await waitFor(() => expect(path(router)).toBe('/trips/trip-osaka/settlement'))
  })
})

describe('종료 후 여정 정보', () => {
  it('도착한 경로 · 읽기 전용(초대코드 · 추가 · 버튼 · 연필 없음)', async () => {
    renderApp('/trips/trip-jeju/info')
    expect(await screen.findByText('2박 3일')).toBeTruthy()
    expect(screen.getByRole('img', { name: '도착' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: '그룹원 2명' })).toBeTruthy()
    expect(main().queryByText('초대코드')).toBeNull()
    for (const name of ['추가', '여정 정보 수정', '여정 시작', '그룹 삭제', '여정 종료하기']) expect(button(name)).toBeNull()
  })
})

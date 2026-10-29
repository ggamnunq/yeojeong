import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { db, findTrip, TRIP } from '../../mocks/data'
import { renderApp } from '../../test/render'
import { dayButton, makeMeLeader, toastMessages, setupMockToday } from './test-utils'

setupMockToday()

const path = (router: ReturnType<typeof renderApp>['router']) => router.state.location.pathname
const saveButton = () => screen.getByRole('button', { name: '저장' }) as HTMLButtonElement

describe('여정 정보 수정 /trips/:tripId/edit', () => {
  it('진행 중 그룹장: 장소는 고칠 수 있고(v0.5.8) 통화는 잠금, 값이 바뀌어야 저장, 저장하면 여정 정보 + "저장했어요"', async () => {
    const { router } = renderApp('/trips/trip-osaka/edit')
    expect(await screen.findByRole('heading', { name: '여정 수정' })).toBeTruthy()
    expect((screen.getByLabelText('그룹명') as HTMLInputElement).value).toBe('오사카 3박 4일')
    expect((screen.getByLabelText('여행 장소') as HTMLInputElement).value).toBe('오사카')
    expect((screen.getByLabelText('여행 장소') as HTMLInputElement).disabled).toBe(false)
    const currency = screen.getByRole('button', { name: /^현지 통화/ }) as HTMLButtonElement
    expect(currency.disabled).toBe(true)
    await waitFor(() => expect(currency.textContent).toContain('JPY · 일본 엔'))
    expect((screen.getByLabelText('예산') as HTMLInputElement).value).toBe('₩1,200,000')
    expect(saveButton().disabled).toBe(true)

    fireEvent.change(screen.getByLabelText('그룹명'), { target: { value: '오사카 먹방' } })
    fireEvent.click(saveButton())

    await waitFor(() => expect(path(router)).toBe('/trips/trip-osaka/info'))
    expect(toastMessages()).toContain('저장했어요')
    expect(findTrip(TRIP.osaka)).toMatchObject({ groupName: '오사카 먹방', version: 4 })
  })

  it('진행 중이면 기간 시트의 출발일은 잠기고 도착일만 고친다', async () => {
    renderApp('/trips/trip-osaka/edit')
    fireEvent.click(await screen.findByRole('button', { name: /^기간/ }))
    const sheet = await screen.findByRole('dialog', { name: '기간' })
    expect((within(sheet).getByRole('button', { name: /^출발일/ }) as HTMLButtonElement).disabled).toBe(true)
    // 도착일은 오늘(11.13) 이후만
    expect(dayButton(sheet, '2026-11-12').getAttribute('aria-disabled')).toBe('true')
    expect(dayButton(sheet, '2026-11-13').getAttribute('aria-disabled')).toBeNull()
    fireEvent.click(dayButton(sheet, '2026-11-16'))
    fireEvent.click(within(sheet).getByRole('button', { name: '확인' }))
    fireEvent.click(saveButton())
    await waitFor(() => expect(findTrip(TRIP.osaka)?.endDate).toBe('2026-11-16'))
  })

  it('시작 전 그룹장은 장소(자유 입력)·통화도 고친다. 장소만 바꾸면 통화는 그대로', async () => {
    makeMeLeader(TRIP.busan)
    renderApp('/trips/trip-busan/edit')
    fireEvent.change(await screen.findByLabelText('여행 장소'), { target: { value: ' 강릉 ' } })
    fireEvent.click(saveButton())
    await waitFor(() => expect(findTrip(TRIP.busan)?.placeLabel).toBe('강릉'))
    expect(findTrip(TRIP.busan)?.currency).toBe('KRW')
  })

  it('시작 전 통화 변경은 currency만 보낸다', async () => {
    makeMeLeader(TRIP.busan)
    renderApp('/trips/trip-busan/edit')
    fireEvent.click(await screen.findByRole('button', { name: /^현지 통화/ }))
    const sheet = await screen.findByRole('dialog', { name: '현지 통화' })
    fireEvent.click(await within(sheet).findByRole('button', { name: 'JPY · 일본 엔' }))
    fireEvent.click(saveButton())
    await waitFor(() => expect(findTrip(TRIP.busan)?.currency).toBe('JPY'))
    expect(findTrip(TRIP.busan)?.placeLabel).toBe('부산')
  })

  it('다른 곳에서 바뀌었으면(409 VERSION_CONFLICT) 최신 값으로 다시 채우고 안내', async () => {
    const { router } = renderApp('/trips/trip-osaka/edit')
    fireEvent.change(await screen.findByLabelText('그룹명'), { target: { value: '내가 고친 이름' } })
    Object.assign(findTrip(TRIP.osaka)!, { groupName: '민지가 고친 이름', version: 9 })
    fireEvent.click(saveButton())

    await waitFor(() => expect(toastMessages()).toContain('최신 내용으로 바뀌었어요'))
    await waitFor(() => expect((screen.getByLabelText('그룹명') as HTMLInputElement).value).toBe('민지가 고친 이름'))
    expect(path(router)).toBe('/trips/trip-osaka/edit')
  })

  it('멤버·종료된 여정은 들어올 수 없다(여정 정보로)', async () => {
    const member = renderApp('/trips/trip-busan/edit')
    await waitFor(() => expect(path(member.router)).toBe('/trips/trip-busan/info'))
    member.unmount()
    const ended = renderApp('/trips/trip-jeju/edit')
    await waitFor(() => expect(path(ended.router)).toBe('/trips/trip-jeju/info'))
    expect(db.trips.find((t) => t.tripId === TRIP.jeju)?.version).toBe(7)
  })
})

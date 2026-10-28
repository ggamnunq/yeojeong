import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { http } from 'msw'
import { describe, expect, it } from 'vitest'
import { db } from '../../mocks/data'
import { server } from '../../mocks/server'
import { mockError } from '../../mocks/utils'
import { renderApp } from '../../test/render'
import { stubNavigator, toastMessages, setupMockToday } from './test-utils'

setupMockToday()

const path = (router: ReturnType<typeof renderApp>['router']) => router.state.location.pathname
const submitButton = () => screen.getByRole('button', { name: '여정 만들기' }) as HTMLButtonElement

async function fillForm({ start = '2026-11-20', end = '2026-11-23' } = {}) {
  fireEvent.change(await screen.findByLabelText('그룹명'), { target: { value: '오사카 3박 4일' } })

  fireEvent.click(screen.getByRole('button', { name: /^장소/ }))
  const placeSheet = await screen.findByRole('dialog', { name: '장소' })
  fireEvent.click(await within(placeSheet).findByRole('button', { name: /^오사카/ }))
  await waitFor(() => expect(screen.getByRole('button', { name: /^장소/ }).textContent).toContain('일본 오사카'))

  fireEvent.click(screen.getByRole('button', { name: /^기간/ }))
  const periodSheet = await screen.findByRole('dialog', { name: '기간' })
  fireEvent.change(within(periodSheet).getByLabelText('출발일'), { target: { value: start } })
  fireEvent.change(within(periodSheet).getByLabelText('도착일'), { target: { value: end } })
  return periodSheet
}

describe('HF-10 여정 생성 /trips/new', () => {
  it('네 칸이 모두 유효해야 「여정 만들기」가 켜지고, 예산은 "₩1,200,000"으로 보인다', async () => {
    renderApp('/trips/new')
    expect(await screen.findByRole('heading', { name: '새 여정' })).toBeTruthy()
    expect(submitButton().disabled).toBe(true)
    // 처음 들어오면 그룹명에 포커스(HF-10 Focus)
    await waitFor(() => expect(document.activeElement).toBe(screen.getByLabelText('그룹명')))

    const periodSheet = await fillForm()
    fireEvent.click(within(periodSheet).getByRole('button', { name: '확인' }))
    expect(screen.getByRole('button', { name: /^기간/ }).textContent).toContain('2026.11.20 (금) – 2026.11.23 (월)')
    expect(submitButton().disabled).toBe(true)

    const budget = screen.getByLabelText('예산') as HTMLInputElement
    fireEvent.change(budget, { target: { value: '1200000' } })
    expect(budget.value).toBe('₩1,200,000')
    expect(submitButton().disabled).toBe(false)
  })

  it('종료일이 시작일보다 빠르면 기간 시트에 오류, 확인 비활성', async () => {
    renderApp('/trips/new')
    const periodSheet = await fillForm({ start: '2026-11-20', end: '2026-11-18' })
    expect(within(periodSheet).getByText('종료일을 확인해 주세요')).toBeTruthy()
    expect((within(periodSheet).getByRole('button', { name: '확인' }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('만들면 생성 완료(초대코드) → 뒤로 가면 시작 전 여정 정보(생성 폼으로 돌아가지 않음)', async () => {
    const { router } = renderApp('/trips/new')
    const periodSheet = await fillForm()
    fireEvent.click(within(periodSheet).getByRole('button', { name: '확인' }))
    fireEvent.change(screen.getByLabelText('예산'), { target: { value: '1200000' } })
    fireEvent.click(submitButton())

    expect(await screen.findByRole('heading', { name: '여정을 만들었어요' })).toBeTruthy()
    const created = db.trips.at(-1)!
    expect(created).toMatchObject({ groupName: '오사카 3박 4일', currency: 'JPY', status: 'UPCOMING', budgetKrw: 1_200_000 })
    expect(path(router)).toBe(`/trips/${created.tripId}/created`)
    expect(screen.getByText(`${created.inviteCode.slice(0, 3)}-${created.inviteCode.slice(3)}`)).toBeTruthy()

    await router.navigate(-1)
    await waitFor(() => expect(path(router)).toBe(`/trips/${created.tripId}/info`))
    // 만든 사람 = 그룹장: 「여정 시작」
    expect(await screen.findByRole('button', { name: '여정 시작' })).toBeTruthy()
  })

  it('서버 검증 실패는 칸 옆 문구 + 그 칸에 포커스', async () => {
    server.use(
      http.post('/api/trips', () =>
        mockError('VALIDATION_FAILED', 400, { fields: [{ path: 'budgetKrw', code: 'max', message: '예산을 확인해 주세요' }] }),
      ),
    )
    renderApp('/trips/new')
    const periodSheet = await fillForm()
    fireEvent.click(within(periodSheet).getByRole('button', { name: '확인' }))
    fireEvent.change(screen.getByLabelText('예산'), { target: { value: '1200000' } })
    fireEvent.click(submitButton())

    expect(await screen.findByText('예산을 확인해 주세요')).toBeTruthy()
    await waitFor(() => expect(document.activeElement).toBe(screen.getByLabelText('예산')))
    // 고치면 문구가 사라진다
    fireEvent.change(screen.getByLabelText('예산'), { target: { value: '1000000' } })
    expect(screen.queryByText('예산을 확인해 주세요')).toBeNull()
  })
})

describe('HF-11 생성 완료 /trips/:tripId/created', () => {
  it('복사: 클립보드에 "K7M-2QX" + 토스트 "복사했어요"', async () => {
    const nav = stubNavigator()
    renderApp('/trips/trip-osaka/created')
    expect(await screen.findByText('K7M-2QX')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '복사' }))
    await waitFor(() => expect(toastMessages()).toContain('복사했어요'))
    expect(nav.writeText).toHaveBeenCalledWith('K7M-2QX')
  })

  it('공유: Web Share가 있으면 공유 시트(그룹명 + 코드 + 참여 링크)', async () => {
    const nav = stubNavigator({ share: true })
    renderApp('/trips/trip-osaka/created')
    fireEvent.click(await screen.findByRole('button', { name: '공유' }))
    await waitFor(() => expect(nav.share).toHaveBeenCalled())
    expect(nav.share.mock.calls[0][0]).toEqual({
      text: '오사카 3박 4일 초대코드 K7M-2QX',
      url: `${window.location.origin}/join?code=K7M2QX`,
    })
  })

  it('공유: Web Share가 없으면 복사로 대신한다', async () => {
    const nav = stubNavigator({ share: false })
    renderApp('/trips/trip-osaka/created')
    fireEvent.click(await screen.findByRole('button', { name: '공유' }))
    await waitFor(() => expect(toastMessages()).toContain('복사했어요'))
    expect(nav.writeText).toHaveBeenCalledWith('K7M-2QX')
  })

  it('주소로 바로 들어와도 「여정으로 가기」 · ✕는 여정 정보로', async () => {
    const { router } = renderApp('/trips/trip-busan/created')
    fireEvent.click(await screen.findByRole('button', { name: '닫기' }))
    await waitFor(() => expect(path(router)).toBe('/trips/trip-busan/info'))
  })
})

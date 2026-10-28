import { fireEvent, screen, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { db } from '../../mocks/data'
import { renderApp } from '../../test/render'

const leaveAll = () => {
  db.memberships = db.memberships.filter((m) => m.userId !== db.meUserId)
}

describe('HF-09 여정 없음 /trips', () => {
  it('소속 여정이 없으면 제목과 만들기·참여 버튼', async () => {
    leaveAll()
    renderApp('/trips')
    expect(await screen.findByRole('heading', { name: '참여한 여정이 없어요' })).toBeTruthy()
    expect(screen.getByRole('button', { name: '여정 만들기' })).toBeTruthy()
    expect(screen.getByRole('button', { name: '초대코드로 참여' })).toBeTruthy()
    // 셸 Sub(Logo): 지갑·마이
    expect(screen.getByRole('button', { name: '지갑' })).toBeTruthy()
  })

  it('버튼으로 /trips/new · /join', async () => {
    leaveAll()
    const { router } = renderApp('/trips')
    fireEvent.click(await screen.findByRole('button', { name: '여정 만들기' }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/trips/new'))
    await router.navigate('/trips')
    fireEvent.click(await screen.findByRole('button', { name: '초대코드로 참여' }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/join'))
  })

  it('소속 여정이 있으면 진입 라우팅 규칙으로 보낸다', async () => {
    const { router } = renderApp('/trips')
    await waitFor(() => expect(router.state.location.pathname).toBe('/trips/trip-osaka/payments'))
  })
})

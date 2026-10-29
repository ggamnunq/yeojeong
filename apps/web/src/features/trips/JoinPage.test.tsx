import { fireEvent, screen, waitFor } from '@testing-library/react'
import { http } from 'msw'
import { describe, expect, it } from 'vitest'
import { activeMembership, db } from '../../mocks/data'
import { server } from '../../mocks/server'
import { mockError } from '../../mocks/utils'
import { renderApp } from '../../test/render'
import { toastMessages, setupMockToday } from './test-utils'

setupMockToday()

const path = (router: ReturnType<typeof renderApp>['router']) => router.state.location.pathname
const joinButton = () => screen.getByRole('button', { name: '참여하기' }) as HTMLButtonElement
const codeInput = () => screen.getByLabelText('초대코드') as HTMLInputElement

/** 코드 없는 /join을 열고 코드를 친다(C-42: ?code= 링크는 첫 화면 응답 시트로 간다) */
async function openWithCode(code: string) {
  const app = renderApp('/join')
  fireEvent.change(await screen.findByLabelText('초대코드'), { target: { value: code } })
  return app
}

describe('HF-12 초대코드로 참여 /join', () => {
  it('코드를 치면 미리보기: 여정명 · 장소 · 경로 · "3명 참여 중"', async () => {
    await openWithCode('T4K9YP')
    expect(await screen.findByRole('heading', { name: '도쿄 먹방 여행' })).toBeTruthy()
    expect(codeInput().value).toBe('T4K-9YP')
    expect(screen.getByText('도쿄')).toBeTruthy()
    expect(screen.getByText('12.03 (목)')).toBeTruthy()
    expect(screen.getByText('3명 참여 중')).toBeTruthy()
    expect(screen.getByRole('img', { name: '태현, 민지 외 1명' })).toBeTruthy()
    expect(joinButton().disabled).toBe(false)
  })

  it.each([['#code= 링크', '/join#code=t4k-9yp'], ['예전 ?code= 링크', '/join?code=t4k-9yp']])('%s면 입력 화면 없이 코드를 보관하고 첫 화면으로(code 제거) → 응답 시트(C-42 · WF-62)', async (_, url) => {
    const { router } = renderApp(url)
    expect(await screen.findByRole('dialog', { name: '도쿄 먹방 여행에 참여할까요?' })).toBeTruthy()
    expect(router.state.location.search).toBe('')
    expect(router.state.location.hash).toBe('')
    expect(path(router)).toBe('/trips/trip-osaka/payments')
    expect(screen.queryByLabelText('초대코드')).toBeNull()
  })

  it('참여 링크를 붙여 넣으면 코드만 남긴다(#code= · 예전 ?code=)', async () => {
    renderApp('/join')
    const input = await screen.findByLabelText('초대코드')
    fireEvent.change(input, { target: { value: 'https://jinyeojeong.com/join#code=t4k9yp' } })
    expect(codeInput().value).toBe('T4K-9YP')
    fireEvent.change(input, { target: { value: 'https://jinyeojeong.com/join?code=d7n3qa' } })
    expect(codeInput().value).toBe('D7N-3QA')
  })

  it('6자 미만이면 카드 없이 비활성, 입력은 대문자 + 3-3 하이픈', async () => {
    renderApp('/join')
    // 헤더 제목(HF-12 · TopHeader Back h1)
    expect(await screen.findByRole('heading', { level: 1, name: '초대코드로 참여' })).toBeTruthy()
    fireEvent.change(await screen.findByLabelText('초대코드'), { target: { value: 't4k9' } })
    expect(codeInput().value).toBe('T4K-9')
    expect(joinButton().disabled).toBe(true)
    expect(screen.queryByRole('region', { name: '여정 미리보기' })).toBeNull()
  })

  it('시작 전 여정에 참여하면 4번째 멤버로 여정 정보(시작·삭제 버튼 없음)', async () => {
    const { router } = renderApp('/join')
    fireEvent.change(await screen.findByLabelText('초대코드'), { target: { value: 't4k-9yp' } })
    await screen.findByRole('heading', { name: '도쿄 먹방 여행' })
    fireEvent.click(joinButton())
    await waitFor(() => expect(path(router)).toBe('/trips/trip-tokyo/info'))
    expect(activeMembership('trip-tokyo', db.meUserId)).toMatchObject({ role: 'MEMBER', joinOrder: 4 })
    expect(await screen.findByRole('heading', { name: '그룹원 4명' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: '여정 시작' })).toBeNull()
    expect(screen.queryByRole('button', { name: '그룹 삭제' })).toBeNull()
  })

  it('진행 중 여정에 참여하면 결제내역', async () => {
    const { router } = await openWithCode('D7N3QA')
    await screen.findByRole('heading', { name: '다낭 가족여행' })
    fireEvent.click(joinButton())
    await waitFor(() => expect(path(router)).toBe('/trips/trip-danang/payments'))
  })

  it('이미 멤버인 여정이면 그 여정으로 + "이미 참여한 여정이에요"', async () => {
    const { router } = await openWithCode('K7M2QX')
    await screen.findByRole('heading', { name: '오사카 3박 4일' })
    fireEvent.click(joinButton())
    await waitFor(() => expect(path(router)).toBe('/trips/trip-osaka/payments'))
    expect(toastMessages()).toContain('이미 참여한 여정이에요')
  })

  it.each([
    ['없는 코드(404 INVITE_CODE_INVALID)', 'ABCDEF', '초대코드를 다시 확인해 주세요'],
    ['종료된 여정(409 INVITE_TRIP_ENDED)', 'J3W9PZ', '참여할 수 없는 여정이에요'],
    ['강퇴 이력(403 MEMBER_KICKED)', 'X2P8RW', '참여할 수 없는 여정이에요'],
  ])('%s → 입력란 오류 문구, 버튼 비활성', async (_case, code, message) => {
    await openWithCode(code)
    expect(await screen.findByText(message)).toBeTruthy()
    expect(codeInput().getAttribute('aria-invalid')).toBe('true')
    expect(joinButton().disabled).toBe(true)
    expect(toastMessages()).toEqual([])
  })

  it('쓸 수 없는 글자(0·O·1·I·L)가 든 6자는 조회하지 않고 오류', async () => {
    renderApp('/join')
    fireEvent.change(await screen.findByLabelText('초대코드'), { target: { value: 'K7M2Q0' } })
    expect(screen.getByText('초대코드를 다시 확인해 주세요')).toBeTruthy()
  })

  it('참여 요청이 인원 한도(409 MEMBER_LIMIT_EXCEEDED)면 입력란 문구', async () => {
    server.use(http.post('/api/invites/join', () => mockError('MEMBER_LIMIT_EXCEEDED')))
    await openWithCode('T4K9YP')
    await screen.findByRole('heading', { name: '도쿄 먹방 여행' })
    fireEvent.click(joinButton())
    expect(await screen.findByText('참여할 수 없는 여정이에요')).toBeTruthy()
  })
})

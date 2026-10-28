import { configure, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { db, findTrip, TRIP } from '../../../mocks/data'
import { renderApp } from '../../../test/render'
import { expireConnections, walletMock } from '../mocks'

// 전체 실행 때 lazy 화면·목 응답이 늦을 수 있어 기다림을 늘린다
configure({ asyncUtilTimeout: 3000 })
vi.setConfig({ testTimeout: 15_000 })

const methodNames = () => screen.getAllByRole('listitem').map((li) => li.textContent)

describe('지갑(HF-27)', () => {
  it('연결된 계좌·카드, 마지막 동기화 시각, 추가 행, 지금 여정 환율 카드', async () => {
    renderApp('/wallet')
    expect(await screen.findByRole('heading', { name: '지갑' })).toBeTruthy()
    await screen.findByText('토스뱅크 통장')
    expect(methodNames()).toEqual([
      // 계좌는 앞 4·끝 3자리, 카드는 끝 4자리만
      '토스뱅크 통장1000-****-***-321',
      '토스뱅크 체크카드**** **** **** 1934',
      '신한카드 Deep Dream**** **** **** 1102',
    ])
    expect(screen.getByText('18:32 동기화')).toBeTruthy()
    expect(screen.getByRole('button', { name: '계좌·카드 추가' })).toBeTruthy()
    const fx = await screen.findByRole('link', { name: /100엔 = 919.20원/ })
    expect(fx.getAttribute('href')).toBe(`/trips/${TRIP.osaka}/fx`)
    expect(within(fx).getByText('하나은행 매매기준율 · 18:00')).toBeTruthy()
  })

  it('KRW 여정이 지금 여정이면 환율 섹션이 없다', async () => {
    localStorage.setItem('yj:lastTripId', TRIP.busan)
    db.lastViewedTripId = TRIP.busan
    renderApp('/wallet')
    await screen.findByText('토스뱅크 통장')
    await waitFor(() => expect(screen.queryByRole('heading', { name: '환율' })).toBeNull())
  })

  it('새로고침 → 동기화 시각이 바뀐다(FR-402)', async () => {
    renderApp('/wallet')
    await screen.findByText('18:32 동기화')
    fireEvent.click(await screen.findByRole('button', { name: '동기화' }))
    await waitFor(() => expect(screen.queryByText('18:32 동기화')).toBeNull())
    expect(screen.getByText(/^\d{2}:\d{2} 동기화$/)).toBeTruthy()
  })

  it('진행 중 여정이 없으면 새로고침을 숨긴다(동기화 대상이 아니다)', async () => {
    findTrip(TRIP.osaka)!.status = 'ENDED'
    renderApp('/wallet')
    expect(await screen.findByText('18:32 동기화')).toBeTruthy()
    await waitFor(() => expect(screen.queryByRole('button', { name: '동기화' })).toBeNull())
  })

  it('연결 0개면 빈 상태와 추가 행, 동기화 시각은 없다', async () => {
    for (const p of db.paymentMethods) if (p.userId === db.meUserId) p.status = 'REMOVED'
    walletMock().connections = []
    renderApp('/wallet')
    expect(await screen.findByText('연결된 계좌·카드가 없어요')).toBeTruthy()
    expect(screen.getByRole('button', { name: '계좌·카드 추가' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: '동기화' })).toBeNull()
  })

  it('⋯ → 연결 해제 → 확인 → 목록에서 사라지고 토스트', async () => {
    renderApp('/wallet')
    fireEvent.click(await screen.findByRole('button', { name: '신한카드 Deep Dream 더 보기' }))
    fireEvent.click(await screen.findByRole('button', { name: '연결 해제' }))
    const dialog = await screen.findByRole('alertdialog', { name: '연결을 해제할까요?' })
    expect(within(dialog).queryByRole('checkbox', { name: '불러온 결제도 지우기' })).toBeNull()
    fireEvent.click(within(dialog).getByRole('button', { name: '해제' }))
    expect(await screen.findByText('연결을 해제했어요')).toBeTruthy()
    await waitFor(() => expect(screen.queryByText('신한카드 Deep Dream')).toBeNull())
  })

  it('연결의 마지막 결제수단이면 "불러온 결제도 지우기" 선택지가 있다', async () => {
    for (const p of db.paymentMethods) if (p.id !== 'pm-shinhan' && p.userId === db.meUserId) p.status = 'REMOVED'
    renderApp('/wallet')
    fireEvent.click(await screen.findByRole('button', { name: '신한카드 Deep Dream 더 보기' }))
    fireEvent.click(await screen.findByRole('button', { name: '연결 해제' }))
    const dialog = await screen.findByRole('alertdialog', { name: '연결을 해제할까요?' })
    expect(within(dialog).getByRole('checkbox', { name: '불러온 결제도 지우기' })).toBeTruthy()
  })
})

describe('지갑 · 연결 만료(HF-42)', () => {
  it('맨 위 "토스 연결 만료 · 다시 연결", 마지막 성공 시각, 새로고침·추가 없음, 행은 흐리게', async () => {
    expireConnections()
    renderApp('/wallet')
    expect(await screen.findByRole('button', { name: /토스 연결 만료.*다시 연결/ })).toBeTruthy()
    expect(screen.getByText('09:12 동기화')).toBeTruthy()
    expect(screen.queryByRole('button', { name: '동기화' })).toBeNull()
    expect(screen.queryByRole('button', { name: '계좌·카드 추가' })).toBeNull()
    expect(screen.queryByRole('button', { name: /더 보기/ })).toBeNull()
    expect(screen.getByText('토스뱅크 통장').closest('.opacity-40')).toBeTruthy()
  })
})

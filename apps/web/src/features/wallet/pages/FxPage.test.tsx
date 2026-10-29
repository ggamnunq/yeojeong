import { configure, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { db, findTrip, TRIP, USER } from '../../../mocks/data'
import { renderApp } from '../../../test/render'
import { walletMock } from '../mocks'

// 전체 실행 때 lazy 화면·목 응답이 늦을 수 있어 기다림을 늘린다
configure({ asyncUtilTimeout: 3000 })
vi.setConfig({ testTimeout: 15_000 })

const radio = (name: string) => screen.getByRole('radio', { name }) as HTMLInputElement

describe('환율(HF-29)', () => {
  it('통화쌍 · 고시 단위 환율 · 출처와 갱신 시각 · 적용 환율 3개(현재 선택 체크)', async () => {
    renderApp(`/trips/${TRIP.osaka}/fx`)
    expect(await screen.findByRole('heading', { name: '환율' })).toBeTruthy()
    expect(await screen.findByText('JPY → KRW')).toBeTruthy()
    expect(screen.getByText('919.20')).toBeTruthy()
    expect(screen.getByText('100엔 =', { exact: false })).toBeTruthy()
    expect(screen.getByText('하나은행 매매기준율 · 18:00 갱신')).toBeTruthy()
    expect(screen.getByText('그룹장 전용')).toBeTruthy()
    const group = screen.getByRole('radiogroup', { name: '적용 환율' })
    expect(within(group).getAllByRole('radio')).toHaveLength(3)
    expect(radio('결제 시점 매매기준율').checked).toBe(true)
    expect(screen.getByRole('button', { name: '새로고침' })).toBeTruthy()
  })

  it('출처 링크가 필요한 고시(ExchangeRate-API)는 출처를 링크로 단다', async () => {
    findTrip(TRIP.osaka)!.currency = 'TWD'
    renderApp(`/trips/${TRIP.osaka}/fx`)
    expect(await screen.findByText('TWD → KRW')).toBeTruthy()
    const link = screen.getByRole('link', { name: 'Rates By Exchange Rate API' }) as HTMLAnchorElement
    expect(link.href).toBe('https://www.exchangerate-api.com/')
    expect(link.target).toBe('_blank')
  })

  it('그룹장이 고르면 바로 저장하고 "새 환율로 다시 계산했어요"', async () => {
    renderApp(`/trips/${TRIP.osaka}/fx`)
    await screen.findByText('JPY → KRW')
    fireEvent.click(radio('카드사 청구 환율'))
    expect(await screen.findByText('새 환율로 다시 계산했어요')).toBeTruthy()
    await waitFor(() => expect(radio('카드사 청구 환율').checked).toBe(true))
    expect(findTrip(TRIP.osaka)?.fxPolicy).toBe('CARD_BILLED')
  })

  it('고정 환율: 고르면 입력란이 펼쳐지고, 값을 넣고 완료하면 저장한다', async () => {
    renderApp(`/trips/${TRIP.osaka}/fx`)
    await screen.findByText('JPY → KRW')
    fireEvent.click(radio('고정 환율 직접 입력'))
    const input = screen.getByRole('textbox', { name: '100엔당' }) as HTMLInputElement
    expect(findTrip(TRIP.osaka)?.fxPolicy).toBe('SPOT_AT_PAYMENT')
    fireEvent.change(input, { target: { value: '900' } })
    fireEvent.submit(input.closest('form')!)
    expect(await screen.findByText('새 환율로 다시 계산했어요')).toBeTruthy()
    expect(findTrip(TRIP.osaka)?.fxPolicy).toBe('FIXED')
    expect(walletMock().fixedRates[TRIP.osaka]).toBe('900.00')
  })

  it('멤버는 라디오가 비활성이고 바꿀 수 없다(그룹장 전용)', async () => {
    db.meUserId = USER.minji
    renderApp(`/trips/${TRIP.osaka}/fx`)
    await screen.findByText('JPY → KRW')
    expect(radio('결제 시점 매매기준율').checked).toBe(true)
    for (const name of ['결제 시점 매매기준율', '카드사 청구 환율', '고정 환율 직접 입력']) expect(radio(name).disabled).toBe(true)
  })

  it('종료된 여정은 그룹장도 바꿀 수 없다', async () => {
    findTrip(TRIP.osaka)!.status = 'ENDED'
    renderApp(`/trips/${TRIP.osaka}/fx`)
    await screen.findByText('JPY → KRW')
    expect(radio('카드사 청구 환율').disabled).toBe(true)
  })

  it('KRW 여정은 여정 정보로 보낸다(환율 행이 없다, HF-23)', async () => {
    const { router } = renderApp(`/trips/${TRIP.busan}/fx`)
    await waitFor(() => expect(router.state.location.pathname).toBe(`/trips/${TRIP.busan}/info`))
  })
})

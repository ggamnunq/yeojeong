import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { CardHeroTone } from './HeroTone'

describe('CardHeroTone', () => {
  it('라벨 → 영웅 숫자 → 경로 → 메타, action은 이름 붙은 아이콘 버튼', () => {
    const onClick = vi.fn()
    render(
      <CardHeroTone
        label="출발까지"
        hero="D-15"
        action={{ label: '여정 정보 수정', onClick }}
        route={{ phase: 'upcoming', start: '11.12 (목)', end: '11.15 (일)' }}
        meta="일본 오사카 · 3박 4일"
      />,
    )
    expect(screen.getByText('D-15').className).toContain('text-amount-xl')
    expect(screen.getByRole('img', { name: '출발 전' })).toBeTruthy()
    expect(screen.getByText('일본 오사카 · 3박 4일')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '여정 정보 수정' }))
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('불리언 off(action · sub · route · meta 없음)면 라벨과 숫자만, headingLevel이면 section + 제목', () => {
    render(<CardHeroTone headingLevel={3} label="총 공동 지출" hero="₩826,910" />)
    expect(screen.queryByRole('button')).toBeNull()
    expect(screen.queryByRole('img')).toBeNull()
    expect(screen.getByRole('heading', { level: 3, name: '총 공동 지출' })).toBeTruthy()
    expect(screen.getByRole('region', { name: '총 공동 지출' })).toBeTruthy()
  })

  it('action.text면 아이콘 대신 텍스트 버튼(Ghost S) — 보이는 글자 + 접근성 이름', () => {
    const onClick = vi.fn()
    render(<CardHeroTone label="여행 중" hero="Day 2" action={{ label: '여정 정보 수정', text: '수정', onClick }} />)
    const button = screen.getByRole('button', { name: '여정 정보 수정' })
    expect(button.textContent).toBe('수정')
    expect(button.querySelector('svg')).toBeNull()
    fireEvent.click(button)
    expect(onClick).toHaveBeenCalledTimes(1)
  })
})

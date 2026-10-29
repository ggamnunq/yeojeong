import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { RowAccount } from './Account'
import { RowAdd } from './Add'
import { LeaderCrown, RowMember } from './Member'
import { RowMemberAmount } from './MemberAmount'
import { RowOption } from './Option'

const ME = { name: '준용', me: true, joinOrder: 0 }
const MINJI = { name: '민지', joinOrder: 1 }

describe('RowMemberAmount', () => {
  it('숫자 금액은 ₩ 형식, 나는 "나" 배지 + 프사 Me 테두리', () => {
    const { container } = render(<RowMemberAmount person={ME} amount={94770} />)
    expect(screen.getByText('₩94,770')).toBeTruthy()
    expect(screen.getByText('나')).toBeTruthy()
    expect(container.querySelector('.border-focus')).toBeTruthy()
  })

  it('다른 통화·문구는 그대로, 나간 멤버는 「나간 멤버」 태그(spec C-08)', () => {
    render(<RowMemberAmount person={{ ...MINJI, left: true }} amount="¥12,800" />)
    expect(screen.getByText('¥12,800')).toBeTruthy()
    expect(screen.getByText('나간 멤버')).toBeTruthy()
    expect(screen.queryByText('나')).toBeNull()
  })
})

describe('RowMember', () => {
  it('그룹장은 왕관(이름 "그룹장"), 나는 "나" 배지', () => {
    render(<RowMember person={ME} leader />)
    expect(screen.getByRole('img', { name: '그룹장' })).toBeTruthy()
    expect(screen.getByText('나')).toBeTruthy()
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('왕관은 이름 앞, 채운 왕관 icon/subtle(warning 아님), 강퇴는 Body/S + text/error (DS17 · B-20)', () => {
    render(<RowMember person={MINJI} leader kick={{}} />)
    const crown = screen.getByRole('img', { name: '그룹장' })
    const name = screen.getByText('민지')
    expect(crown.compareDocumentPosition(name) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(crown.getAttribute('class')).toContain('text-icon-subtle')
    expect(crown.getAttribute('class')).not.toContain('warning')
    expect(crown.getAttribute('fill')).toBe('currentColor')
    const kick = screen.getByRole('button', { name: '민지 강퇴' })
    expect(kick.className).toContain('text-body-s')
    expect(kick.className).not.toContain('text-label-m')
    expect(kick.className).toContain('text-error')
  })

  it('LeaderCrown은 RowMember 왕관과 같은 모양(패널 밖에서도 같은 표기)', () => {
    const { container } = render(<LeaderCrown />)
    const crown = container.querySelector('svg') as SVGElement
    expect(crown.getAttribute('aria-label')).toBe('그룹장')
    expect(crown.getAttribute('width')).toBe('14')
    expect(crown.getAttribute('class')).toContain('text-icon-subtle')
  })

  it('kick을 주면 그 사람 이름이 붙은 "강퇴" 버튼', () => {
    const onClick = vi.fn()
    render(<RowMember person={MINJI} kick={{ onClick }} />)
    const kick = screen.getByRole('button', { name: '민지 강퇴' })
    expect(kick.textContent).toBe('강퇴')
    fireEvent.click(kick)
    expect(onClick).toHaveBeenCalledTimes(1)
  })
})

describe('RowAccount · RowAdd', () => {
  it('계좌 행은 누르지 않고 more만 버튼이다. more={false}면 버튼이 없다', () => {
    const onMoreClick = vi.fn()
    const { rerender } = render(
      <RowAccount name="하나은행 입출금" masked="입출금 · 1102" moreLabel="하나은행 입출금 더 보기" onMoreClick={onMoreClick} />,
    )
    expect(screen.getByText('입출금 · 1102')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '하나은행 입출금 더 보기' }))
    expect(onMoreClick).toHaveBeenCalledTimes(1)
    rerender(<RowAccount type="card" name="신한카드" masked="체크 · 1934" more={false} />)
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('추가 행은 라벨이 이름인 버튼', () => {
    const onClick = vi.fn()
    render(<RowAdd label="계좌·카드 추가" onClick={onClick} />)
    fireEvent.click(screen.getByRole('button', { name: '계좌·카드 추가' }))
    expect(onClick).toHaveBeenCalledTimes(1)
  })
})

describe('RowOption', () => {
  it('진짜 라디오: 제목이 이름, selected = checked, 누르면 onChange', () => {
    const onChange = vi.fn()
    render(<RowOption name="add" value="toss" title="토스로 불러오기" subtitle="은행·카드를 한 번에 연결" selected={false} onChange={onChange} />)
    const radio = screen.getByRole('radio', { name: /토스로 불러오기/ })
    expect((radio as HTMLInputElement).checked).toBe(false)
    fireEvent.click(radio)
    expect(onChange).toHaveBeenCalledTimes(1)
  })

  it('logo={false}(v1.6.3 · HF-48b)면 원 아이콘 없이 제목·부제만', () => {
    const { container } = render(
      <RowOption name="trip" value="osaka" logo={false} title="오사카 3박 4일" subtitle="진행 중 · 11.12 – 11.15" selected readOnly />,
    )
    expect(container.querySelector('.size-10')).toBeNull()
    expect(screen.getByRole('radio', { name: /오사카 3박 4일/ })).toBeTruthy()
  })
})


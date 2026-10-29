import { fireEvent, render, screen } from '@testing-library/react'
import { createRef } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { Input } from './Input'

describe('Input', () => {
  it('라벨이 입력창에 연결된다', () => {
    render(<Input label="그룹명" placeholder="예) 오사카 우정여행" />)
    const input = screen.getByLabelText('그룹명')
    expect(input.tagName).toBe('INPUT')
    expect(input.getAttribute('placeholder')).toBe('예) 오사카 우정여행')
  })

  it('helper는 aria-describedby로 읽힌다', () => {
    render(<Input label="그룹명" helper="여정 목록에 보이는 이름이에요" />)
    const input = screen.getByLabelText('그룹명')
    const id = input.getAttribute('aria-describedby')
    expect(id && document.getElementById(id)?.textContent).toBe('여정 목록에 보이는 이름이에요')
    expect(input.getAttribute('aria-invalid')).toBeNull()
  })

  it('error면 aria-invalid가 켜지고 오류 문구가 연결된다', () => {
    render(<Input label="그룹명" error helper="그룹명을 입력해 주세요" />)
    const input = screen.getByLabelText('그룹명')
    expect(input.getAttribute('aria-invalid')).toBe('true')
    expect(screen.getByText('그룹명을 입력해 주세요').id).toBe(input.getAttribute('aria-describedby'))
  })

  it('disabled면 입력할 수 없다', () => {
    render(<Input label="그룹명" disabled />)
    expect((screen.getByLabelText('그룹명') as HTMLInputElement).disabled).toBe(true)
  })

  it('입력값이 있으면 지우기 버튼이 onClear를 부른다', () => {
    const onClear = vi.fn()
    const { rerender } = render(<Input label="그룹명" value="오사카" onChange={() => {}} onClear={onClear} />)
    fireEvent.click(screen.getByRole('button', { name: '입력 지우기' }))
    expect(onClear).toHaveBeenCalledTimes(1)
    rerender(<Input label="그룹명" value="" onChange={() => {}} onClear={onClear} />)
    expect(screen.queryByRole('button', { name: '입력 지우기' })).toBeNull()
  })

  it('size="l"은 필드 60 · 값 H3, 기본(m)은 52 · Body/L', () => {
    const { rerender } = render(<Input label="닉네임" size="l" />)
    const input = screen.getByLabelText('닉네임')
    expect(input.className).toContain('text-h3')
    expect(input.parentElement?.className).toContain('h-15')
    rerender(<Input label="닉네임" />)
    expect(screen.getByLabelText('닉네임').className).toContain('text-body-l')
    expect(screen.getByLabelText('닉네임').parentElement?.className).toContain('h-13')
  })

  it('labelVisible={false}면 라벨은 화면에서 숨지만 접근성 이름으로 남는다 · ref가 input에 닿는다', () => {
    const ref = createRef<HTMLInputElement>()
    render(<Input label="닉네임" labelVisible={false} ref={ref} />)
    const input = screen.getByLabelText('닉네임')
    expect(screen.getByText('닉네임').className).toContain('sr-only')
    expect(ref.current).toBe(input)
  })

  it('suffix(v1.6)는 값 오른쪽 단위 "원"(text/secondary)이고 입력의 설명으로 읽힌다', () => {
    render(<Input label="예산" defaultValue="1,200,000" suffix error helper="1원 이상 입력해 주세요" />)
    const input = screen.getByLabelText('예산')
    const suffix = screen.getByText('원')
    expect(suffix.className).toContain('text-secondary')
    expect(input.getAttribute('aria-describedby')).toBe(`${suffix.id} ${screen.getByText('1원 이상 입력해 주세요').id}`)
  })

  it('trailingIcon(v1.6)은 오른쪽 장식 아이콘 슬롯(기본 calendar), 없으면 그리지 않는다', () => {
    const { container, rerender } = render(<Input label="장소" />)
    expect(container.querySelectorAll('svg')).toHaveLength(0)
    rerender(<Input label="장소" trailingIcon icon="marker" />)
    const icon = container.querySelector('svg')!
    expect(icon.getAttribute('aria-hidden')).toBe('true')
    expect(icon.getAttribute('class')).toContain('text-icon-subtle')
  })
})

describe('Input Type=Password (v1.7)', () => {
  it('가려서 시작하고, 보기 토글(aria-pressed)로 type password ↔ text · eye ↔ eye-off', () => {
    render(<Input type="password" label="비밀번호" defaultValue="secret12" />)
    const input = screen.getByLabelText('비밀번호') as HTMLInputElement
    const toggle = screen.getByRole('button', { name: '비밀번호 보기' })
    expect(input.type).toBe('password')
    expect(toggle.getAttribute('aria-pressed')).toBe('false')
    expect(toggle.getAttribute('aria-controls')).toBe(input.id)
    expect(toggle.querySelector('.lucide-eye')).toBeTruthy()
    fireEvent.click(toggle)
    expect(input.type).toBe('text')
    expect(toggle.getAttribute('aria-pressed')).toBe('true')
    expect(toggle.querySelector('.lucide-eye-off')).toBeTruthy()
    fireEvent.click(toggle)
    expect(input.type).toBe('password')
  })

  it('Error·onClear여도 경고 아이콘·✕ 대신 토글만 있다', () => {
    const { container } = render(<Input type="password" label="비밀번호" value="x" onChange={() => {}} onClear={() => {}} error helper="맞지 않아요" />)
    expect(screen.getByRole('button', { name: '비밀번호 보기' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: '입력 지우기' })).toBeNull()
    expect(container.querySelector('.lucide-triangle-alert')).toBeNull()
    expect(screen.getByLabelText('비밀번호').getAttribute('aria-invalid')).toBe('true')
  })

  it('Disabled면 토글도 꺼지고 icon/disabled', () => {
    render(<Input type="password" label="비밀번호" disabled revealLabel="비밀번호 표시" />)
    const toggle = screen.getByRole('button', { name: '비밀번호 표시' }) as HTMLButtonElement
    expect(toggle.disabled).toBe(true)
    expect(toggle.className).toContain('text-icon-disabled')
  })

  it('password가 아니면 토글이 없다', () => {
    render(<Input label="이메일" type="email" />)
    expect(screen.queryByRole('button', { name: '비밀번호 보기' })).toBeNull()
    expect((screen.getByLabelText('이메일') as HTMLInputElement).type).toBe('email')
  })
})

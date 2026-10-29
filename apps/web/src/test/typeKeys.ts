import { act, fireEvent } from '@testing-library/react'

/**
 * 키보드로 한 글자씩 치는 것처럼 입력한다(user-event 없이). 글자마다 keydown → (선택 영역을 그 글자로 바꾼) change → keyup이고,
 * 매번 "지금 포커스가 있는 칸"에 친다 — 입력 중에 화면이 포커스를 옮기면(시 2자리 → 분) 다음 글자는 옮겨 간 칸으로 간다.
 * maxLength를 넘는 글자는 브라우저처럼 무시한다. 처음 칸에 포커스가 없으면 먼저 focus한다(onFocus 전체 선택 포함).
 */
export function typeKeys(start: HTMLInputElement, text: string) {
  if (document.activeElement !== start) act(() => start.focus())
  for (const key of text) {
    const target = document.activeElement
    if (!(target instanceof HTMLInputElement)) throw new Error(`typeKeys: "${key}"를 칠 입력 칸에 포커스가 없다`)
    fireEvent.keyDown(target, { key })
    const from = target.selectionStart ?? target.value.length
    const to = target.selectionEnd ?? from
    const next = `${target.value.slice(0, from)}${key}${target.value.slice(to)}`
    if (target.maxLength < 0 || next.length <= target.maxLength) fireEvent.change(target, { target: { value: next } })
    fireEvent.keyUp(target, { key })
  }
}

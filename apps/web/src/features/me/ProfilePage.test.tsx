import { configure, fireEvent, screen, waitFor } from '@testing-library/react'
import { http } from 'msw'
import { describe, expect, it, vi } from 'vitest'
import { db, findUser, USER } from '../../mocks/data'
import { server } from '../../mocks/server'
import { mockError } from '../../mocks/utils'
import { renderApp } from '../../test/render'
import { toastMessages } from '../trips/test-utils'

configure({ asyncUtilTimeout: 3000 })
vi.setConfig({ testTimeout: 15_000 })

const path = (router: ReturnType<typeof renderApp>['router']) => router.state.location.pathname
const nicknameInput = () => screen.findByRole('textbox', { name: '닉네임' }) as Promise<HTMLInputElement>
const saveButton = () => screen.getByRole('button', { name: '저장' }) as HTMLButtonElement

describe('내 정보(HF-63) 닉네임 변경', () => {
  it('마이페이지 프로필 「수정」 → 내 정보: 프사(읽기 전용) · 카카오 안내 · 지금 닉네임 · 「저장」 비활성', async () => {
    const { router } = renderApp('/me')
    const edit = await screen.findByRole('button', { name: '내 정보 수정' })
    expect(edit.textContent).toBe('수정')
    fireEvent.click(edit)
    await waitFor(() => expect(path(router)).toBe('/me/profile'))
    expect(await screen.findByRole('heading', { level: 1, name: '내 정보' })).toBeTruthy()
    expect(screen.getByRole('img', { name: '프로필 사진' })).toBeTruthy()
    expect(screen.getByText('프로필 사진은 카카오에서 바꿀 수 있어요')).toBeTruthy()
    expect((await nicknameInput()).value).toBe('준용')
    // 카운터·헬퍼는 숨긴다(HF-63)
    expect(screen.queryByText(/중복 가능/)).toBeNull()
    expect(saveButton().disabled).toBe(true)
  })

  it('바뀌고 규칙에 맞을 때만 「저장」: 빈 값 · 같은 값(앞뒤 공백 포함)은 비활성, 10자를 넘으면 자른다', async () => {
    renderApp('/me/profile')
    const input = await nicknameInput()
    fireEvent.change(input, { target: { value: '   ' } })
    expect(saveButton().disabled).toBe(true)
    fireEvent.change(input, { target: { value: ' 준용 ' } })
    expect(saveButton().disabled).toBe(true)
    fireEvent.change(input, { target: { value: '가나다라마바사아자차카' } })
    expect(input.value).toBe('가나다라마바사아자차')
    expect(saveButton().disabled).toBe(false)
  })

  it('저장 → 마이페이지로 돌아가 새 닉네임 + 토스트, 다른 사용자는 그대로(중복 허용)', async () => {
    const { router } = renderApp('/me')
    fireEvent.click(await screen.findByRole('button', { name: '내 정보 수정' }))
    const input = await nicknameInput()
    fireEvent.change(input, { target: { value: ' 민지 ' } })
    fireEvent.click(saveButton())
    await waitFor(() => expect(path(router)).toBe('/me'))
    expect(await screen.findByRole('heading', { name: '민지' })).toBeTruthy()
    expect(toastMessages()).toContain('닉네임을 바꿨어요')
    expect(findUser(USER.junyong)?.nickname).toBe('민지')
    expect(findUser(USER.minji)?.nickname).toBe('민지')
  })

  it('저장한 닉네임이 그룹원 목록에도 바로 보인다', async () => {
    const { router } = renderApp('/me/profile')
    fireEvent.change(await nicknameInput(), { target: { value: '준용이' } })
    fireEvent.click(saveButton())
    // 주소로 바로 열었으면 마이페이지로 바꾼다
    await waitFor(() => expect(path(router)).toBe('/me'))
    await router.navigate('/trips/trip-osaka/info')
    const members = await screen.findByRole('region', { name: '그룹원 4명' })
    expect(members.textContent).toContain('준용이')
  })

  it('서버 검증 오류는 입력 아래에 보이고 화면에 남는다', async () => {
    server.use(
      http.patch('/api/users/me', () =>
        mockError('VALIDATION_FAILED', 400, {
          fields: [{ path: 'nickname', code: 'INVALID_CHARACTER', message: '닉네임에 쓸 수 없는 문자가 있어요' }],
        }),
      ),
    )
    const { router } = renderApp('/me/profile')
    fireEvent.change(await nicknameInput(), { target: { value: '준용이' } })
    fireEvent.click(saveButton())
    expect(await screen.findByText('닉네임에 쓸 수 없는 문자가 있어요')).toBeTruthy()
    expect(path(router)).toBe('/me/profile')
    expect(db.users.find((u) => u.id === USER.junyong)?.nickname).toBe('준용')
  })
})

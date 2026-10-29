import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  activeInvite,
  captureInviteLink,
  clearPendingInvite,
  forgetInvites,
  hasPendingInvite,
  inviteCodeInLocation,
  inviteCodeFromLink,
  isInviteLandingPath,
  PENDING_INVITE_TTL_MS,
  rememberPendingInvite,
  takePendingInvite,
} from './pendingInvite'

const KEY = 'yj:invite:pending'
const NOW = Date.parse('2026-11-13T18:34:00+09:00')

afterEach(() => {
  sessionStorage.clear()
  activeInvite.clear()
})

/** captureInviteLink에 넘길 주소·기록 대역 */
function at(url: string) {
  const { pathname, search, hash } = new URL(url, 'https://jinyeojeong.com')
  const history = { state: null, replaceState: vi.fn() }
  return { location: { pathname, search, hash }, history }
}

describe('참여 링크 코드 파싱', () => {
  it('대문자 영숫자만 남기고 길이를 자른다(형식 검사는 꺼낼 때)', () => {
    expect(inviteCodeFromLink('k7m-2qx')).toBe('K7M2QX')
    expect(inviteCodeFromLink(' K7M 2QX ')).toBe('K7M2QX')
    expect(inviteCodeFromLink('<script>')).toBe('SCRIPT')
    expect(inviteCodeFromLink('A'.repeat(40))).toBe('A'.repeat(16))
    expect(inviteCodeFromLink('---')).toBeNull()
    expect(inviteCodeFromLink('')).toBeNull()
    expect(inviteCodeFromLink(null)).toBeNull()
  })
})

describe('보관(sessionStorage) · 만료 · 삭제', () => {
  it('보관한 코드는 꺼내면서 바로 지운다(한 번만)', () => {
    expect(rememberPendingInvite('k7m-2qx', NOW)).toBe(true)
    expect(hasPendingInvite(NOW)).toBe(true)
    expect(takePendingInvite(NOW + 1000)).toBe('K7M2QX')
    expect(sessionStorage.getItem(KEY)).toBeNull()
    expect(takePendingInvite(NOW + 2000)).toBeNull()
  })

  it('30분이 지나면 버린다(확인만 해도 지운다)', () => {
    rememberPendingInvite('K7M2QX', NOW)
    expect(hasPendingInvite(NOW + PENDING_INVITE_TTL_MS - 1)).toBe(true)
    expect(hasPendingInvite(NOW + PENDING_INVITE_TTL_MS)).toBe(false)
    expect(sessionStorage.getItem(KEY)).toBeNull()
  })

  it('깨진 값·미래 시각은 버린다', () => {
    sessionStorage.setItem(KEY, '{not json')
    expect(takePendingInvite(NOW)).toBeNull()
    sessionStorage.setItem(KEY, JSON.stringify({ code: 'K7M2QX', at: NOW + 10 * 60_000 }))
    expect(hasPendingInvite(NOW)).toBe(false)
    sessionStorage.setItem(KEY, JSON.stringify({ code: 42, at: NOW }))
    expect(hasPendingInvite(NOW)).toBe(false)
  })

  it('새 링크는 이전 코드를 바꾼다 · clear', () => {
    rememberPendingInvite('K7M2QX', NOW)
    rememberPendingInvite('T4K9YP', NOW)
    expect(takePendingInvite(NOW)).toBe('T4K9YP')
    rememberPendingInvite('K7M2QX', NOW)
    clearPendingInvite()
    expect(hasPendingInvite(NOW)).toBe(false)
  })
})

describe('앱 시작 때 링크 받기(captureInviteLink)', () => {
  it('/join#code=…(QR·공유 링크): 코드를 보관하고 주소를 /(진입 라우팅)로 바꿔 fragment를 지운다', () => {
    const { location, history } = at('/join#code=k7m-2qx')
    expect(captureInviteLink(location, history, NOW)).toBe(true)
    expect(history.replaceState).toHaveBeenCalledWith(null, '', '/')
    expect(takePendingInvite(NOW)).toBe('K7M2QX')
  })

  it('fragment와 쿼리를 모두 읽는다(fragment 우선, 없으면 null)', () => {
    expect(inviteCodeInLocation({ hash: '#code=T4K9YP', search: '?code=K7M2QX' })).toBe('T4K9YP')
    expect(inviteCodeInLocation({ hash: '', search: '?code=K7M2QX' })).toBe('K7M2QX')
    expect(inviteCodeInLocation({ hash: '#code=', search: '' })).toBe('')
    expect(inviteCodeInLocation({ hash: '#top', search: '?utm=qr' })).toBeNull()
  })

  it('예전 /join?code=… 링크도 받는다(하위 호환): 코드를 보관하고 주소를 /로 바꿔 code 쿼리를 지운다', () => {
    const { location, history } = at('/join?code=k7m-2qx&utm=qr')
    expect(captureInviteLink(location, history, NOW)).toBe(true)
    expect(history.replaceState).toHaveBeenCalledWith(null, '', '/')
    expect(takePendingInvite(NOW)).toBe('K7M2QX')
  })

  it('형식이 틀린 코드도 보관한다(첫 화면에서 "다시 확인" 안내). 글자가 없으면 손으로 넣는 /join으로', () => {
    const bad = at('/join?code=ABC')
    captureInviteLink(bad.location, bad.history, NOW)
    expect(bad.history.replaceState).toHaveBeenCalledWith(null, '', '/')
    expect(takePendingInvite(NOW)).toBe('ABC')

    const empty = at('/join?code=')
    captureInviteLink(empty.location, empty.history, NOW)
    expect(empty.history.replaceState).toHaveBeenCalledWith(null, '', '/join')
    expect(hasPendingInvite(NOW)).toBe(false)
  })

  it('다른 주소 · code 없는 /join은 건드리지 않는다', () => {
    for (const url of ['/join', '/trips?code=K7M2QX', '/joined?code=K7M2QX', '/login?returnTo=%2Fjoin%3Fcode%3DK7M2QX']) {
      const { location, history } = at(url)
      expect(captureInviteLink(location, history, NOW), url).toBe(false)
      expect(history.replaceState).not.toHaveBeenCalled()
    }
    expect(hasPendingInvite(NOW)).toBe(false)
  })
})

describe('응답 중 초대(activeInvite)', () => {
  it('보관함에서 꺼내 응답 중으로 옮기고, 형식이 틀리면 버린다', () => {
    const seen: (string | null)[] = []
    const off = activeInvite.subscribe(() => seen.push(activeInvite.get()))
    expect(activeInvite.activate(NOW)).toBe('none')
    rememberPendingInvite('ABC', NOW)
    expect(activeInvite.activate(NOW)).toBe('invalid')
    expect(hasPendingInvite(NOW)).toBe(false)
    rememberPendingInvite('t4k-9yp', NOW)
    expect(activeInvite.activate(NOW)).toBe('opened')
    expect(activeInvite.get()).toBe('T4K9YP')
    // 이미 응답 중이면 그대로(새로 보관된 것은 남는다)
    rememberPendingInvite('K7M2QX', NOW)
    expect(activeInvite.activate(NOW)).toBe('opened')
    expect(activeInvite.get()).toBe('T4K9YP')
    activeInvite.clear()
    expect(seen).toEqual(['T4K9YP', null])
    off()
  })

  it('로그아웃·401(forgetInvites): 보관함과 응답 중 초대를 모두 버린다', () => {
    rememberPendingInvite('T4K9YP', NOW)
    expect(activeInvite.activate(NOW)).toBe('opened')
    rememberPendingInvite('K7M2QX', NOW)
    forgetInvites()
    expect(activeInvite.get()).toBeNull()
    expect(hasPendingInvite(NOW)).toBe(false)
  })

  it('첫 화면만 시트를 띄운다', () => {
    for (const p of ['/trips', '/trips/trip-osaka/payments', '/trips/trip-osaka/info', '/trips/x/stats', '/trips/x/settlement']) {
      expect(isInviteLandingPath(p), p).toBe(true)
    }
    for (const p of ['/', '/login', '/trips/new', '/trips/x', '/trips/x/payments/e1', '/trips/x/created', '/signup/terms', '/me', '/join']) {
      expect(isInviteLandingPath(p), p).toBe(false)
    }
  })
})

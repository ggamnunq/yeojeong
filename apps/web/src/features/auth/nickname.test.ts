import { describe, expect, it } from 'vitest'
import { graphemeLength, isNicknameValid, nicknameFromDraft, sanitizeNicknameInput, truncateGraphemes } from './nickname'

describe('닉네임 규칙(FR-103)', () => {
  it('이모지·결합 문자는 한 글자로 센다', () => {
    expect(graphemeLength('준용')).toBe(2)
    expect(graphemeLength('👨‍👩‍👧')).toBe(1)
    expect(graphemeLength('한글abc')).toBe(5)
  })

  it('10자를 넘으면 자른다(카카오 닉네임 미리 채움도 앞 10자)', () => {
    expect(truncateGraphemes('가나다라마바사아자차카')).toBe('가나다라마바사아자차')
    expect(nicknameFromDraft('  가나다라마바사아자차카타 ')).toBe('가나다라마바사아자차')
    expect(nicknameFromDraft(null)).toBe('')
  })

  it('줄바꿈·제어 문자는 입력에서 지운다', () => {
    expect(sanitizeNicknameInput('준\n용\t')).toBe('준용')
    expect(sanitizeNicknameInput('a\u2028b')).toBe('ab')
  })

  it('조합 중에는 자르지 않는다', () => {
    expect(sanitizeNicknameInput('가나다라마바사아자차카', { truncate: false })).toHaveLength(11)
  })

  it('앞뒤 공백을 지운 뒤 1~10자면 다음을 누를 수 있다', () => {
    expect(isNicknameValid('준용')).toBe(true)
    expect(isNicknameValid('   ')).toBe(false)
    expect(isNicknameValid('')).toBe(false)
    expect(isNicknameValid(' 가나다라마바사아자차 ')).toBe(true)
    expect(isNicknameValid('가나다라마바사아자차카')).toBe(false)
  })
})

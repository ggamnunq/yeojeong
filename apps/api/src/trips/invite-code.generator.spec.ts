import {
  INVITE_CODE_ALPHABET,
  formatInviteCode,
  normalizeInviteCode,
} from '@yeojeong/shared';
import { InviteCodeGenerator } from './invite-code.generator.js';

describe('InviteCodeGenerator', () => {
  const generator = new InviteCodeGenerator();
  // DB CHECK groups_invite_code_check와 같은 식
  const DB_CHECK = /^[2-9A-HJKMNP-Z]{6}$/;

  it('makes 6-character codes that pass the DB check and round-trip through normalize', () => {
    for (let i = 0; i < 1000; i++) {
      const code = generator.next();
      expect(code).toMatch(DB_CHECK);
      expect(normalizeInviteCode(formatInviteCode(code).toLowerCase())).toBe(
        code,
      );
    }
  });

  it('never uses the confusable characters 0 O 1 I L', () => {
    const seen = new Set(
      Array.from({ length: 2000 }, () => generator.next()).join(''),
    );
    for (const ch of '0O1IL') expect(seen.has(ch)).toBe(false);
    // 2000개 × 6자면 31자 모두 나온다(빠질 확률은 무시할 만하다)
    expect(seen.size).toBe(INVITE_CODE_ALPHABET.length);
  });

  it('rarely repeats', () => {
    const codes = Array.from({ length: 10_000 }, () => generator.next());
    // 31^6 공간에서 1만 개를 뽑으면 기대 충돌은 0.06건
    expect(new Set(codes).size).toBeGreaterThanOrEqual(9_998);
  });
});

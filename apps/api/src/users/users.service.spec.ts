import { AppException } from '../common/errors/app-exception.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import { assertNickname } from './nickname.js';
import { UsersService } from './users.service.js';

function setup(updated = 1) {
  const prisma = {
    user: {
      updateMany: vi.fn().mockResolvedValue({ count: updated }),
      findUnique: vi.fn().mockResolvedValue({
        id: 'u1',
        nickname: '준용이',
        profileImageUrl: null,
      }),
    },
    paymentMethod: { count: vi.fn().mockResolvedValue(0) },
    paymentConnection: { count: vi.fn().mockResolvedValue(0) },
    transaction: { count: vi.fn().mockResolvedValue(0) },
  };
  return {
    prisma,
    service: new UsersService(prisma as unknown as PrismaService),
  };
}

function fieldCode(fn: () => unknown): unknown {
  try {
    fn();
  } catch (error) {
    expect(error).toBeInstanceOf(AppException);
    const details = (error as AppException).details as {
      fields: { path: string; code: string }[];
    };
    expect(details.fields[0].path).toBe('nickname');
    return details.fields[0].code;
  }
  throw new Error('no error');
}

describe('assertNickname (가입·닉네임 변경 공통)', () => {
  it('trims and accepts 1~10 graphemes, emoji counted as one', () => {
    expect(assertNickname('  준용  ')).toBe('준용');
    expect(assertNickname('가나다라마바사아자🧳')).toBe('가나다라마바사아자🧳');
  });

  it('rejects empty, too long and control characters', () => {
    expect(fieldCode(() => assertNickname('   '))).toBe('EMPTY');
    expect(fieldCode(() => assertNickname('가나다라마바사아자차카'))).toBe(
      'TOO_LONG',
    );
    expect(fieldCode(() => assertNickname('준\t용'))).toBe('INVALID_CHARACTER');
  });
});

describe('UsersService.updateNickname', () => {
  it('updates only the current user and returns Me', async () => {
    const { prisma, service } = setup();
    const me = await service.updateNickname('u1', ' 준용이 ');
    expect(prisma.user.updateMany).toHaveBeenCalledWith({
      where: { id: 'u1' },
      data: { nickname: '준용이' },
    });
    expect(me).toMatchObject({ id: 'u1', nickname: '준용이' });
  });

  it('does not touch the DB when the nickname is invalid', async () => {
    const { prisma, service } = setup();
    await expect(service.updateNickname('u1', '')).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
    });
    expect(prisma.user.updateMany).not.toHaveBeenCalled();
  });

  it('asks to log in again when the user is gone', async () => {
    const { service } = setup(0);
    await expect(service.updateNickname('u1', '준용')).rejects.toMatchObject({
      code: 'UNAUTHENTICATED',
    });
  });
});

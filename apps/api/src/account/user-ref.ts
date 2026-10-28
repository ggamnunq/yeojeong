import { createHash, createHmac } from 'node:crypto';
import type { Prisma } from '../generated/prisma/client.js';

type RefReader = Pick<
  Prisma.TransactionClient,
  'userConsent' | 'accountDeletion'
>;

/**
 * UserConsent·AccountDeletion.userRefHash(탈퇴 후에도 같은 사람의 기록을 잇는 값).
 * 가입 때 auth 모듈이 동의 이력에 남긴 값이 있으면 그대로 쓴다. 계산 방식이 달라도 기록이 끊기지 않게 하려는 것이다.
 * 없을 때만 직접 만든다(USER_REF_HMAC_KEY가 있으면 HMAC, 없으면 접두어 붙인 SHA-256. UUID v4라 추측할 수 없다).
 */
export async function resolveUserRefHash(
  tx: RefReader,
  userId: string,
  key: string | undefined,
): Promise<string> {
  const consent = await tx.userConsent.findFirst({
    where: { userId },
    select: { userRefHash: true },
    orderBy: { createdAt: 'asc' },
  });
  if (consent) return consent.userRefHash;
  const deletion = await tx.accountDeletion.findFirst({
    where: { userId },
    select: { userRefHash: true },
    orderBy: { createdAt: 'asc' },
  });
  if (deletion) return deletion.userRefHash;
  return computeUserRefHash(userId, key);
}

export function computeUserRefHash(
  userId: string,
  key: string | undefined,
): string {
  return key
    ? createHmac('sha256', key).update(userId).digest('hex')
    : createHash('sha256').update(`yeojeong:user-ref:${userId}`).digest('hex');
}

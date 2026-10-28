import { createHmac } from 'node:crypto';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { PrismaService } from '../prisma/prisma.service.js';
import { AuditService } from './audit.service.js';

const KEY = 'k'.repeat(32);
const EXPENSE_ID = '6f1c2d3e-4a5b-4c7d-8e9f-0a1b2c3d4e5f';
const USER_ID = '0b9d3c1a-2e4f-4a6b-8c0d-1e2f3a4b5c6d';

function setup(env: Record<string, string> = {}) {
  const create = vi.fn().mockResolvedValue({ id: 'log-1' });
  const prisma = { accessLog: { create } } as unknown as PrismaService;
  return { service: new AuditService(prisma, new ConfigService(env)), create };
}

describe('AuditService', () => {
  beforeAll(() => Logger.overrideLogger(false));

  it('hashes the IP with HMAC only when a key is configured', () => {
    const withKey = setup({ AUDIT_HMAC_KEY: KEY }).service;
    expect(withKey.hashIp('203.0.113.7')).toBe(
      createHmac('sha256', KEY).update('203.0.113.7').digest('hex'),
    );
    expect(withKey.hashIp('not-an-ip')).toBeNull();
    expect(withKey.hashIp(undefined)).toBeNull();
    // 키 없이 만든 해시는 IPv4 전수 대입으로 되돌릴 수 있어 남기지 않는다
    expect(setup().service.hashIp('203.0.113.7')).toBeNull();
  });

  it('refuses a short key at boot', () => {
    expect(() => setup({ AUDIT_HMAC_KEY: 'short' })).toThrow(/32자/);
  });

  it('stores only IDs, the action and the IP hash', async () => {
    const { service, create } = setup({ AUDIT_HMAC_KEY: KEY });
    await expect(
      service.record({
        userId: USER_ID,
        action: 'VIEW_EXPENSE_DETAIL',
        resourceType: 'EXPENSE',
        resourceId: EXPENSE_ID,
        ip: '203.0.113.7',
      }),
    ).resolves.toBe('log-1');

    expect(create).toHaveBeenCalledWith({
      data: {
        userId: USER_ID,
        action: 'VIEW_EXPENSE_DETAIL',
        resourceType: 'EXPENSE',
        resourceId: EXPENSE_ID,
        ipHash: expect.stringMatching(/^[0-9a-f]{64}$/),
        requestId: null,
        ua: null,
      },
      select: { id: true },
    });
    expect(JSON.stringify(create.mock.calls)).not.toContain('203.0.113.7');
  });

  it('drops a resource ID that is not a UUID', async () => {
    const { service, create } = setup();
    await service.record({
      userId: USER_ID,
      action: 'LIST_EXPENSES',
      resourceType: 'TRIP',
      resourceId: '이치란 36,400',
    });
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ resourceId: null, ipHash: null }),
      }),
    );
  });

  it('writes through the transaction client when one is given', async () => {
    const { service, create } = setup();
    const txCreate = vi.fn().mockResolvedValue({ id: 'log-tx' });
    await expect(
      service.record(
        { userId: USER_ID, action: 'DELETE_ACCOUNT', resourceType: 'USER' },
        { accessLog: { create: txCreate } } as never,
      ),
    ).resolves.toBe('log-tx');
    expect(txCreate).toHaveBeenCalledTimes(1);
    expect(create).not.toHaveBeenCalled();
  });
});

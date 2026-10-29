import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { codefHttpMock, codefResult } from '../../../test/fakes/codef-http.js';
import { CodefAccountRemover } from './codef-account-remover.js';
import { CodefClient } from './codef.client.js';
import { CodefConfig } from './codef.config.js';
import { CODEF_PATHS } from './codef.constants.js';

const env = new ConfigService({
  CODEF_CLIENT_ID: 'id',
  CODEF_CLIENT_SECRET: 'secret',
  TOKEN_ENCRYPTION_KEY: Buffer.alloc(32, 5).toString('base64'),
});

describe('CodefAccountRemover.cleanup (내부 잡)', () => {
  afterEach(() => vi.restoreAllMocks());

  it('deletes rows that succeed and alerts with only the row id after 24 hours', async () => {
    const http = codefHttpMock({
      [CODEF_PATHS.ACCOUNT_DELETE]: (body) =>
        codefResult(
          body.connectedId === 'cid-ok' ? 'CF-00000' : 'CF-12202',
          {},
        ),
    });
    const rows: {
      id: string;
      connectedIdEnc: Uint8Array;
      organization: string;
      createdAt: Date;
    }[] = [];
    const prisma = {
      codefPendingDeletion: {
        create: vi.fn(({ data }: { data: (typeof rows)[number] }) => {
          rows.push({ ...data, createdAt: new Date('2026-11-12T00:00:00Z') });
          return Promise.resolve({});
        }),
        findMany: vi.fn(() => Promise.resolve([...rows])),
        delete: vi.fn().mockResolvedValue({}),
        update: vi.fn().mockResolvedValue({}),
      },
    };
    const remover = new CodefAccountRemover(
      new CodefClient(new CodefConfig(env), http.fetch),
      prisma as never,
      env,
    );
    remover.delays = [0, 0];
    // 요청 안 삭제가 모두 실패하도록 첫 번째는 실패 코드, 두 번째 값은 나중에 성공
    await remover.removeOrQueue('cid-fail', '0301');
    const okHttp = codefHttpMock({
      [CODEF_PATHS.ACCOUNT_DELETE]: () => codefResult('CF-12202', {}),
    });
    const failing = new CodefAccountRemover(
      new CodefClient(new CodefConfig(env), okHttp.fetch),
      prisma as never,
      env,
    );
    failing.delays = [0, 0];
    await failing.removeOrQueue('cid-ok', '0306');
    expect(rows).toHaveLength(2);

    const errors = vi
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
    const result = await remover.cleanup(new Date('2026-11-13T01:00:00Z'));
    expect(result).toEqual({ total: 2, deleted: 1, failed: 1, overdue: 1 });
    expect(prisma.codefPendingDeletion.delete).toHaveBeenCalledWith({
      where: { id: rows[1].id },
    });
    expect(prisma.codefPendingDeletion.update).toHaveBeenCalledWith({
      where: { id: rows[0].id },
      data: expect.objectContaining({ lastErrorCode: 'CF-12202' }),
    });
    expect(errors).toHaveBeenCalledWith(
      { pendingDeletionId: rows[0].id, resultCode: 'CF-12202' },
      'CODEF 계정을 24시간 넘게 지우지 못함',
    );
    expect(JSON.stringify(errors.mock.calls)).not.toContain('cid-');
  });
});

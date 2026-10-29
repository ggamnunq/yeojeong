import { randomUUID } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { TokenCipher as AesGcm } from '../../common/crypto/token-cipher.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { cardImportCipher, requireCipher } from '../keys.js';
import { CodefClient } from './codef.client.js';
import { CODEF_OK, CODEF_PATHS } from './codef.constants.js';

/** 요청 안 재시도 사이 대기(ms). 첫 시도 뒤 0.3초, 0.9초(지수 백오프, 최대 3회) */
export const DELETE_RETRY_DELAYS_MS = [300, 900] as const;
/** 이 시간 넘게 지우지 못하면 error 로그(행 ID만)로 알린다 */
export const PENDING_ALERT_AFTER_MS = 24 * 60 * 60 * 1000;
/** 잡 한 번에 다룰 행 수 */
const CLEANUP_BATCH = 50;

export interface CodefCleanupResult {
  total: number;
  deleted: number;
  failed: number;
  /** 24시간 넘게 실패 중인 행 수 */
  overdue: number;
}

const accountOf = (organization: string) => ({
  countryCode: 'KR',
  businessType: 'CD',
  clientType: 'P',
  organization,
  loginType: '1',
});

/**
 * CODEF 계정(connectedId) 삭제(CODEF_LOGIN_MODE=account 전용). 계정 삭제 본문은 connectedId + accountList(cid-delete 가이드).
 * - 요청 안: 최대 3회(지수 백오프) 시도한다.
 * - 그래도 실패하면 connectedId를 TOKEN_ENCRYPTION_KEY 파생 키로 암호화해 codef_pending_deletions에 넣고(사용자 ID 없음),
 *   내부 잡(10분)이 다시 지운다. 이 값은 삭제에만 쓰고 조회에는 쓰지 않는다. connectedId 평문은 로그·응답에 남기지 않는다(행 ID만).
 */
@Injectable()
export class CodefAccountRemover {
  private readonly logger = new Logger(CodefAccountRemover.name);
  private readonly cipher: AesGcm | null;
  /** 테스트가 0으로 바꿔 기다리지 않게 한다 */
  delays: readonly number[] = DELETE_RETRY_DELAYS_MS;

  constructor(
    private readonly codef: CodefClient,
    private readonly prisma: PrismaService,
    config: ConfigService,
  ) {
    this.cipher = cardImportCipher(config, 'card-import:pending-deletion:v1');
  }

  /** 한 번 시도. 성공이면 null, 실패면 결과 코드(통신 실패는 NETWORK) */
  async tryDelete(
    connectedId: string,
    organization: string,
  ): Promise<string | null> {
    try {
      const res = await this.codef.request(CODEF_PATHS.ACCOUNT_DELETE, {
        connectedId,
        accountList: [accountOf(organization)],
      });
      return res.result.code === CODEF_OK ? null : res.result.code.slice(0, 16);
    } catch {
      return 'NETWORK';
    }
  }

  /** 요청 안에서 최대 3회 지우고, 그래도 실패하면 삭제 대기 행으로 넘긴다. 사용자 응답은 바꾸지 않는다 */
  async removeOrQueue(
    connectedId: string,
    organization: string,
  ): Promise<void> {
    let lastError: string | null = null;
    for (let attempt = 0; attempt <= this.delays.length; attempt += 1) {
      if (attempt > 0) await this.sleep(this.delays[attempt - 1]);
      lastError = await this.tryDelete(connectedId, organization);
      if (lastError === null) return;
    }
    const id = randomUUID();
    try {
      await this.prisma.codefPendingDeletion.create({
        data: {
          id,
          connectedIdEnc: new Uint8Array(
            requireCipher(this.cipher).encrypt(connectedId, id),
          ),
          organization,
          attempts: this.delays.length + 1,
          lastErrorCode: lastError,
          lastTriedAt: new Date(),
        },
      });
      this.logger.warn(
        { pendingDeletionId: id, resultCode: lastError },
        'CODEF 계정을 지우지 못해 삭제 대기로 넘김',
      );
    } catch (error) {
      // 여기까지 실패하면 connectedId를 잃는다. 값은 남기지 않고 알린다
      this.logger.error(
        { resultCode: lastError, errorCode: (error as { code?: string }).code },
        'CODEF 계정 삭제 대기 행을 만들지 못함',
      );
    }
  }

  /** 내부 잡: 삭제 대기 행을 오래된 순으로 다시 지운다. 성공한 행은 지우고, 24시간 넘은 실패는 error 로그(행 ID만) */
  async cleanup(now = new Date()): Promise<CodefCleanupResult> {
    const rows = await this.prisma.codefPendingDeletion.findMany({
      orderBy: { createdAt: 'asc' },
      take: CLEANUP_BATCH,
      select: {
        id: true,
        connectedIdEnc: true,
        organization: true,
        createdAt: true,
      },
    });
    const result: CodefCleanupResult = {
      total: rows.length,
      deleted: 0,
      failed: 0,
      overdue: 0,
    };
    for (const row of rows) {
      let error: string | null;
      try {
        const connectedId = requireCipher(this.cipher)
          .decrypt(row.connectedIdEnc, row.id)
          .toString('utf8');
        error = await this.tryDelete(connectedId, row.organization);
      } catch {
        error = 'DECRYPT';
      }
      if (error === null) {
        await this.prisma.codefPendingDeletion.delete({
          where: { id: row.id },
        });
        result.deleted += 1;
        continue;
      }
      result.failed += 1;
      await this.prisma.codefPendingDeletion.update({
        where: { id: row.id },
        data: {
          attempts: { increment: 1 },
          lastErrorCode: error,
          lastTriedAt: now,
        },
      });
      if (now.getTime() - row.createdAt.getTime() > PENDING_ALERT_AFTER_MS) {
        result.overdue += 1;
        this.logger.error(
          { pendingDeletionId: row.id, resultCode: error },
          'CODEF 계정을 24시간 넘게 지우지 못함',
        );
      }
    }
    return result;
  }

  protected sleep(ms: number): Promise<void> {
    return ms > 0
      ? new Promise((done) => setTimeout(done, ms))
      : Promise.resolve();
  }
}

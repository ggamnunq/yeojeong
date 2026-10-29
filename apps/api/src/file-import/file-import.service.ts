import { Injectable, Logger } from '@nestjs/common';
import {
  FILE_IMPORT_DAILY_MAX,
  type FieldError,
  type FileImportCheckRequest,
  type FileImportCheckResponse,
  type FileImportProvider,
  type FileImportRequest,
  type FileImportResponse,
} from '@yeojeong/shared';
import { AuditService } from '../audit/index.js';
import { ImportKeyHasher } from '../card-import/import-key.js';
import { retryDetails } from '../card-import/card-import-limits.js';
import { AppException, ValidationFailedError } from '../common/errors/index.js';
import { kstDate, kstDayRange } from '../expenses/kst.js';
import {
  manualAmountError,
  memoError,
  occurredAtError,
} from '../expenses/manual-input.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { WalletService } from '../wallet/wallet.service.js';
import { FILE_IMPORT_PROVIDER_CURRENCY } from './providers.js';

/**
 * importKey 재료. txnDigest = 브라우저가 계산한 SHA-256("{provider}:{거래 번호}")(거래 번호 원문은 서버로 오지 않는다).
 * 사용자 ID를 넣어 같은 거래라도 사용자마다 키가 다르다(사용자 사이 연결 불가). **형식·키 교체 금지**("추가됨" 판정이 끊긴다)
 */
export const fileImportKeyMaterial = (
  provider: FileImportProvider,
  userId: string,
  txnDigest: string,
) => `file-import:v1|${provider}|${userId}|${txnDigest}`;

/**
 * 거래 내역 파일 가져오기(W10). 파일은 브라우저에서만 읽고, 서버는 사용자가 고른 결제(시각·금액·통화·가맹점·거래 다이제스트)만 받는다.
 * 저장은 지갑 직접 입력과 같은 규칙(시각 범위·내용 40자·금액·원화 1억 상한)과 여정 자동 연결을 쓴다(WalletService).
 * 거래 다이제스트는 HMAC(importKey)으로만 쓰고 저장·로그하지 않는다.
 */
@Injectable()
export class FileImportService {
  private readonly logger = new Logger(FileImportService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly wallet: WalletService,
    private readonly hasher: ImportKeyHasher,
    private readonly audit: AuditService,
  ) {}

  importKeyOf(
    provider: FileImportProvider,
    userId: string,
    txnDigest: string,
  ): string {
    return this.hasher.hash(fileImportKeyMaterial(provider, userId, txnDigest));
  }

  /** 모두 검사한 뒤(하나라도 틀리면 아무것도 저장하지 않는다) 한 건씩 저장한다. 이미 있는 거래는 건너뛴다(created=false) */
  async import(
    userId: string,
    body: FileImportRequest,
    now: Date = new Date(),
  ): Promise<FileImportResponse> {
    const currency = FILE_IMPORT_PROVIDER_CURRENCY[body.provider];
    const errors: FieldError[] = body.items.flatMap((item, index) => {
      const prefix = `items.${index}`;
      const found = [
        occurredAtError(new Date(item.occurredAt), now, `${prefix}.occurredAt`),
        memoError(item.merchantName, `${prefix}.merchantName`),
        manualAmountError(item.amount, item.currency, `${prefix}.amount`),
      ];
      if (item.currency !== currency) {
        found.push({
          path: `${prefix}.currency`,
          code: 'isIn',
          message: '지원하지 않는 통화예요',
        });
      }
      if (
        body.items.findIndex((other) => other.txnDigest === item.txnDigest) <
        index
      ) {
        found.push({
          path: `${prefix}.txnDigest`,
          code: 'duplicate',
          message: '같은 결제가 두 번 있어요',
        });
      }
      return found.filter((e) => e !== null);
    });
    if (errors.length > 0) throw new ValidationFailedError(errors);

    // 한 트랜잭션으로 저장한다(하나라도 실패하면 아무것도 남지 않는다). 접근 기록은 결과와 무관하게 실제 만든 건수로 남긴다
    const day = kstDayRange(kstDate(now));
    let items: FileImportResponse['items'] = [];
    let linked = 0;
    let outcome = 'FAILED';
    try {
      const saved = await this.wallet.saveFileImportBatch(
        userId,
        body.provider,
        body.items.map((item) => ({
          importKey: this.importKeyOf(body.provider, userId, item.txnDigest),
          amount: item.amount,
          currency: item.currency,
          occurredAt: new Date(item.occurredAt),
          merchantName: item.merchantName,
        })),
        {
          dailyLimit: FILE_IMPORT_DAILY_MAX,
          dayStart: day.gte,
          onDailyLimit: () =>
            AppException.of('FILE_IMPORT_DAILY_LIMIT', {
              details: { ...retryDetails(day.lt, now) },
            }),
        },
        now,
      );
      items = saved.map((s) => ({ created: s.created, entryId: s.entryId }));
      linked = saved.filter((s) => s.created && s.linked).length;
      outcome = 'OK';
    } finally {
      // 접근 기록: 공급자·건수·결과만(금액·가맹점·거래 번호 없음). 실패 경로에서는 기록 실패가 원래 오류를 가리지 않게 한다
      await this.audit
        .record({
          userId,
          action: 'IMPORT_FILE_ENTRIES',
          resourceType: 'USER',
          resourceId: userId,
          details: {
            provider: body.provider,
            requested: body.items.length,
            created: items.filter((i) => i.created).length,
            linked,
            outcome,
          },
        })
        .catch((error: unknown) => {
          if (outcome === 'OK') throw error;
          this.logger.error('파일 가져오기 실패 접근 기록을 남기지 못했습니다');
        });
    }
    const created = items.filter((i) => i.created).length;
    return { items, created, skipped: items.length - created, linked };
  }

  /**
   * 결과 화면(HF-68)용: 이미 저장한 거래인지(importKey 비교)만 답한다. 받는 것은 대조값(txnDigest)뿐이고
   * 저장·로그하지 않는다(접근 기록도 남기지 않는다 — 요청 로그에는 경로·상태만). DB는 한 번 읽는다
   */
  async check(
    userId: string,
    body: FileImportCheckRequest,
  ): Promise<FileImportCheckResponse> {
    const keys = body.txnDigests.map((digest) =>
      this.importKeyOf(body.provider, userId, digest),
    );
    const rows = await this.prisma.transaction.findMany({
      where: {
        userId,
        source: 'FILE_IMPORT',
        importProvider: body.provider,
        externalRef: { in: [...new Set(keys)] },
      },
      select: { externalRef: true },
    });
    const imported = new Set(rows.map((r) => r.externalRef));
    return { imported: keys.map((key) => imported.has(key)) };
  }
}

import { Injectable } from '@nestjs/common';
import type {
  FieldError,
  FileImportCheckRequest,
  FileImportCheckResponse,
  FileImportProvider,
  FileImportRequest,
  FileImportResponse,
} from '@yeojeong/shared';
import { AuditService } from '../audit/index.js';
import { ImportKeyHasher } from '../card-import/import-key.js';
import { ValidationFailedError } from '../common/errors/index.js';
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

    const items: FileImportResponse['items'] = [];
    let linked = 0;
    for (const item of body.items) {
      const saved = await this.wallet.saveFileImported(
        userId,
        {
          importKey: this.importKeyOf(body.provider, userId, item.txnDigest),
          amount: item.amount,
          currency: item.currency,
          occurredAt: new Date(item.occurredAt),
          merchantName: item.merchantName,
        },
        now,
      );
      if (saved.linked) linked += 1;
      items.push({ created: saved.created, entryId: saved.entryId });
    }
    const created = items.filter((i) => i.created).length;
    // 접근 기록: 공급자·건수만(금액·가맹점·거래 번호 없음)
    await this.audit.record({
      userId,
      action: 'IMPORT_FILE_ENTRIES',
      resourceType: 'USER',
      resourceId: userId,
      details: {
        provider: body.provider,
        requested: body.items.length,
        created,
        linked,
      },
    });
    return { items, created, skipped: items.length - created, linked };
  }

  /** 결과 화면(HF-68)용: 이미 저장한 거래인지(importKey 비교) · 저장하면 자동 연결될 여정. DB는 두 번만 읽는다 */
  async check(
    userId: string,
    body: FileImportCheckRequest,
  ): Promise<FileImportCheckResponse> {
    const keys = body.items.map((item) =>
      this.importKeyOf(body.provider, userId, item.txnDigest),
    );
    const [rows, trips] = await Promise.all([
      this.prisma.transaction.findMany({
        where: {
          userId,
          source: 'FILE_IMPORT',
          externalRef: { in: [...new Set(keys)] },
        },
        select: { externalRef: true },
      }),
      this.wallet.suggestedTripIds(
        userId,
        body.items.map((item) => new Date(item.occurredAt)),
      ),
    ]);
    const imported = new Set(rows.map((r) => r.externalRef));
    return {
      items: keys.map((key, index) => ({
        imported: imported.has(key),
        inTripId: trips[index] ?? null,
      })),
    };
  }
}

import { Module } from '@nestjs/common';
import { FxModule } from '../fx/fx.module.js';
import { CardImportController } from './card-import.controller.js';
import { CardImportService } from './card-import.service.js';
import { CodefAccountRemover } from './codef/codef-account-remover.js';
import { CardImportJobsController } from './jobs.controller.js';
import { CardImportLimits } from './card-import-limits.js';
import {
  CODEF_CALL_COUNTER,
  CODEF_FETCH,
  CodefClient,
} from './codef/codef.client.js';
import { ImportKeyHasher } from './import-key.js';
import { ItemTokenSigner } from './item-token.js';
import { CodefConfig } from './codef/codef.config.js';
import { TwoWayTokenSealer } from './two-way-token.js';

/**
 * 카드 승인내역 불러오기(S8): CODEF로 개인 카드 승인내역을 한 번 조회하고(저장하지 않음) 고른 것만 지갑에 저장한다(src/wallet import).
 * 토스 연동(src/payment-methods·transactions)과 별개다. importKey는 전용 키(IMPORT_KEY_HMAC_KEY, ImportKeyHasher)로 만든다.
 */
@Module({
  imports: [FxModule],
  controllers: [CardImportController, CardImportJobsController],
  providers: [
    CardImportService,
    CodefClient,
    CodefConfig,
    CodefAccountRemover,
    CardImportLimits,
    ItemTokenSigner,
    { provide: CODEF_CALL_COUNTER, useExisting: CardImportLimits },
    TwoWayTokenSealer,
    ImportKeyHasher,
    { provide: CODEF_FETCH, useValue: globalThis.fetch.bind(globalThis) },
  ],
  // CardImportLimits: 관리자 CODEF 현황(src/admin)이 일일 예산 값을 읽는다
  exports: [CodefConfig, ItemTokenSigner, CardImportLimits],
})
export class CardImportModule {}

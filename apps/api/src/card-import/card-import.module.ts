import { Module } from '@nestjs/common';
import { FxModule } from '../fx/fx.module.js';
import { TokenCipher } from '../payment-methods/token-cipher.js';
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
import { ItemTokenSigner } from './item-token.js';
import { CodefConfig } from './codef/codef.config.js';
import { TwoWayTokenSealer } from './two-way-token.js';

/**
 * 카드 승인내역 불러오기(S8): CODEF로 개인 카드 승인내역을 한 번 조회하고(저장하지 않음) 고른 것만 지갑에 저장한다(src/wallet import).
 * 토스 연동(src/payment-methods·transactions)과 별개다. TokenCipher는 hmacRef(importKey) 때문에 같은 클래스를 새로 만들어 쓴다(같은 env 키).
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
    TokenCipher,
    { provide: CODEF_FETCH, useValue: globalThis.fetch.bind(globalThis) },
  ],
  exports: [CodefConfig, ItemTokenSigner],
})
export class CardImportModule {}

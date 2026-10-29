import { Module } from '@nestjs/common';
import { ImportKeyHasher } from '../card-import/import-key.js';
import { WalletModule } from '../wallet/wallet.module.js';
import { FileImportController } from './file-import.controller.js';
import { FileImportService } from './file-import.service.js';

/**
 * 거래 내역 파일 가져오기(W10, 위챗페이 → 알리페이 예정). 파일 파싱은 브라우저(apps/web features/file-import)가 한다.
 * 서버는 고른 결제를 지갑에 저장(WalletService — 직접 입력 규칙·여정 자동 연결)하고 importKey는 전용 키(IMPORT_KEY_HMAC_KEY)로 만든다.
 */
@Module({
  imports: [WalletModule],
  controllers: [FileImportController],
  providers: [FileImportService, ImportKeyHasher],
})
export class FileImportModule {}

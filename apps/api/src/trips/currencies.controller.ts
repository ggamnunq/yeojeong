import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { SupportedCurrency } from '@yeojeong/shared';
import { SUPPORTED_CURRENCIES } from './currencies.js';
import { SupportedCurrencyDto } from './dto/trip-response.dto.js';

@ApiTags('trips')
@Controller('currencies')
export class CurrenciesController {
  @ApiOperation({
    summary: '여정 통화로 고를 수 있는 통화 목록(KRW가 맨 앞)',
    description: 'FR-201·302. 서버 고정 목록이다. 화면 표시는 "JPY · 일본 엔"',
  })
  @ApiOkResponse({ type: [SupportedCurrencyDto] })
  @Get()
  list(): readonly SupportedCurrency[] {
    return SUPPORTED_CURRENCIES;
  }
}

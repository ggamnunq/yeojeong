import { Controller, Get, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Place } from '@yeojeong/shared';
import { PlaceQueryDto } from './dto/trip-request.dto.js';
import { PlaceDto } from './dto/trip-response.dto.js';
import { searchPlaces } from './places.js';

@ApiTags('trips')
@Controller('places')
export class PlacesController {
  @ApiOperation({
    summary: '여행 장소 검색(최대 20)',
    description:
      'FR-201. 장소가 자유 입력이 되어 새 화면은 쓰지 않는다(옛 화면 호환용, 제거 예정)',
    deprecated: true,
  })
  @ApiOkResponse({ type: [PlaceDto] })
  @Get()
  search(@Query() query: PlaceQueryDto): Place[] {
    return searchPlaces(query.query);
  }
}

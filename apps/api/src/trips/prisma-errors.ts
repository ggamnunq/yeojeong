import { AppException } from '../common/errors/index.js';
import { Prisma } from '../generated/prisma/client.js';
import type {
  TripDetailResponse,
  TripVersionConflictDetails,
} from '@yeojeong/shared';

/** 유니크 위반(초대코드 충돌, 같은 그룹 중복 참여, 활성 그룹장 2명 등) */
export function isUniqueViolation(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2002'
  );
}

/** 트랜잭션 안에서 version이 다를 때 던지고, 밖에서 최신 상세를 붙여 409로 바꾼다 */
export class TripVersionMismatch extends Error {
  constructor() {
    super('trip version mismatch');
  }
}

export function versionConflict(current: TripDetailResponse) {
  const details: TripVersionConflictDetails = { current };
  return AppException.of('VERSION_CONFLICT', { details: { ...details } });
}

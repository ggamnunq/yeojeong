import { randomInt } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { INVITE_CODE_ALPHABET, INVITE_CODE_LENGTH } from '@yeojeong/shared';

/**
 * 초대코드 6자(31^6 ≈ 8.9억 가지)를 CSPRNG로 뽑는다. 유일성은 DB 부분 유니크 인덱스
 * (groups_invite_code_active_key, 삭제되지 않은 그룹)가 지키고, 충돌하면 호출자가 다시 뽑는다.
 * 테스트에서 충돌을 재현하려고 클래스로 둔다.
 */
@Injectable()
export class InviteCodeGenerator {
  next(): string {
    let code = '';
    for (let i = 0; i < INVITE_CODE_LENGTH; i++) {
      code += INVITE_CODE_ALPHABET[randomInt(INVITE_CODE_ALPHABET.length)];
    }
    return code;
  }
}

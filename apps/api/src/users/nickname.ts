import { normalizeNickname } from '@yeojeong/shared';
import { ValidationFailedError } from '../common/errors/app-exception.js';

/**
 * 가입(FR-103)·닉네임 변경(FR-902)이 같이 쓰는 서버 검증. 화면과 같은 shared normalizeNickname 규칙으로
 * 앞뒤 공백을 지운 값을 돌려주고, 어기면 400 VALIDATION_FAILED(fields[0].path = nickname)를 던진다.
 */
export function assertNickname(input: string): string {
  const nickname = normalizeNickname(input);
  if (nickname.ok) return nickname.value;
  throw new ValidationFailedError([
    {
      path: 'nickname',
      code: nickname.reason,
      message:
        nickname.reason === 'TOO_LONG'
          ? '닉네임은 10자까지 쓸 수 있어요'
          : nickname.reason === 'EMPTY'
            ? '닉네임을 입력해 주세요'
            : '닉네임에 쓸 수 없는 문자가 있어요',
    },
  ]);
}

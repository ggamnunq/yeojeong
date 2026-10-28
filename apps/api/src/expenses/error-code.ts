/** 로그에는 오류 코드만 남긴다(입력값이 섞일 수 있는 메시지·meta는 남기지 않는다) */
export function errorCodeOf(error: unknown): string {
  if (typeof error === 'object' && error !== null) {
    const { code, name } = error as { code?: unknown; name?: unknown };
    if (typeof code === 'string') return code;
    if (typeof name === 'string') return name;
  }
  return 'UNKNOWN';
}

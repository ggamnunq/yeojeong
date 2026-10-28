/**
 * WEB_ORIGIN(쉼표로 구분)을 CORS 허용 목록으로 바꾼다.
 * `https://yeojeong.example.com`처럼 정확한 origin만 받고, 와일드카드나 경로가 붙은 값은 시작 단계에서 막는다.
 */
export function parseWebOrigins(value: string | undefined): string[] {
  if (!value) return [];

  return value
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0)
    .map((origin) => {
      if (origin.includes('*')) {
        throw new Error(`WEB_ORIGIN에 와일드카드는 쓸 수 없습니다: ${origin}`);
      }
      let url: URL;
      try {
        url = new URL(origin);
      } catch {
        throw new Error(`WEB_ORIGIN 형식이 잘못됐습니다: ${origin}`);
      }
      if (
        (url.protocol !== 'https:' && url.protocol !== 'http:') ||
        url.origin !== origin
      ) {
        throw new Error(
          `WEB_ORIGIN은 경로 없이 origin만 적어야 합니다 (예: https://yeojeong.example.com): ${origin}`,
        );
      }
      return origin;
    });
}

import { CODEF_OAUTH_URL } from '../../src/card-import/codef/codef.constants.js';

// CODEF HTTP 목. 실제 네트워크에 나가지 않는다. CODEF_FETCH 자리에 fetch로 넣는다.
// 경로마다 응답(객체 → JSON 본문)을 정하고, 요청은 calls에 쌓는다(본문은 URL 디코딩한 JSON).

export interface CodefCall {
  url: string;
  path: string;
  body: Record<string, unknown>;
}

export type CodefRoute = (
  body: Record<string, unknown>,
  call: number,
) => object | Error;

export function codefHttpMock(
  routes: Record<string, CodefRoute>,
  options: { urlEncodeResponse?: boolean } = {},
) {
  const calls: CodefCall[] = [];
  let tokens = 0;
  const counts = new Map<string, number>();
  const fetch = vi.fn(
    async (input: string | URL | Request, init?: RequestInit) => {
      const url =
        input instanceof Request
          ? input.url
          : input instanceof URL
            ? input.href
            : input;
      if (url === CODEF_OAUTH_URL) {
        tokens += 1;
        return new Response(
          JSON.stringify({
            access_token: `token-${tokens}`,
            expires_in: 604799,
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      const path = new URL(url).pathname;
      const raw = typeof init?.body === 'string' ? init.body : '';
      const body = JSON.parse(decodeURIComponent(raw)) as Record<
        string,
        unknown
      >;
      calls.push({ url, path, body });
      const route = routes[path];
      if (!route) return new Response('not found', { status: 404 });
      const n = counts.get(path) ?? 0;
      counts.set(path, n + 1);
      const result = route(body, n);
      if (result instanceof Error) throw result;
      const json = JSON.stringify(result);
      return new Response(
        options.urlEncodeResponse ? encodeURIComponent(json) : json,
        { status: 200 },
      );
    },
  );
  return {
    fetch: fetch as unknown as typeof globalThis.fetch,
    calls,
    tokenRequests: () => tokens,
  };
}

export const codefResult = (code: string, data: unknown = {}) => ({
  result: { code, message: '', extraMessage: '', transactionId: 'mock' },
  data,
});

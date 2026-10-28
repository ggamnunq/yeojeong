// jinyeojeong.com/api/* 요청만 이 Worker를 거친다(wrangler.jsonc의 run_worker_first). 나머지는 정적 자산이 바로 응답한다.
interface Env {
  API_ORIGIN: string
  ORIGIN_SECRET: string
}

// 클라이언트가 보낸 프록시·신원 헤더는 버리고 Worker가 다시 채운다
const DROPPED_REQUEST_HEADERS = [
  'host',
  'forwarded',
  'x-forwarded-for',
  'x-forwarded-host',
  'x-forwarded-proto',
  'x-real-ip',
  'true-client-ip',
  'x-client-ip',
  'x-origin-auth',
  'cdn-loop',
]

const DROPPED_RESPONSE_HEADERS = ['server', 'via', 'alt-svc', 'x-cloud-trace-context']

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)
    if (!url.pathname.startsWith('/api/')) {
      return new Response('Not Found', { status: 404 })
    }

    const headers = new Headers()
    for (const [name, value] of request.headers) {
      if (!name.startsWith('cf-') && !DROPPED_REQUEST_HEADERS.includes(name)) {
        headers.set(name, value)
      }
    }
    headers.set('x-origin-auth', env.ORIGIN_SECRET)
    // CF-Connecting-IP는 Cloudflare 엣지가 채운 값이라 클라이언트가 위조할 수 없다
    const clientIp = request.headers.get('cf-connecting-ip')
    if (clientIp) headers.set('x-client-ip', clientIp)

    const hasBody = request.method !== 'GET' && request.method !== 'HEAD'
    let upstream: Response
    try {
      upstream = await fetch(new URL(url.pathname + url.search, env.API_ORIGIN), {
        method: request.method,
        headers,
        body: hasBody ? request.body : undefined,
        redirect: 'manual',
        cache: 'no-store',
      })
    } catch {
      return Response.json({ statusCode: 502, message: 'Bad Gateway' }, { status: 502 })
    }

    const response = new Response(upstream.body, upstream)
    for (const name of DROPPED_RESPONSE_HEADERS) response.headers.delete(name)
    return response
  },
}

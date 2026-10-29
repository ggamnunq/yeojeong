// 지금 탭이 돌리는 번들의 빌드 ID와, 배포된 최신 빌드 ID(/version.json) 비교.
// 빌드 ID는 vite.config.ts의 buildInfo 플러그인이 넣는다(운영: 커밋 SHA 앞 12자, 개발 서버: 'dev').
// 같은 값을 정적 파일 /version.json({ buildId })으로도 배포한다. _headers가 no-store로 내준다.

/** 이 번들의 빌드 ID. Vitest처럼 플러그인이 없는 환경은 'dev' */
export const BUILD_ID: string = import.meta.env.VITE_BUILD_ID || 'dev'

export const VERSION_URL = '/version.json'
/** version.json을 기다리는 최대 시간. 에러 화면이 이만큼 늦게 뜰 수 있다 */
export const VERSION_TIMEOUT_MS = 3000
/** 최근 확인 결과를 다시 쓰는 시간(에러가 몰려도 한 번만 묻는다) */
const CACHE_MS = 30_000

const BUILD_ID_PATTERN = /^[\w.-]{1,64}$/

/** 'stale' = 배포된 빌드가 이 탭과 다르다, 'current' = 같다, 'unknown' = 확인하지 못했다(오프라인·시간 초과·형식 오류) */
export type BuildFreshness = 'stale' | 'current' | 'unknown'

export type BuildCheck = { freshness: BuildFreshness; latestBuildId: string | null }

/** version.json 본문 → 빌드 ID. 형식이 틀리면 null */
export function parseVersionFile(body: unknown): string | null {
  if (typeof body !== 'object' || body === null) return null
  const id = (body as { buildId?: unknown }).buildId
  return typeof id === 'string' && BUILD_ID_PATTERN.test(id) ? id : null
}

/** 두 빌드 ID 비교. 최신 값을 모르면 unknown */
export function compareBuild(current: string, latest: string | null): BuildFreshness {
  if (!latest) return 'unknown'
  return latest === current ? 'current' : 'stale'
}

/** /version.json을 캐시 없이 읽는다. 실패하면 null(던지지 않는다) */
export async function fetchLatestBuildId(timeoutMs = VERSION_TIMEOUT_MS): Promise<string | null> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(VERSION_URL, {
      cache: 'no-store',
      credentials: 'omit',
      headers: { accept: 'application/json' },
      signal: controller.signal,
    })
    if (!res.ok) return null
    return parseVersionFile(await res.json())
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

let cached: { at: number; promise: Promise<BuildCheck> } | null = null

/** 배포된 빌드가 이 탭과 같은지 확인한다. 동시에 여러 번 불러도 요청은 하나(30초 동안 결과를 다시 쓴다) */
export function checkBuild(now = Date.now()): Promise<BuildCheck> {
  if (cached && now - cached.at < CACHE_MS) return cached.promise
  const promise = fetchLatestBuildId().then((latestBuildId) => ({
    latestBuildId,
    freshness: compareBuild(BUILD_ID, latestBuildId),
  }))
  cached = { at: now, promise }
  return promise
}

/** 테스트용: 캐시를 비운다 */
export function resetBuildCheck() {
  cached = null
}

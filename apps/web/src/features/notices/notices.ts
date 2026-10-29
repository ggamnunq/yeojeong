import type { NoticeView } from '@yeojeong/shared'

// 서비스 공지(Q-57). 목록은 서버(GET /api/notices/active — API 코드의 정적 목록, git 이력이 게시 기록)가 준다.
// 화면은 닫지 않은 것 중 첫 번째(서버가 최신부터 준다) 하나만 배너로 보인다. 닫으면 공지 id를 이 기기 localStorage에 기억한다.

const DISMISSED_KEY = 'yj:notices:dismissed'
/** 오래된 id가 끝없이 쌓이지 않게 최근 것만 남긴다 */
const MAX_DISMISSED = 50

/** 닫은 공지 id. 저장소를 못 쓰는 환경(사생활 보호 모드 등)이면 빈 목록 — 배너는 계속 보인다 */
export function dismissedNoticeIds(): string[] {
  try {
    const raw = localStorage.getItem(DISMISSED_KEY)
    const parsed: unknown = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : []
  } catch {
    return []
  }
}

/** 공지를 닫았다고 기억한다. 저장하지 못하면 이번 화면에서만 닫힌다 */
export function dismissNotice(id: string) {
  try {
    const next = [...dismissedNoticeIds().filter((d) => d !== id), id].slice(-MAX_DISMISSED)
    localStorage.setItem(DISMISSED_KEY, JSON.stringify(next))
  } catch {
    // 저장소를 못 쓰는 환경
  }
}

/** 보일 공지 하나: 닫지 않은 것 중 첫 번째(서버 순서 = 최신부터). 앱 밖 주소는 쓰지 않는다 */
export function pickNotice(items: readonly NoticeView[], dismissed: readonly string[]): NoticeView | null {
  return items.find((n) => !dismissed.includes(n.id) && n.url.startsWith('/') && !n.url.startsWith('//')) ?? null
}

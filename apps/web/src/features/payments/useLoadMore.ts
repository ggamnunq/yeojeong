import { useEffect, useRef } from 'react'

/**
 * 무한 스크롤: 목록 끝 표시 요소가 화면 가까이 오면 onLoad를 부른다(FR-501, 다음 커서 50건).
 * IntersectionObserver가 없는 환경에서는 아무것도 하지 않는다.
 */
export function useLoadMore<T extends Element>(enabled: boolean, onLoad: () => void) {
  const ref = useRef<T>(null)
  const latest = useRef(onLoad)
  useEffect(() => {
    latest.current = onLoad
  })

  useEffect(() => {
    const target = ref.current
    if (!enabled || !target || typeof IntersectionObserver === 'undefined') return
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) latest.current()
    }, { rootMargin: '400px 0px' })
    observer.observe(target)
    return () => observer.disconnect()
  }, [enabled])

  return ref
}

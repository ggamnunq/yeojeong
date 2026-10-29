import { useEffect, useState } from 'react'

/**
 * 1초마다 바뀌는 기기 시각(epoch ms). active일 때만 돈다. 백그라운드에서 돌아오면 바로 다시 계산한다
 * (추가 인증 남은 시간 · 로그인 쿨다운 해제 시각 — 화면명세 WF-53c · WF-54)
 */
export function useNow(active: boolean): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!active) return
    const tick = () => setNow(Date.now())
    tick()
    const id = window.setInterval(tick, 1000)
    document.addEventListener('visibilitychange', tick)
    return () => {
      window.clearInterval(id)
      document.removeEventListener('visibilitychange', tick)
    }
  }, [active])
  return now
}

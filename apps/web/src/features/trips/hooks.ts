import { useEffect, useState } from 'react'

/** 값이 delayMs 동안 그대로면 그 값을 돌려준다(검색·초대코드 조회 디바운스). delayMs 0이면 바로 */
export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    if (delayMs <= 0) return
    const timer = setTimeout(() => setDebounced(value), delayMs)
    return () => clearTimeout(timer)
  }, [value, delayMs])
  return delayMs <= 0 ? value : debounced
}

import { useLocation, useNavigate } from 'react-router'

/** 헤더 ‹: 앱 안에서 온 화면이면 뒤로, 주소로 바로 열었으면 fallback으로(대체) */
export function useBack(fallback: string) {
  const navigate = useNavigate()
  const location = useLocation()
  return () => {
    if (location.key !== 'default') navigate(-1)
    else navigate(fallback, { replace: true })
  }
}

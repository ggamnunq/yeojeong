import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { useNavigate } from 'react-router'
import { BannerNotice } from '../../ds'
import { activeNoticesQuery } from './api'
import { dismissedNoticeIds, dismissNotice, pickNotice } from './notices'

/**
 * 공지 배너 자리(Q-57 · HF-60/60b). 로그인 후 첫 화면들에 둔다: 결제내역(WF-18·19) · 시작 전 여정 정보(WF-16) · 여정 없음(WF-09) · 마이페이지(WF-30).
 * 현황·정산 탭에는 두지 않는다. 보일 공지가 없으면(목록 없음·모두 닫음·실패) 아무것도 그리지 않는다.
 * 누르면 공지 주소로, ✕는 그 공지 id를 기억하고 숨긴다. 시각은 DS Banner/Notice가 맡는다.
 */
export function NoticeBanner({ className }: { className?: string }) {
  const navigate = useNavigate()
  const notices = useQuery(activeNoticesQuery())
  const [dismissed, setDismissed] = useState(dismissedNoticeIds)
  const notice = pickNotice(notices.data?.items ?? [], dismissed)
  if (!notice) return null
  return (
    <div className={className}>
      <BannerNotice
        label={notice.title}
        onClick={() => void navigate(notice.url)}
        onClose={() => {
          dismissNotice(notice.id)
          setDismissed((ids) => [...ids, notice.id])
        }}
      />
    </div>
  )
}

import type { TripListItem } from '../../api'

export type WithdrawFact = {
  id: 'wallet' | 'shared' | 'leave' | 'leader' | 'solo'
  /** 굵게(Body/M Strong) 앞부분 */
  strong: string
  /** 보통 굵기 뒷부분 */
  rest: string
}

/**
 * HF-59 사실 줄. 서버 탈퇴 파이프라인(account-deletion)과 같은 결과만 적는다.
 * - 그룹장인 여정에 다른 멤버가 있으면 다음 멤버가 그룹장을 잇는다(HF-59c)
 * - 나만 남은 여정(멤버 1명)은 여정째 삭제된다
 */
export function withdrawFacts(trips: readonly Pick<TripListItem, 'isLeader' | 'memberCount'>[]): WithdrawFact[] {
  const facts: WithdrawFact[] = [
    { id: 'wallet', strong: '지갑과 개인·미확정 결제', rest: '가 삭제돼요' },
    { id: 'shared', strong: '공동 결제와 정산', rest: '은 ‘탈퇴한 멤버’로 남아요' },
    { id: 'leave', strong: '참여한 여정', rest: '에서 모두 나가요' },
  ]
  if (trips.some((t) => t.isLeader && t.memberCount > 1)) facts.push({ id: 'leader', strong: '그룹장', rest: '은 다음 멤버가 맡아요' })
  if (trips.some((t) => t.memberCount <= 1)) facts.push({ id: 'solo', strong: '나만 남은 여정', rest: '은 삭제돼요' })
  return facts
}

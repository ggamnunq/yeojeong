import { Avatar, Button } from '../../../ds'
import { PROFILE_COPY } from '../copy'

/** HF-30 프로필 행: 프사 XL · 닉네임(H1) · 오른쪽 끝 「수정」(Button Ghost S, Figma 154:16873 — 글자 끝을 20 거터에 맞춘다) → 내 정보(HF-63) */
export function ProfileHeader({
  nickname,
  profileImageUrl,
  onEdit,
}: {
  nickname: string
  profileImageUrl: string | null
  onEdit: () => void
}) {
  return (
    <div className="flex items-center gap-4">
      <Avatar size="xl" me name={nickname} src={profileImageUrl} alt="" />
      <h2 className="min-w-0 flex-1 truncate text-h1 text-primary">{nickname}</h2>
      <Button type="ghost" size="s" label={PROFILE_COPY.edit} aria-label="내 정보 수정" onClick={onEdit} className="-mr-3 shrink-0" />
    </div>
  )
}

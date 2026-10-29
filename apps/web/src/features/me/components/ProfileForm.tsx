import type { FormEvent } from 'react'
import { Avatar } from '../../../ds'
import { NicknameInput } from '../../auth/components/NicknameInput'
import { PROFILE_COPY } from '../copy'

export type ProfileFormProps = {
  /** form id — 하단 CTA(셸 밖)의 submit이 이 폼을 가리킨다 */
  formId: string
  /** 저장된 지금 닉네임(아바타 이니셜·접근성 이름) */
  nickname: string
  profileImageUrl: string | null
  value: string
  error: string | null
  onChange: (value: string) => void
  onSubmit: () => void
}

/**
 * 내 정보(HF-63, Figma 155:16871) 본문: 프사 XL(읽기 전용, 가운데) + Caption 카카오 안내 → 라벨 "닉네임" + 입력(HF-03 재사용).
 * 화면 틀(헤더 · 하단 「저장」)과 저장 흐름은 pages/ProfilePage가 맡는다.
 */
export function ProfileForm({ formId, nickname, profileImageUrl, value, error, onChange, onSubmit }: ProfileFormProps) {
  const submit = (event: FormEvent) => {
    event.preventDefault()
    onSubmit()
  }
  return (
    <>
      <div className="flex flex-col items-center gap-3 pt-4">
        <Avatar size="xl" me name={nickname} src={profileImageUrl} alt="프로필 사진" />
        <p className="text-caption text-tertiary">{PROFILE_COPY.photoNote}</p>
      </div>
      <form id={formId} noValidate onSubmit={submit} className="pt-8">
        {/* HF-63: 라벨 "닉네임" 보임, 카운터·헬퍼 숨김(오류만) */}
        <NicknameInput value={value} error={error} labelVisible counter={false} enterKeyHint="done" onChange={onChange} />
      </form>
    </>
  )
}

import { paths } from '../../app/paths'
import { toast } from '../../notifications'
import { COPY, formatInviteCode } from './rules'

// 초대코드 복사·공유(FR-202). 복사는 Clipboard API, 안 되면 숨은 textarea + execCommand.
// 공유는 Web Share API가 있으면 OS 공유 시트, 없거나 실패하면 같은 내용(문구 + 참여 링크 두 줄)을 복사한다(화면명세 WF-11 「공유 내용」).

/** 글자를 클립보드에 넣는다. 성공하면 true */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    // 권한 거부·비보안 컨텍스트: 아래 대체 방법으로
  }
  try {
    const area = document.createElement('textarea')
    area.value = text
    area.setAttribute('readonly', '')
    area.className = 'fixed -left-[9999px] opacity-0'
    document.body.append(area)
    area.select()
    const ok = document.execCommand('copy')
    area.remove()
    return ok
  } catch {
    return false
  }
}

/** 초대코드 "K7M-2QX"를 복사하고 토스트를 띄운다 */
export async function copyInviteCode(code: string): Promise<boolean> {
  const ok = await copyText(formatInviteCode(code))
  if (ok) toast.success(COPY.copied)
  else toast.error(COPY.retryLater)
  return ok
}

/** 참여 링크(같은 origin) "https://jinyeojeong.com/join?code=K7M2QX" */
export function joinUrl(code: string): string {
  return `${window.location.origin}${paths.join(code)}`
}

/** 공유 내용: 문구 "{그룹명} 초대코드 K7M-2QX" + 참여 링크(코드는 하이픈 없음) */
export function inviteShareData({ groupName, code }: { groupName: string; code: string }) {
  return { text: `${groupName} 초대코드 ${formatInviteCode(code)}`, url: joinUrl(code) } satisfies ShareData
}

/**
 * OS 공유 시트로 초대코드·참여 링크를 보낸다(WF-11 「공유」 · WF-23 「추가」). 미지원·실패면 같은 내용을 "{문구}\n{링크}"로 복사한다.
 * 사용자가 시트를 닫으면 아무것도 하지 않는다
 */
export async function shareInvite(invite: { groupName: string; code: string }): Promise<void> {
  const data = inviteShareData(invite)
  if (typeof navigator.share === 'function' && (navigator.canShare?.(data) ?? true)) {
    try {
      await navigator.share(data)
      return
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return
    }
  }
  const ok = await copyText(`${data.text}\n${data.url}`)
  if (ok) toast.success(COPY.copied)
  else toast.error(COPY.retryLater)
}

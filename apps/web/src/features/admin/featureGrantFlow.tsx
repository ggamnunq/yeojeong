import type { AdminFeatureGrantCell, AdminFeatureGrantRow, AdminFeatureStatus, FeatureMode } from '@yeojeong/shared'
import { useState } from 'react'
import { Dialog } from '../../ds'
import { FEATURE_LABEL } from './format'
import { useAdminGrantFeature, useAdminRevokeFeature } from './hooks'

// 회원별 기능 권한(ADMIN3) 부여·회수 흐름(확인 다이얼로그 → 서버). 기능 권한 탭(/admin/features)과 회원 상세가 같이 쓴다.
// 부여·회수 모두 확인 다이얼로그를 거친다(되돌릴 수 있어 재인증은 없다). 칸 하나는 FeatureGrantControl.

export type FeatureGrantTarget = { row: AdminFeatureGrantRow; cell: AdminFeatureGrantCell; action: 'grant' | 'revoke' }

/** 표에 보일 이름(env에만 있고 회원이 없으면 사용자 ID) */
export const rowName = (row: AdminFeatureGrantRow) => row.nickname ?? row.userId

const GRANT_MESSAGE: Record<FeatureMode, string> = {
  allowlist: '다음 요청부터 바로 보여요',
  on: '지금은 전체 공개라 권한과 상관없이 보여요',
  off: '기능이 꺼져 있어 지금은 보이지 않아요',
}

function revokeMessage(cell: AdminFeatureGrantCell, mode: FeatureMode | undefined): string {
  if (cell.sources.includes('ENV')) return 'env 목록에도 있어 회수해도 계속 보여요'
  if (mode === 'on') return '전체 공개 단계라 회수해도 계속 보여요'
  return '다음 요청부터 보이지 않아요'
}

/**
 * 부여·회수 흐름: request(대상) → 확인 다이얼로그 → 서버. 성공하면 onDone(안내 문구), 실패하면 다이얼로그를 닫고 error로 보인다.
 * 메모(note)는 부여할 때만 보낸다(권한 행에만 남고 접근 기록에는 내용이 남지 않는다)
 */
export function useFeatureGrantFlow({
  features,
  note,
  onDone,
}: {
  features: readonly AdminFeatureStatus[] | undefined
  note?: string
  onDone: (notice: string) => void
}) {
  const [target, setTarget] = useState<FeatureGrantTarget | null>(null)
  const grant = useAdminGrantFeature()
  const revoke = useAdminRevokeFeature()
  const pending = grant.isPending || revoke.isPending

  const request = (next: FeatureGrantTarget) => {
    grant.reset()
    revoke.reset()
    setTarget(next)
  }

  const confirm = () => {
    if (!target) return
    const name = rowName(target.row)
    const label = FEATURE_LABEL[target.cell.feature]
    const close = () => setTarget(null)
    if (target.action === 'grant') {
      const trimmed = note?.trim()
      grant.mutate(
        { userId: target.row.userId, feature: target.cell.feature, ...(trimmed && { note: trimmed }) },
        {
          onSuccess: () => {
            onDone(`${name} 님에게 ${label} 권한을 줬어요`)
            close()
          },
          onError: close,
        },
      )
    } else {
      revoke.mutate(
        { userId: target.row.userId, feature: target.cell.feature },
        {
          onSuccess: () => {
            onDone(`${name} 님의 ${label} 권한을 회수했어요`)
            close()
          },
          onError: close,
        },
      )
    }
  }

  const mode = target ? features?.find((f) => f.feature === target.cell.feature)?.effectiveMode : undefined
  const name = target ? rowName(target.row) : ''
  const label = target ? FEATURE_LABEL[target.cell.feature] : ''
  const dialog = (
    <Dialog
      open={target !== null}
      type={target?.action === 'revoke' ? 'danger' : 'default'}
      title={target?.action === 'revoke' ? `${name} 님의 ${label} 권한을 회수할까요?` : `${name} 님에게 ${label} 권한을 줄까요?`}
      message={target ? (target.action === 'revoke' ? revokeMessage(target.cell, mode) : GRANT_MESSAGE[mode ?? 'allowlist']) : ''}
      confirmLabel={target?.action === 'revoke' ? '회수' : '권한 주기'}
      confirmState={pending ? 'loading' : 'default'}
      onCancel={() => {
        if (!pending) setTarget(null)
      }}
      onConfirm={confirm}
    />
  )

  return { request, dialog, error: grant.error ?? revoke.error }
}

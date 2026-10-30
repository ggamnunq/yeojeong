import type { AdminFeatureGrantCell, AdminFeatureGrantRow } from '@yeojeong/shared'
import type { ReactNode } from 'react'
import { Tag, Toggle } from '../../ds'
import { rowName, type FeatureGrantTarget } from './featureGrantFlow'
import { FEATURE_LABEL } from './format'

// 회원별 기능 권한(ADMIN3) 칸 하나. 기능 권한 탭(/admin/features)과 회원 상세가 같이 쓴다(흐름·다이얼로그는 featureGrantFlow).

/** 칸 하나: 관리자 권한 토글(켜짐 = 관리자 페이지에서 준 권한) · env 태그(회수 불가) · 지금 켜졌는지 */
export function FeatureGrantControl({
  row,
  cell,
  onRequest,
  extra,
}: {
  row: AdminFeatureGrantRow
  cell: AdminFeatureGrantCell
  onRequest: (target: FeatureGrantTarget) => void
  /** 지금 상태 뒤에 붙일 짧은 참고(카드 불러오기 동의·오늘 조회) */
  extra?: ReactNode
}) {
  const admin = cell.sources.includes('ADMIN')
  const env = cell.sources.includes('ENV')
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <div className="flex items-center gap-2">
        <Toggle
          value={admin}
          // 회원이 없는 env 항목에는 줄 수 없다(서버 404)
          disabled={row.nickname === null && !admin}
          aria-label={`${rowName(row)} ${FEATURE_LABEL[cell.feature]} 권한`}
          onChange={(next) => onRequest({ row, cell, action: next ? 'grant' : 'revoke' })}
        />
        {env && <Tag type="warning" size="s" label="env" />}
      </div>
      <span className="text-caption whitespace-nowrap text-tertiary">
        {cell.enabled ? '켜짐' : '꺼짐'}
        {extra}
      </span>
    </div>
  )
}

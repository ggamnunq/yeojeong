import { ERRORS, type ErrorCode } from '@yeojeong/shared'
import { useState } from 'react'
import { ApiError, handleApiError } from '../api'
import { BottomSheet, Button, Dialog } from '../ds'
import { toast, ToastHost } from '../notifications'
import { defineCatalog } from './catalog'
import { Row, Sub } from './ui'

// 알림 큐(src/notifications)와 전역 에러 처리기(src/api/errors.ts)를 실제로 띄워 보는 데모.
// 열린 BottomSheet·Dialog 위에서도 토스트가 보이고 눌리는지 확인하는 용도.

function fail(code: ErrorCode, extra: Partial<ConstructorParameters<typeof ApiError>[0]> = {}) {
  return new ApiError({ code, message: ERRORS[code].message, status: ERRORS[code].status, ...extra })
}

function Triggers() {
  return (
    <Row className="gap-2">
      <Button type="secondary" size="s" label="성공" onClick={() => toast.success('초대코드를 복사했어요')} />
      <Button
        type="secondary"
        size="s"
        label="연결 실패"
        onClick={() =>
          handleApiError(fail('NETWORK_ERROR', { status: 0 }), { retry: () => toast.success('다시 불러왔어요') })
        }
      />
      <Button
        type="secondary"
        size="s"
        label="서버 오류"
        onClick={() => handleApiError(fail('INTERNAL_ERROR', { requestId: crypto.randomUUID() }))}
      />
      <Button
        type="secondary"
        size="s"
        label="요청 과다"
        onClick={() => handleApiError(fail('RATE_LIMITED', { retryAfterSec: 30 }))}
      />
      <Button
        type="secondary"
        size="s"
        label="충돌"
        onClick={() => handleApiError(fail('CONFLICT', { message: '이미 정산이 끝난 여정이에요' }))}
      />
    </Row>
  )
}

export default defineCatalog({
  title: 'ToastHost',
  group: 'components',
  order: 56,
  Demo: function ToastHostCatalog() {
    const [sheet, setSheet] = useState(false)
    const [dialog, setDialog] = useState(false)
    return (
      <div className="flex flex-col gap-8">
        <Sub title="toast.* · handleApiError — 동시에 최대 2개, 기본 3초·오류 5초, 같은 토스트 2초 안 중복 제거, 포인터·포커스가 올라가면 멈춤">
          <Triggers />
        </Sub>
        <Sub title="열린 시트·다이얼로그 위 — popover로 최상위 레이어에 올리고, 맨 위 모달 dialog 안으로 옮겨 그린다(바깥은 inert)">
          <Row className="gap-2">
            <Button type="primary" size="s" label="시트 열기" onClick={() => setSheet(true)} />
          </Row>
        </Sub>
        <BottomSheet open={sheet} onClose={() => setSheet(false)} title="결제 상세">
          <div className="flex flex-col gap-4">
            <p className="text-body-s text-secondary">시트가 열린 채로 토스트를 띄워 보세요.</p>
            <Triggers />
            <Button type="secondary" size="m" label="다이얼로그 열기" onClick={() => setDialog(true)} />
            <Dialog
              open={dialog}
              onCancel={() => setDialog(false)}
              onConfirm={() => handleApiError(fail('CONFLICT', { message: '다른 멤버가 먼저 바꿨어요' }))}
              title="개인 결제로 바꿀까요?"
              message="확인을 누르면 충돌 토스트가 다이얼로그 위에 뜬다"
              confirmLabel="확인"
            />
          </div>
        </BottomSheet>
        <ToastHost aboveNav={false} />
      </div>
    )
  },
})

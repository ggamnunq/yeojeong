import { BottomSheet, SheetContentOption } from '../../../ds'

export type AddMethodSheetProps = {
  open: boolean
  onClose: () => void
  /** 「연결」 클릭 핸들러 안에서 토스 연결을 시작한다(빈 새 창은 사용자 동작 안에서 열어야 팝업이 막히지 않는다) */
  onConnect: () => void
  pending?: boolean
}

/** WF-28 계좌·카드 추가 시트: 「토스로 불러오기」 + 연결. 지갑과 결제 상세(결제수단 0개로 공개 확대가 막혔을 때)가 같이 쓴다 */
export function AddMethodSheet({ open, onClose, onConnect, pending = false }: AddMethodSheetProps) {
  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title="계좌·카드 추가"
      cta={{ label: '연결', onClick: onConnect, state: pending ? 'loading' : 'default' }}
    >
      <SheetContentOption options={[{ value: 'TOSS', title: '토스로 불러오기' }]} value="TOSS" aria-label="불러올 곳" />
    </BottomSheet>
  )
}

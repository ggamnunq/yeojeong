import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { keys } from '../../../api'
import { BottomSheet, Checkbox, Dialog, ListItem } from '../../../ds'
import { toast } from '../../../notifications'
import { isOutOfPeriodKey } from '../../payments/api'
import { removePaymentMethod } from '../api'
import type { PaymentMethodView } from '../types'

export type RemoveMethodFlowProps = {
  /** ⋯를 누른 결제수단. null이면 닫힘 */
  method: PaymentMethodView | null
  /** 이 결제수단이 연결의 마지막이면 "불러온 결제도 지우기" 선택지를 보인다(부록 C-5, 일부 해제일 때만) */
  isLastOfConnection: boolean
  /** 활성 결제수단이 이것 하나뿐(전부 해제): 내 개인·미확정 결제가 지워지고 연동 동의가 철회된다(v0.5.7) */
  isLastMethod: boolean
  onClose: () => void
}

const COPY = {
  partial: '이후 결제는 불러오지 않아요',
  all: '개인·미확정 결제도 지워져요',
  purge: '불러온 결제도 지우기',
  done: '연결을 해제했어요',
}

/** 결제수단 ⋯ → 액션 시트 "연결 해제"(부록 C-4) → 확인 다이얼로그(C-5) → DELETE(FR-804) */
export function RemoveMethodFlow({ method, isLastOfConnection, isLastMethod, onClose }: RemoveMethodFlowProps) {
  const queryClient = useQueryClient()
  const [confirming, setConfirming] = useState(false)
  const [purge, setPurge] = useState(false)
  // 체크박스는 일부 해제이면서 그 연결의 마지막 결제수단일 때만. 전부 해제는 체크 없이 서버가 지운다
  const purgeOption = isLastOfConnection && !isLastMethod

  const remove = useMutation({
    mutationFn: (input: { id: string; purge: boolean }) => removePaymentMethod(input.id, input.purge),
    onSuccess: (_data, input) => {
      toast.success(COPY.done)
      void queryClient.invalidateQueries({ queryKey: keys.wallet.all })
      void queryClient.invalidateQueries({ queryKey: keys.session })
      void queryClient.invalidateQueries({ queryKey: keys.me })
      // 결제가 지워졌으면(전부 해제 · 불러온 결제도 지우기) 결제내역·현황·여정(미확정 수)을 다시 받는다.
      // 기간 외 후보는 제공자를 다시 부르므로 뺀다
      if (isLastMethod || input.purge) {
        void queryClient.invalidateQueries({ queryKey: keys.trips.all, predicate: (q) => !isOutOfPeriodKey(q.queryKey) })
      }
    },
    onSettled: () => close(),
  })

  function close() {
    setConfirming(false)
    setPurge(false)
    onClose()
  }

  return (
    <>
      <BottomSheet open={method !== null && !confirming} onClose={close} title={method?.productName ?? ''}>
        <div className="-mx-5">
          <ListItem type="destructive" title="연결 해제" onClick={() => setConfirming(true)} />
        </div>
      </BottomSheet>
      <Dialog
        open={method !== null && confirming}
        type="danger"
        title="연결을 해제할까요?"
        message={
          <>
            {isLastMethod ? COPY.all : COPY.partial}
            {purgeOption && (
              <Checkbox
                label={COPY.purge}
                checked={purge}
                onChange={(event) => setPurge(event.currentTarget.checked)}
                className="mt-2 flex text-body-s"
              />
            )}
          </>
        }
        confirmLabel="해제"
        onCancel={close}
        onConfirm={() => {
          if (method && !remove.isPending) remove.mutate({ id: method.id, purge: purgeOption && purge })
        }}
      />
    </>
  )
}

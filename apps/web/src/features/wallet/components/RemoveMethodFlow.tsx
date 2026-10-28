import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { keys } from '../../../api'
import { BottomSheet, Checkbox, Dialog, ListItem } from '../../../ds'
import { toast } from '../../../notifications'
import { removePaymentMethod } from '../api'
import type { PaymentMethodView } from '../types'

export type RemoveMethodFlowProps = {
  /** ⋯를 누른 결제수단. null이면 닫힘 */
  method: PaymentMethodView | null
  /** 이 결제수단이 연결의 마지막이면 "불러온 결제도 지우기" 선택지를 보인다(부록 C-5) */
  isLastOfConnection: boolean
  onClose: () => void
}

/** 결제수단 ⋯ → 액션 시트 "연결 해제"(부록 C-4) → 확인 다이얼로그(C-5) → DELETE(FR-804) */
export function RemoveMethodFlow({ method, isLastOfConnection, onClose }: RemoveMethodFlowProps) {
  const queryClient = useQueryClient()
  const [confirming, setConfirming] = useState(false)
  const [purge, setPurge] = useState(false)
  const remove = useMutation({
    mutationFn: (input: { id: string; purge: boolean }) => removePaymentMethod(input.id, input.purge),
    onSuccess: () => {
      toast.success('연결을 해제했어요')
      void queryClient.invalidateQueries({ queryKey: keys.wallet.all })
      void queryClient.invalidateQueries({ queryKey: keys.session })
      void queryClient.invalidateQueries({ queryKey: keys.me })
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
            이후 결제는 불러오지 않아요
            {isLastOfConnection && (
              <Checkbox
                label="불러온 결제도 지우기"
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
          if (method && !remove.isPending) remove.mutate({ id: method.id, purge: isLastOfConnection && purge })
        }}
      />
    </>
  )
}

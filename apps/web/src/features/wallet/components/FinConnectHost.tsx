import { useEffect, useSyncExternalStore } from 'react'
import { useLocation } from 'react-router'
import { connectPrompt } from '../../../app/connectPrompt'
import { useAccountLink } from '../../../app/features'
import { FinConsentSheet } from '../../auth/components/FinConsentSheet'
import { useTossConnect } from '../useTossConnect'
import { AddMethodSheet } from './AddMethodSheet'

/**
 * 연동 동의·결제수단 0개로 막힌 요청을 지갑 연결로 잇는 시트(app/connectPrompt). 루트 레이아웃에 하나.
 * 연결이 끝나면 지금 화면으로 돌아온다(returnTo). 토스 연결 기능이 꺼져 있으면(FR-006) 아무것도 그리지 않는다.
 */
export function FinConnectHost() {
  const prompt = useSyncExternalStore(connectPrompt.subscribe, connectPrompt.get)
  const location = useLocation()
  const here = `${location.pathname}${location.search}`
  const connect = useTossConnect()
  // 다른 화면으로 가면(연결 흐름 WF-06으로 넘어갈 때 포함) 닫는다. 동의 체크는 같은 주소의 history state만 바꾼다
  useEffect(() => connectPrompt.close(), [location.pathname])
  const accountLink = useAccountLink()
  useEffect(() => {
    if (!accountLink) connectPrompt.close()
  }, [accountLink, prompt])

  if (!accountLink) return null

  return (
    <>
      <FinConsentSheet
        open={prompt === 'consent'}
        onClose={connectPrompt.close}
        screen="WF-28"
        purpose="WALLET_ADD"
        from={here}
      />
      <AddMethodSheet
        open={prompt === 'add'}
        onClose={connectPrompt.close}
        pending={connect.isPending}
        onConnect={() => {
          connectPrompt.close()
          connect.start({ purpose: 'WALLET_ADD', from: here, returnTo: here })
        }}
      />
      {connect.consentSheet && <FinConsentSheet {...connect.consentSheet} />}
    </>
  )
}

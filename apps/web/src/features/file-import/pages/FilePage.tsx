import { useQuery } from '@tanstack/react-query'
import { useCallback, useEffect, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { Navigate, useLocation, useNavigate, useParams } from 'react-router'
import { isApiError } from '../../../api'
import { paths } from '../../../app/paths'
import { useMyTrips } from '../../../app/trip'
import { toast } from '../../../notifications'
import { latestFxQuery } from '../../manual/api'
import { clock } from '../../payments/clock'
import { COPY } from '../copy'
import { checkAll, useFileImportEnabled, useSaveFileImport } from '../hooks'
import { StatementFileError, type ExcludedCounts, type StatementErrorKind } from '../parsers/types'
import { providerBySlug, type ProviderInfo } from '../providers'
import { inAcceptedRange, initialSelection, mergeCheck, toggleAll, toggleOne, toImportItems, type ResultRow } from '../rules'
import { EmptyStep, FileErrorStep, FileInput, GuideStep, ReadingStep, ResultStep } from '../steps'

// HF-66 내보내는 방법 → (파일 선택) → HF-67 읽는 중 → HF-68 결과 / 68b 0건 / 66b·66c 오류. 모두 /wallet/file-import/:provider의 단계 상태다.
// 보안(카드 불러오기 L-0 메모리 규칙과 같다):
// - 파일은 브라우저에서만 읽는다(parsers/ 지연 로딩). 파일 바이트·표는 파서 지역 변수로만 있고, 남는 것은 정규화한 후보(ResultRow)뿐이다.
//   거래 번호 원문은 파싱 중에 SHA-256 다이제스트로 바꾸고 버린다. 支付方式·商户单号·备注는 읽지 않는다.
// - 결과는 이 컴포넌트 state에만 둔다(쿼리 캐시·URL·history state·저장소에 넣지 않는다). 나가기·완료·pagehide에서 버린다.
// - 서버에는 확인(다이제스트·시각)과 저장(고른 것의 다이제스트·시각·순액·통화·가맹점)만 보낸다.

type Step = 'guide' | 'reading' | 'result' | 'empty' | 'error'

export default function FilePage() {
  const { provider: slug } = useParams()
  const info = providerBySlug(slug)
  const enabled = useFileImportEnabled()
  if (!enabled || !info) return <Navigate replace to={paths.wallet()} />
  return <FileFlow info={info} />
}

function FileFlow({ info }: { info: ProviderInfo }) {
  const navigate = useNavigate()
  const location = useLocation()
  const fromWallet = (location.state as { fromWallet?: boolean } | null)?.fromWallet === true
  const trips = useMyTrips()
  const saver = useSaveFileImport()
  const inputRef = useRef<HTMLInputElement>(null)

  const [step, setStep] = useState<Step>('guide')
  const [fileName, setFileName] = useState('')
  const [errorKind, setErrorKind] = useState<StatementErrorKind>('format')
  const [rows, setRows] = useState<ResultRow[]>([])
  const [excluded, setExcluded] = useState<ExcludedCounts>({ transfer: 0, other: 0 })
  const [selected, setSelected] = useState<Set<string>>(() => new Set())
  // 취소·이탈 뒤 늦게 끝난 읽기·확인을 버리는 세대 번호
  const generation = useRef(0)
  const abort = useRef<AbortController | null>(null)

  const fx = useQuery({ ...latestFxQuery('CNY'), enabled: step === 'result' })

  /** 결과를 버리고 처음(HF-66)으로 */
  const reset = useCallback(() => {
    generation.current += 1
    abort.current?.abort()
    abort.current = null
    setRows([])
    setSelected(new Set())
    setExcluded({ transfer: 0, other: 0 })
    setFileName('')
    setStep('guide')
  }, [])

  // 떠나면 진행 중 확인 요청을 끊는다(결과 state는 컴포넌트와 함께 사라진다)
  useEffect(() => () => abort.current?.abort(), [])

  // bfcache: 페이지를 떠날 때(pagehide) 결과를 비우고, 뒤로 가기로 복원되면(pageshow persisted) 처음부터
  useEffect(() => {
    const wipe = () => flushSync(reset)
    const onShow = (event: PageTransitionEvent) => {
      if (event.persisted) wipe()
    }
    window.addEventListener('pagehide', wipe)
    window.addEventListener('pageshow', onShow)
    return () => {
      window.removeEventListener('pagehide', wipe)
      window.removeEventListener('pageshow', onShow)
    }
  }, [reset])

  const exit = () => {
    reset()
    void (fromWallet ? navigate(-1) : navigate(paths.wallet(), { replace: true }))
  }
  const manual = () => {
    reset()
    void navigate(paths.walletNew(), { replace: true, state: { fromList: fromWallet } })
  }
  const pick = () => inputRef.current?.click()

  const onFile = async (file: File) => {
    reset()
    const gen = generation.current
    const controller = new AbortController()
    abort.current = controller
    setFileName(file.name)
    setStep('reading')
    try {
      const { parseStatementFile } = await import('../parsers')
      const parsed = await parseStatementFile(info.provider, file)
      if (gen !== generation.current) return
      // 서버가 받지 않는 시각(1년 넘게 지난 결제 등)은 조용히 뺀다
      const now = clock.now()
      const items = parsed.items.filter((i) => inAcceptedRange(i.occurredAt, now))
      const counts = { ...parsed.excluded, other: parsed.excluded.other + parsed.items.length - items.length }
      if (items.length === 0) {
        setExcluded(counts)
        return setStep('empty')
      }
      const check = await checkAll(info.provider, items, controller.signal)
      if (gen !== generation.current) return
      const merged = mergeCheck(items, check)
      setRows(merged)
      setExcluded(counts)
      setSelected(initialSelection(merged))
      setStep('result')
    } catch (error) {
      if (gen !== generation.current) return
      if (error instanceof StatementFileError) {
        setErrorKind(error.kind)
        return setStep('error')
      }
      if (isApiError(error) && error.code === 'NOT_FOUND') return void navigate(paths.wallet(), { replace: true })
      toast.error(COPY.later)
      reset()
    }
  }

  const add = () => {
    const items = toImportItems(rows, selected)
    if (items.length === 0 || saver.isPending) return
    saver.mutate(
      { provider: info.provider, items },
      {
        onSuccess: (res) => {
          toast.success(res.created > 0 ? COPY.added(res.created) : COPY.alreadyAdded)
          exit()
        },
        onError: (error) => {
          if (isApiError(error) && error.code === 'NOT_FOUND') return void navigate(paths.wallet(), { replace: true })
          toast.error(COPY.later)
        },
      },
    )
  }

  const tripName = (tripId: string) => trips.data?.items.find((t) => t.tripId === tripId)?.groupName

  const input = <FileInput inputRef={inputRef} accept={info.accept} onFile={(file) => void onFile(file)} />
  switch (step) {
    case 'reading':
      return <ReadingStep fileName={fileName} onCancel={reset} />
    case 'result':
      return (
        <>
          <ResultStep
            info={info}
            rows={rows}
            excluded={excluded}
            selected={selected}
            rate={fx.data?.rate ?? null}
            tripName={tripName}
            saving={saver.isPending}
            onToggle={(key) => setSelected((prev) => toggleOne(prev, key))}
            onToggleAll={() => setSelected((prev) => toggleAll(rows, prev))}
            onBack={reset}
            onAdd={add}
          />
          {input}
        </>
      )
    case 'empty':
      return (
        <>
          <EmptyStep info={info} onBack={reset} onManual={manual} onPick={pick} />
          {input}
        </>
      )
    case 'error':
      return (
        <>
          <FileErrorStep info={info} kind={errorKind} onBack={reset} onPick={pick} />
          {input}
        </>
      )
    default:
      return (
        <>
          <GuideStep info={info} onBack={exit} onPick={pick} />
          {input}
        </>
      )
  }
}

import { useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { Navigate, useLocation, useNavigate, useParams } from 'react-router'
import { isApiError } from '../../../api'
import { paths } from '../../../app/paths'
import { myTripsQuery, useMyTrips } from '../../../app/trip'
import { toast } from '../../../notifications'
import { clock } from '../../payments/clock'
import { fetchSpotSeries } from '../api'
import { COPY } from '../copy'
import { checkAll, useFileImportProviders, useSaveFileImport } from '../hooks'
import { StatementFileError, type ExcludedCounts, type StatementErrorKind } from '../parsers/types'
import { providerBySlug, type ProviderInfo } from '../providers'
import { buildRows, inAcceptedRange, initialSelection, kstDateRange, toggleAll, toggleOne, toImportItems, type ResultRow } from '../rules'
import { EmptyStep, FileErrorStep, FileInput, GuideStep, ReadingStep, ResultStep } from '../steps'

// HF-66 내보내는 방법 → (파일 선택) → HF-67 읽는 중 → HF-68 결과 / 68b 0건 / 66b·66c 오류. 모두 /wallet/file-import/:provider의 단계 상태다.
// 보안(카드 불러오기 L-0 메모리 규칙과 같다):
// - 파일은 브라우저에서만 읽는다(parsers/ 지연 로딩). 파일 바이트·표는 파서 지역 변수로만 있고, 남는 것은 정규화한 후보(ResultRow)뿐이다.
//   거래 번호 원문은 파싱 중에 SHA-256 다이제스트로 바꾸고 버린다. 위챗 支付方式·商户单号·备注, 알리페이 对方账号·收/付款方式·商家订单号·备注는
//   정규화 단계에서 접근하지 않고 저장·전송·보관하지 않는다(표를 쪼개는 동안만 파서 지역 변수에 있다).
// - 확인(check)에는 결과 행(가맹점 결제)의 대조값만 보낸다. 송금·이체·红包·중성 거래 행은 다이제스트도 만들지 않는다.
// - 결과는 이 컴포넌트 state에만 둔다(쿼리 캐시·URL·history state·저장소에 넣지 않는다). 나가기·완료·pagehide에서 버린다.
// - 서버에는 확인(다이제스트·시각)과 저장(고른 것의 다이제스트·시각·순액·통화·가맹점)만 보낸다.

type Step = 'guide' | 'reading' | 'result' | 'empty' | 'error'

export default function FilePage() {
  const { provider: slug } = useParams()
  const info = providerBySlug(slug)
  const providers = useFileImportProviders()
  // 꺼졌거나 모르는 공급자, 켜지지 않은 공급자(FILE_IMPORT_PROVIDERS)면 지갑으로
  if (!info || !providers.includes(info.provider)) return <Navigate replace to={paths.wallet()} />
  return <FileFlow info={info} />
}

function FileFlow({ info }: { info: ProviderInfo }) {
  const navigate = useNavigate()
  const location = useLocation()
  const fromWallet = (location.state as { fromWallet?: boolean } | null)?.fromWallet === true
  const queryClient = useQueryClient()
  // 결과 행 여정 이름·자동 연결 여정은 내 여정 목록(클라이언트)으로 정한다(명세 4-13-7)
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

  /** 결과를 버리고 처음(HF-66)으로 */
  const resetSaver = saver.reset
  const reset = useCallback(() => {
    generation.current += 1
    // 저장 뮤테이션이 들고 있는 보낸 항목(가맹점·금액)도 버린다
    resetSaver()
    abort.current?.abort()
    abort.current = null
    setRows([])
    setSelected(new Set())
    setExcluded({ transfer: 0, other: 0 })
    setFileName('')
    setStep('guide')
  }, [resetSaver])

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
      const range = kstDateRange(items)
      const [imported, myTrips, series] = await Promise.all([
        checkAll(info.provider, items, controller.signal),
        queryClient.ensureQueryData(myTripsQuery()),
        // 환율을 못 받으면 "약 ₩" 줄만 숨긴다
        range ? fetchSpotSeries(items[0].currency, range.from, range.to, controller.signal).catch(() => null) : null,
      ])
      if (gen !== generation.current) return
      const merged = buildRows(items, imported, myTrips.items, series?.rates ?? null)
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
          toast.error(isApiError(error) && error.code === 'FILE_IMPORT_DAILY_LIMIT' ? COPY.dailyLimit : COPY.later)
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

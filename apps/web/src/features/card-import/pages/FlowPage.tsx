import { useQueryClient } from '@tanstack/react-query'
import type { CardApprovalItem, FetchCardApprovalsResponse, ImportWalletEntryItem } from '@yeojeong/shared'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Navigate, useBlocker, useNavigate, useParams } from 'react-router'
import { flushSync } from 'react-dom'
import { isApiError } from '../../../api'
import { paths } from '../../../app/paths'
import { LoadingScreen } from '../../../app/states'
import { useMyTrips } from '../../../app/trip'
import { Dialog, ShellSub } from '../../../ds'
import { toast } from '../../../notifications'
import { clock } from '../../payments/clock'
import { kst } from '../../payments/rules'
import { cardImportKeys } from '../api'
import { ImportErrorScreen } from '../components'
import { COPY } from '../copy'
import { useFlowNav } from '../flow'
import { buildFetchRequest, useCardImportConfig, useFetchCardApprovals, useImportWalletEntries } from '../hooks'
import {
  classifyFetchError,
  clipRange,
  initialSelection,
  kstClock,
  rangeErrorText,
  rangeLimits,
  toggleAll,
  visibleOrganizations,
  type ErrorScreenKind,
} from '../rules'
import { EmptyStep, LoadingStep, LoginStep, ResultStep, TwoWayStep } from '../steps'
import { useNow } from '../useNow'

// WF-53 로그인 → (WF-54 추가 인증) → WF-55 불러오는 중 → WF-56 결과 / 56b 0건 / WF-57 오류·한도. 모두 /wallet/import/:issuer의 단계 상태다.
// 보안(화면명세 L-0 메모리 규칙):
// - 비밀번호 원문은 입력 칸 state에만 있고, "불러오기"를 누르면 바로 비운다. 암호화는 S8 hook(start)이 하고
//   뮤테이션 변수에는 암호문만 들어간다. 추가 인증 동안만 hook이 암호문을 들고 있고 결과·실패·이탈에서 reset으로 버린다.
// - 결과(가맹점·금액·itemToken)는 이 컴포넌트 state에만 둔다(쿼리 캐시·URL·history state·저장소에 넣지 않는다). 나가거나 저장하면 버린다.
// - 오류 화면은 우리 문구만 쓴다(CODEF·카드사 원문 메시지를 보이지 않는다).

type Step = 'login' | 'two-way' | 'loading' | 'result' | 'empty' | 'error'
type Range = { from: string; to: string }

export default function FlowPage() {
  const { issuer = '' } = useParams()
  const flow = useFlowNav()
  const flowGo = useRef(flow.go)
  useEffect(() => {
    flowGo.current = flow.go
  })
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const config = useCardImportConfig()
  const fetcher = useFetchCardApprovals()
  const importer = useImportWalletEntries()
  const trips = useMyTrips()

  // 카드번호 입력칸이 아직 없으면 현대·하나는 고를 수 없다(visibleOrganizations — 주소로 바로 와도 같다)
  const org = config.data ? visibleOrganizations(config.data.organizations).find((o) => o.code === issuer) : undefined
  const today = kst(clock.now()).date
  const limits = org ? rangeLimits(org, today) : null

  const [step, setStep] = useState<Step>('login')
  const [loginId, setLoginId] = useState('')
  const [password, setPassword] = useState('')
  const passwordRef = useRef<HTMLInputElement>(null)
  const [rangePick, setRangePick] = useState<Range | null>(null)
  const range = rangePick ?? (config.data && limits ? clipRange(config.data.defaultRange, limits) : null)
  const [rangeOpen, setRangeOpen] = useState(false)
  const [rangeError, setRangeError] = useState<string | null>(null)
  const [loginError, setLoginError] = useState<string | null>(null)
  const [cooldownUntil, setCooldownUntil] = useState<string | null>(null)
  const [twoWay, setTwoWay] = useState<{ token: string; deadline: number } | null>(null)
  const [code, setCode] = useState('')
  const [codeError, setCodeError] = useState(false)
  // 시간 초과(확인 비활성)와 WF-54b 다이얼로그 열림은 따로 둔다 — "취소"는 다이얼로그만 닫는다
  const [twoWayExpired, setTwoWayExpired] = useState(false)
  const [expiredDialog, setExpiredDialog] = useState(false)
  const [result, setResult] = useState<CardApprovalItem[] | null>(null)
  const [selected, setSelected] = useState<Set<string>>(() => new Set())
  const [failure, setFailure] = useState<{ kind: ErrorScreenKind; retryAfter?: string } | null>(null)
  const [leaveOpen, setLeaveOpen] = useState(false)
  const [expiredOpen, setExpiredOpen] = useState(false)
  // 취소·이탈 뒤 늦게 온 응답을 버리는 세대 번호
  const generation = useRef(0)
  const leaving = useRef(false)

  const now = useNow(step === 'two-way')
  // 쿨다운(53c)은 해제 시각까지 — 시각이 지나면 에러 줄을 지우고 버튼을 살린다(백그라운드 복귀 때도 다시 계산)
  const locked = cooldownUntil !== null
  useEffect(() => {
    if (cooldownUntil === null) return
    const release = () => {
      if (Date.parse(cooldownUntil) <= Date.now()) setCooldownUntil(null)
    }
    const id = window.setTimeout(release, Math.max(0, Date.parse(cooldownUntil) - Date.now()) + 50)
    document.addEventListener('visibilitychange', release)
    return () => {
      window.clearTimeout(id)
      document.removeEventListener('visibilitychange', release)
    }
  }, [cooldownUntil])
  // 남은 시간은 제한 시간(160초)을 넘지 않는다(now가 단계 전환 직후 한 번 늦게 바뀌어도)
  const twoWayLimitMs = (config.data?.twoWayTimeoutSeconds ?? 160) * 1000
  const remainingMs = twoWay ? Math.min(twoWay.deadline - now, twoWayLimitMs) : 0
  // 남은 시간 0 → WF-54b
  useEffect(() => {
    if (step !== 'two-way' || !twoWay || twoWayExpired) return
    const expire = () => {
      setTwoWayExpired(true)
      setExpiredDialog(true)
    }
    const id = window.setTimeout(expire, Math.max(0, twoWay.deadline - Date.now()))
    return () => window.clearTimeout(id)
  }, [step, twoWay, twoWayExpired])

  // 진행 중 조회를 끊는다(취소·이탈). 서버 쪽 CODEF 호출은 계속될 수 있고, 화면은 응답을 버린다(세대 번호)
  const abort = useRef<AbortController | null>(null)
  const cancelRequest = useCallback(() => {
    generation.current += 1
    abort.current?.abort()
    abort.current = null
  }, [])

  // 화면을 떠나면 진행 중 요청을 끊고 암호문을 버린다(reset은 바뀌지 않는 함수). 결과 state는 컴포넌트와 함께 사라진다
  const resetFetcher = fetcher.reset
  useEffect(
    () => () => {
      cancelRequest()
      resetFetcher()
    },
    [cancelRequest, resetFetcher],
  )

  // bfcache: 페이지를 떠날 때(pagehide) 메모리의 아이디·비밀번호·결과·itemToken을 비우고,
  // 뒤로 가기로 복원되면(pageshow persisted) 처음(로그인 전)부터 다시 시작한다
  useEffect(() => {
    // bfcache로 얼기 전에 화면에서도 지워지도록 동기로 렌더한다
    const wipe = () => flushSync(wipeState)
    const wipeState = () => {
      cancelRequest()
      resetFetcher()
      setLoginId('')
      setPassword('')
      setTwoWay(null)
      setCode('')
      setResult(null)
      setSelected(new Set())
      setFailure(null)
      setLeaveOpen(false)
      setExpiredOpen(false)
      setExpiredDialog(false)
      setStep('login')
    }
    const onShow = (event: PageTransitionEvent) => {
      if (event.persisted) {
        wipe()
        flowGo.current(paths.walletImport())
      }
    }
    window.addEventListener('pagehide', wipe)
    window.addEventListener('pageshow', onShow)
    return () => {
      window.removeEventListener('pagehide', wipe)
      window.removeEventListener('pageshow', onShow)
    }
  }, [cancelRequest, resetFetcher])

  // WF-53이 다시 보일 때마다 남은 횟수(remainingToday)를 새로 받는다
  const prevStep = useRef<Step>(step)
  const refetchConfig = config.refetch
  useEffect(() => {
    if (step === 'login' && prevStep.current !== 'login') void refetchConfig()
    prevStep.current = step
  }, [step, refetchConfig])

  // 결과 화면에서 브라우저 뒤로 가기 → WF-56c
  const blocker = useBlocker(useCallback(() => step === 'result' && !leaving.current, [step]))
  const leaveDialogOpen = leaveOpen || blocker.state === 'blocked'

  /** 처음 입력으로(아이디·기간 유지, 비밀번호·암호문·결과는 버림) */
  const backToLogin = (options: { openRange?: boolean } = {}) => {
    cancelRequest()
    fetcher.reset()
    setPassword('')
    setTwoWay(null)
    setCode('')
    setCodeError(false)
    setTwoWayExpired(false)
    setExpiredDialog(false)
    setResult(null)
    setSelected(new Set())
    setFailure(null)
    setExpiredOpen(false)
    setStep('login')
    if (options.openRange) setRangeOpen(true)
  }

  const onResponse = (res: FetchCardApprovalsResponse) => {
    if (res.status === 'TWO_WAY_REQUIRED') {
      const at = Date.now()
      const limit = (config.data?.twoWayTimeoutSeconds ?? 160) * 1000
      const left = Date.parse(res.expiresAt) - at
      // 기기 시계가 어긋나도 제한 시간(160초)을 넘기지 않는다
      setTwoWay({ token: res.twoWayToken, deadline: at + (Number.isFinite(left) ? Math.min(Math.max(left, 0), limit) : limit) })
      setCode('')
      setCodeError(false)
      setTwoWayExpired(false)
      setExpiredDialog(false)
      setStep('two-way')
      return
    }
    // 결과를 받으면 암호문은 바로 버린다
    fetcher.reset()
    setTwoWay(null)
    if (res.items.length === 0) return setStep('empty')
    setResult(res.items)
    setSelected(initialSelection(res.items))
    setStep('result')
  }

  const onFailure = (error: unknown) => {
    const f = classifyFetchError(error, Date.now())
    // 인증번호만 틀렸으면 같은 암호문으로 다시 보낸다. 그 밖에는 버린다(다시 하려면 비밀번호를 다시 받는다)
    if (f.to !== 'two-way-invalid') fetcher.reset()
    if (f.to !== 'two-way-invalid' && f.to !== 'two-way-expired') setTwoWay(null)
    switch (f.to) {
      case 'login-failed':
        setLoginError(f.attempts >= 2 ? COPY.loginLockWarning : COPY.loginFailed)
        return setStep('login')
      case 'card-number-invalid':
        setLoginError(COPY.cardNumberInvalid)
        return setStep('login')
      case 'card-password-invalid':
        setLoginError(f.attempts >= 1 ? COPY.cardPasswordLockWarning : COPY.cardPasswordInvalid)
        return setStep('login')
      case 'lock-risk-confirm':
        // 확인 다이얼로그(acknowledgeLockRisk)는 카드번호 입력칸(HF-53 변형)과 함께 붙인다
        setLoginError(COPY.cardPasswordLockWarning)
        return setStep('login')
      case 'login-cooldown':
        setCooldownUntil(f.until)
        return setStep('login')
      case 'error':
        setFailure({ kind: f.kind, retryAfter: f.retryAfter })
        return setStep('error')
      case 'in-progress':
        toast.info(COPY.inProgress)
        return setStep('login')
      case 'two-way-expired':
        setTwoWayExpired(true)
        setExpiredDialog(true)
        return setStep('two-way')
      case 'two-way-invalid':
        setCode('')
        setCodeError(true)
        return setStep('two-way')
      case 'encryption-invalid':
        // 공개키가 바뀌었을 수 있다 — config를 다시 받는다
        toast.error(COPY.later)
        void config.refetch()
        return setStep('login')
      case 'range':
        setRangeError(rangeErrorText(f.message, org?.maxRangeDays ?? 0))
        return setStep('login')
      case 'consent':
        void queryClient.invalidateQueries({ queryKey: cardImportKeys.config })
        return flow.go(paths.walletImport())
      case 'off':
        return void navigate(paths.wallet(), { replace: true })
      case 'retry-toast':
        toast.error(COPY.later)
        return setStep('login')
    }
  }

  /** 로딩 단계로 바꾸고 새 세대·AbortController를 연다 */
  const beginRequest = () => {
    cancelRequest()
    const controller = new AbortController()
    abort.current = controller
    setStep('loading')
    return { gen: generation.current, signal: controller.signal }
  }
  const settle = async (gen: number, request: Promise<FetchCardApprovalsResponse>) => {
    try {
      const res = await request
      if (gen === generation.current) onResponse(res)
    } catch (error) {
      if (gen === generation.current) onFailure(error)
    }
  }

  const submit = () => {
    if (!org || !range || !config.data || locked || step !== 'login') return
    // 동의가 없으면 자격 증명을 보내지 않고 WF-51로
    if (!config.data.consent.valid) return flow.go(paths.walletImport())
    const id = loginId.trim()
    if (!id || !password) return
    // 원문은 입력 state에서 바로 비우고, 먼저 암호화한 뒤 암호문 요청만 보낸다(원문은 이 함수의 지역 변수로 암호화까지만 산다)
    const secret = password
    setPassword('')
    setLoginError(null)
    setRangeError(null)
    const { gen, signal } = beginRequest()
    const input = { publicKey: config.data.publicKey, organization: org.code, loginId: id, password: secret, from: range.from, to: range.to }
    void buildFetchRequest(input).then(
      (request) => {
        // 암호화하는 사이에 취소·이탈했으면 요청도 기억도 남기지 않는다
        if (gen !== generation.current || signal.aborted) return
        return settle(gen, fetcher.start(request, signal))
      },
      (error: unknown) => {
        if (gen === generation.current) onFailure(error)
      },
    )
  }

  const submitCode = () => {
    if (!twoWay || !code || twoWayExpired) return
    setCodeError(false)
    const twoWayInput = { token: twoWay.token, code }
    const { gen, signal } = beginRequest()
    void settle(gen, fetcher.continueTwoWay(twoWayInput, signal))
  }

  const add = () => {
    if (!result || importer.isPending) return
    const items: ImportWalletEntryItem[] = result.flatMap((i) =>
      selected.has(i.importKey) && i.selectable && i.itemToken
        ? [
            {
              importKey: i.importKey,
              itemToken: i.itemToken,
              occurredAt: i.approvedAt,
              amount: i.amount,
              currency: i.currency,
              merchantName: i.merchantName,
              krwAmount: i.krwAmount,
            },
          ]
        : [],
    )
    if (items.length === 0) return
    importer.mutate(items, {
      onSuccess: (res) => {
        leaving.current = true
        setResult(null)
        setSelected(new Set())
        toast.success(COPY.added(res.created))
        flow.exit()
      },
      onError: (error) => {
        if (isApiError(error) && error.code === 'CARD_IMPORT_RESULT_EXPIRED') setExpiredOpen(true)
        else toast.error(COPY.later)
      },
    })
  }

  const leave = () => {
    leaving.current = true
    setLeaveOpen(false)
    setResult(null)
    setSelected(new Set())
    if (blocker.state === 'blocked') blocker.proceed()
    else flow.exit()
  }
  const stay = () => {
    setLeaveOpen(false)
    if (blocker.state === 'blocked') blocker.reset()
  }

  if (isApiError(config.error) && config.error.code === 'NOT_FOUND') return <Navigate replace to={paths.wallet()} />
  // 동의가 없으면(철회·재동의 필요) 자격 증명을 받지 않고 WF-51로
  if (config.data && !config.data.consent.valid) {
    return <Navigate replace to={paths.walletImport()} state={flow.navState()} />
  }
  if (config.data && !org) {
    return <Navigate replace to={paths.walletImportIssuer()} state={flow.navState()} />
  }
  if (!org || !limits || !range || !config.data) {
    return (
      <ShellSub header={{ onBack: () => flow.go(paths.walletImportIssuer()) }}>
        <LoadingScreen inset />
      </ShellSub>
    )
  }

  const tripName = (tripId: string) => trips.data?.items.find((t) => t.tripId === tripId)?.groupName

  switch (step) {
    case 'two-way':
      return (
        <>
          <TwoWayStep
            code={code}
            onCode={(value) => {
              setCode(value)
              setCodeError(false)
            }}
            error={codeError}
            remainingMs={remainingMs}
            expired={twoWayExpired}
            onBack={() => backToLogin()}
            onSubmit={submitCode}
          />
          {/* WF-54b 시간 초과 */}
          <Dialog
            open={expiredDialog}
            title={COPY.twoWayExpiredTitle}
            message={COPY.twoWayExpiredMessage}
            confirmLabel={COPY.again}
            onCancel={() => {
              // 다이얼로그만 닫는다(확인은 꺼진 채, 이어 보낼 수 없으니 암호문은 버린다) — ‹로 WF-53
              setExpiredDialog(false)
              fetcher.reset()
            }}
            onConfirm={() => backToLogin()}
          />
        </>
      )
    case 'loading':
      return <LoadingStep orgName={org.name} onCancel={() => backToLogin()} />
    case 'result':
      return (
        <>
          <ResultStep
            orgName={org.name}
            items={result ?? []}
            selected={selected}
            onToggle={(key) =>
              setSelected((prev) => {
                const next = new Set(prev)
                if (next.has(key)) next.delete(key)
                else next.add(key)
                return next
              })
            }
            onToggleAll={() => setSelected((prev) => toggleAll(result ?? [], prev))}
            tripName={tripName}
            saving={importer.isPending}
            onBack={() => setLeaveOpen(true)}
            onAdd={add}
          />
          {/* WF-56c 나가기 확인 */}
          <Dialog
            open={leaveDialogOpen}
            type="danger"
            title={COPY.leaveTitle}
            message={COPY.leaveMessage}
            confirmLabel={COPY.leave}
            onCancel={stay}
            onConfirm={leave}
          />
          {/* WF-56e 결과 만료 */}
          <Dialog
            open={expiredOpen}
            title={COPY.expiredTitle}
            message={COPY.expiredMessage}
            confirmLabel={COPY.refetch}
            onCancel={() => setExpiredOpen(false)}
            onConfirm={() => backToLogin()}
          />
        </>
      )
    case 'empty':
      return <EmptyStep orgName={org.name} onBack={() => backToLogin()} onManual={flow.manual} onChangeRange={() => backToLogin({ openRange: true })} />
    case 'error':
      return (
        <ImportErrorScreen
          kind={failure?.kind ?? 'unavailable'}
          title={org.name}
          orgName={org.name}
          retryAt={failure?.retryAfter ? kstClock(failure.retryAfter) : undefined}
          onBack={failure?.kind === 'daily' ? flow.exit : () => backToLogin()}
          onManual={flow.manual}
          onRetry={() => backToLogin()}
        />
      )
    default:
      return (
        <LoginStep
          org={org}
          loginId={loginId}
          onLoginId={setLoginId}
          password={password}
          onPassword={(value) => {
            setPassword(value)
            // 다시 입력을 시작하면 로그인 실패 줄은 사라진다(쿨다운 줄은 해제 시각까지 남는다)
            setLoginError(null)
          }}
          passwordRef={passwordRef}
          range={range}
          limits={limits}
          today={today}
          onRange={(next) => {
            setRangePick(next)
            setRangeError(null)
          }}
          rangeOpen={rangeOpen}
          onRangeOpen={setRangeOpen}
          rangeError={rangeError}
          error={cooldownUntil ? COPY.cooldown(kstClock(cooldownUntil)) : loginError}
          locked={locked}
          remaining={config.data.remainingToday}
          onBack={() => flow.go(paths.walletImportIssuer())}
          onSubmit={submit}
        />
      )
  }
}

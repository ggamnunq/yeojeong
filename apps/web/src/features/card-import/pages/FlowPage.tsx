import { useQueryClient } from '@tanstack/react-query'
import {
  isValidCardNumber,
  type CardApprovalItem,
  type FetchCardApprovalsRequest,
  type FetchCardApprovalsResponse,
  type ImportWalletEntryItem,
} from '@yeojeong/shared'
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
import { cardNumberDigits, useCardSecrets } from '../cardLogin'
import { ImportErrorScreen, LockedScreen, TwoLines } from '../components'
import { COPY } from '../copy'
import { useFlowNav } from '../flow'
import { buildFetchRequest, useAckCardLockout, useCardImportConfig, useFetchCardApprovals, useImportWalletEntries } from '../hooks'
import {
  classifyFetchError,
  classifyLockoutAckError,
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
// - 현대·하나(WF-53h, v0.7.6 보정): 카드번호는 useCardSecrets(메모리)에 두고 로그인·불러오는 중·HF-57h 단계 동안만 남긴다(실패 뒤 다시
//   입력하지 않게). 카드 비밀번호는 제출 즉시 비운다. 그 밖 단계(결과·0건·오류)로 가거나 화면을 떠나면(unmount·pagehide) 둘 다 비운다.
//   잠김 위험: 첫 실패 뒤 다시 조회하면 HF-53hd로 확인받고 acknowledgeLockRisk: true로 보낸다. 2회째 실패(429 CARD_IMPORT_LOGIN_LOCKED)는
//   HF-57h — "확인했어요"(lockout/ack) 뒤 HF-53h로.

type Step = 'login' | 'two-way' | 'loading' | 'result' | 'empty' | 'error' | 'locked'
type CardError = { field: 'number' | 'password'; text: string }
/** 카드번호를 남기는 단계(WF-53h · 불러오는 중 · HF-57h). 그 밖으로 가면 비운다 */
const CARD_NUMBER_STEPS: ReadonlySet<Step> = new Set<Step>(['login', 'loading', 'locked'])
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
  const lockoutAck = useAckCardLockout()
  const trips = useMyTrips()

  // config에 있는 카드사만(visibleOrganizations — 주소로 바로 와도 같다. 서버 CARD_NUMBER_LOGIN이 꺼져 있으면 현대·하나가 없다)
  const org = config.data ? visibleOrganizations(config.data.organizations).find((o) => o.code === issuer) : undefined
  const today = kst(clock.now()).date
  const limits = org ? rangeLimits(org, today) : null
  const cardLogin = org?.requiresCardNo === true && (org.cardPasswordDigits ?? 0) > 0
  const secrets = useCardSecrets(org?.code, org)
  const cardNumberRef = useRef<HTMLInputElement>(null)
  const focusCardNumber = useRef(false)
  const [cardError, setCardError] = useState<CardError | null>(null)
  // 잠김 위험(현대·하나): 이 화면에서 실패를 한 번 본 뒤면 다음 조회 전에 HF-53hd로 확인받는다
  const [lockRisk, setLockRisk] = useState(false)
  const [lockRiskOpen, setLockRiskOpen] = useState(false)
  // 409 CARD_LOCK_RISK_CONFIRM_REQUIRED(서버만 실패를 알고 있었다 — CODEF는 부르지 않음): 방금 보낸 암호문 요청을 확인받는 동안만 둔다
  const riskRequest = useRef<FetchCardApprovalsRequest | null>(null)
  const [ackBlocked, setAckBlocked] = useState(false)

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

  // 카드번호는 WF-53h · 불러오는 중 · HF-57h 동안만 남긴다(조회 성공 → 결과·0건, 오류 화면으로 가면 비운다)
  const clearSecrets = secrets.clear
  useEffect(() => {
    if (!CARD_NUMBER_STEPS.has(step)) {
      clearSecrets()
      riskRequest.current = null
    }
  }, [step, clearSecrets])
  // CARD_NUMBER_INVALID로 돌아오면 카드번호 칸에 포커스(값은 유지 — 포커스하면 전체 번호가 보인다)
  useEffect(() => {
    if (step === 'login' && focusCardNumber.current) {
      focusCardNumber.current = false
      cardNumberRef.current?.focus()
    }
  }, [step, cardError])

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
      setLockRiskOpen(false)
      setCardError(null)
      riskRequest.current = null
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
    secrets.clearCardPassword()
    riskRequest.current = null
    setLockRiskOpen(false)
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

  /** request = 방금 보낸 요청(현대·하나만 — 409 확인 필요면 확인받는 동안 둔다) */
  const onFailure = (error: unknown, request?: FetchCardApprovalsRequest) => {
    const f = classifyFetchError(error, Date.now())
    // 현대·하나: 카드 비밀번호는 실패하면 비운다(이미 제출 때 비웠다 — 혹시 남았으면). 서버가 센 실패(attempts ≥ 1)면 다음 조회 전에 확인받는다
    if (cardLogin) {
      secrets.clearCardPassword()
      if ((f.to === 'login-failed' || f.to === 'card-number-invalid' || f.to === 'card-password-invalid') && f.attempts >= 1) setLockRisk(true)
    }
    // 인증번호만 틀렸으면 같은 암호문으로 다시 보낸다. 그 밖에는 버린다(다시 하려면 비밀번호를 다시 받는다)
    if (f.to !== 'two-way-invalid') fetcher.reset()
    if (f.to !== 'two-way-invalid' && f.to !== 'two-way-expired') setTwoWay(null)
    switch (f.to) {
      case 'login-failed':
        setLoginError(f.attempts >= 2 ? COPY.loginLockWarning : COPY.loginFailed)
        return setStep('login')
      case 'card-number-invalid':
        // 카드번호 칸 Error + 값 유지 + 그 칸 포커스(WF-53h 실패)
        setCardError({ field: 'number', text: COPY.cardNumberInvalid })
        focusCardNumber.current = true
        return setStep('login')
      case 'card-password-invalid':
        // WF-53hb: 카드 비밀번호 칸 Error + 비움, 1회째는 잠김 경고
        setCardError({ field: 'password', text: f.attempts === 1 ? COPY.cardPasswordLockWarning : COPY.cardPasswordInvalid })
        return setStep('login')
      case 'login-locked':
        // HF-57h: 카드사 홈페이지에서 확인 → "확인했어요"(lockout/ack). 카드번호는 흐름 메모리에 남긴다
        setLoginError(null)
        setCardError(null)
        setLockRisk(false)
        setAckBlocked(false)
        return setStep('locked')
      case 'lock-risk-confirm':
        // 서버만 실패를 알고 있었다(CODEF는 부르지 않음) → HF-53hd. "다시 시도"면 같은 암호문 요청을 acknowledgeLockRisk로 다시 보낸다
        riskRequest.current = request ?? null
        setLockRisk(true)
        setLockRiskOpen(true)
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
  const settle = async (gen: number, response: Promise<FetchCardApprovalsResponse>, request?: FetchCardApprovalsRequest) => {
    try {
      const res = await response
      if (gen === generation.current) onResponse(res)
    } catch (error) {
      if (gen === generation.current) onFailure(error, request)
    }
  }

  /** acknowledgeLockRisk = HF-53hd "다시 시도"로 확인받았다(현대·하나만 요청에 넣는다) */
  const submit = (acknowledgeLockRisk = false) => {
    if (!org || !range || !config.data || locked || step !== 'login') return
    // 동의가 없으면 자격 증명을 보내지 않고 WF-51로
    if (!config.data.consent.valid) return flow.go(paths.walletImport())
    const id = loginId.trim()
    if (!id || !password) return
    // 현대·하나: 첫 실패 뒤면 보내기 전에 HF-53hd로 확인받는다(입력값은 그대로 둔다)
    if (cardLogin && lockRisk && !acknowledgeLockRisk) return setLockRiskOpen(true)
    // 원문은 입력 state에서 바로 비우고, 먼저 암호화한 뒤 암호문 요청만 보낸다(원문은 이 함수의 지역 변수로 암호화까지만 산다).
    // 카드 비밀번호도 바로 비우고, 카드번호는 복사만 한다(WF-53h에 머무는 동안 남긴다)
    const secret = password
    const card = cardLogin ? secrets.takeForSubmit() : null
    setPassword('')
    setLoginError(null)
    setCardError(null)
    setRangeError(null)
    setLockRiskOpen(false)
    riskRequest.current = null
    const { gen, signal } = beginRequest()
    const input = {
      publicKey: config.data.publicKey,
      organization: org.code,
      loginId: id,
      password: secret,
      from: range.from,
      to: range.to,
      ...(card ? { rule: org, cardNumber: card.cardNumber, cardPassword: card.cardPassword, acknowledgeLockRisk } : {}),
    }
    void buildFetchRequest(input).then(
      (request) => {
        // 암호화하는 사이에 취소·이탈했으면 요청도 기억도 남기지 않는다
        if (gen !== generation.current || signal.aborted) return
        return settle(gen, fetcher.start(request, signal), card ? request : undefined)
      },
      (error: unknown) => {
        if (gen === generation.current) onFailure(error)
      },
    )
  }

  /** HF-53hd "다시 시도": 409로 돌아온 요청이 있으면 그 암호문 그대로 acknowledgeLockRisk로, 아니면 지금 입력으로 */
  const confirmLockRisk = () => {
    const request = riskRequest.current
    riskRequest.current = null
    setLockRiskOpen(false)
    if (!request) return submit(true)
    if (!org || locked || step !== 'login') return
    const { gen, signal } = beginRequest()
    const acknowledged = { ...request, acknowledgeLockRisk: true }
    void settle(gen, fetcher.start(acknowledged, signal), acknowledged)
  }
  const cancelLockRisk = () => {
    riskRequest.current = null
    setLockRiskOpen(false)
  }

  /** HF-57h "확인했어요" → POST /card-import/lockout/ack(기관 코드만). 결과별 처리(디자인 10-30) */
  const ackLockout = () => {
    if (!org || lockoutAck.isPending || ackBlocked) return
    lockoutAck.mutate(org.code, {
      // 204 · 409 필요 없음 → HF-53h(아이디·카드번호 유지, 비밀번호·카드 비밀번호 비움)
      onSuccess: () => backToLogin(),
      onError: (error) => {
        const f = classifyLockoutAckError(error, Date.now())
        switch (f.to) {
          case 'not-needed':
            return backToLogin()
          case 'too-early':
            return void toast.info(COPY.ackTooEarly(kstClock(f.retryAfter)))
          case 'daily-limit':
            setAckBlocked(true)
            return void toast.error(COPY.ackDaily)
          case 'retry-toast':
            return void toast.error(COPY.later)
        }
      },
    })
  }

  /** 카드번호 칸을 떠날 때: 자리수(16)는 찼는데 형식(Luhn)이 틀리면 안내(서버 CARD_NUMBER_INVALID와 같은 문구) */
  const checkCardNumber = () => {
    const digits = cardNumberDigits(secrets.cardNumber)
    if (digits.length >= 16 && !isValidCardNumber(digits)) setCardError({ field: 'number', text: COPY.cardNumberInvalid })
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
    case 'locked':
      return (
        <LockedScreen
          org={org}
          acking={lockoutAck.isPending}
          ackDisabled={ackBlocked}
          onBack={() => backToLogin()}
          onManual={flow.manual}
          onAck={ackLockout}
        />
      )
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
        <>
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
            card={
              cardLogin
                ? {
                    digits: org.cardPasswordDigits ?? 0,
                    cardNumber: secrets.cardNumber,
                    onCardNumber: (value) => {
                      secrets.setCardNumber(value)
                      // 다시 입력을 시작하면 에러 줄은 사라진다
                      setCardError(null)
                    },
                    onCardNumberBlur: checkCardNumber,
                    cardPassword: secrets.cardPassword,
                    onCardPassword: (value) => {
                      secrets.setCardPassword(value)
                      setCardError(null)
                    },
                    cardNumberRef,
                    error: cardError,
                  }
                : undefined
            }
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
            onSubmit={() => submit()}
          />
          {/* HF-53hd 1회 실패 뒤 다시 조회(현대·하나) — 취소 = 입력 화면 유지 */}
          <Dialog
            open={lockRiskOpen}
            title={<TwoLines lines={COPY.lockRiskTitle} />}
            message={COPY.lockRiskMessage(org.name)}
            confirmLabel={COPY.retry}
            onCancel={cancelLockRisk}
            onConfirm={confirmLockRisk}
          />
        </>
      )
  }
}

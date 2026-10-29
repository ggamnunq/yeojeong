import {
  ArrowRightLeft,
  Bell,
  CalendarDays,
  ChartPie,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  CircleCheck,
  Clock3,
  Coins,
  Copy,
  CreditCard,
  Crown,
  Ellipsis,
  Eye,
  EyeOff,
  Funnel,
  House,
  Info,
  Landmark,
  Link2,
  List,
  LockKeyhole,
  LogOut,
  Map as MapIcon,
  MapPin,
  Menu,
  Minus,
  Pencil,
  PlaneTakeoff,
  Plus,
  QrCode,
  ReceiptText,
  RefreshCw,
  Route,
  Search,
  Settings,
  Share2,
  Trash2,
  TriangleAlert,
  User,
  UserPlus,
  Users,
  WalletMinimal,
  X,
  type LucideIcon,
} from 'lucide-react'

// Figma `Icon/<이름>`(Icons8 Fluency Systems Regular) → lucide 아이콘. 키는 Figma 이름 그대로. v1.4에 chevron-up·crown, v1.7에 eye·eye-off, W8에 qr-code 추가(47종).
export const ICONS = {
  'chevron-down': ChevronDown,
  'chevron-right': ChevronRight,
  'chevron-left': ChevronLeft,
  close: X,
  plus: Plus,
  minus: Minus,
  check: Check,
  'check-circle': CircleCheck,
  alert: TriangleAlert,
  info: Info,
  wallet: WalletMinimal,
  user: User,
  users: Users,
  'user-add': UserPlus,
  receipt: ReceiptText,
  map: MapIcon,
  route: Route,
  calendar: CalendarDays,
  marker: MapPin,
  clock: Clock3,
  lock: LockKeyhole,
  copy: Copy,
  share: Share2,
  link: Link2,
  edit: Pencil,
  trash: Trash2,
  search: Search,
  filter: Funnel,
  settings: Settings,
  more: Ellipsis,
  bell: Bell,
  logout: LogOut,
  exchange: ArrowRightLeft,
  card: CreditCard,
  bank: Landmark,
  coins: Coins,
  'pie-chart': ChartPie,
  list: List,
  airplane: PlaneTakeoff,
  home: House,
  refresh: RefreshCw,
  menu: Menu,
  // v1.4: 펼친 그룹 드롭다운(TopHeader Dropdown=Open) · 그룹장 왕관(Row/Member Leader)
  'chevron-up': ChevronUp,
  crown: Crown,
  // v1.7: 비밀번호 보기 토글(Input Type=Password) — 가려진 상태 eye · 보이는 상태 eye-off
  eye: Eye,
  'eye-off': EyeOff,
  // W8: 초대 QR 시트를 여는 버튼(HF-11·16·23 초대코드 「복사」 옆). Figma 아이콘 세트에 추가 예정
  'qr-code': QrCode,
} as const satisfies Record<string, LucideIcon>

export type IconName = keyof typeof ICONS

export const ICON_NAMES = /* @__PURE__ */ Object.keys(ICONS) as IconName[]

/**
 * 아이콘별 정사각 viewBox `[x, y, 한 변]`(lucide 24 그리드 단위). spec §6 v1.5 아이콘 규칙.
 *
 * Figma `Icon/*`(Icons8 Fluency Systems Regular PNG)은 박스를 여백 없이 채우고 그림이 박스의 75~85%(24에서 약 18~22)를 차지한다.
 * lucide는 아이콘마다 그림 크기가 달라(chevron 6×12, circle 20×20) 같은 박스에 두면 작거나 크게 보인다.
 * 그래서 아이콘마다 lucide 그림(획 제외 bbox)을 Icons8 그림 bbox(획 1.5 포함)에 맞추는 viewBox를 미리 계산해 두었다:
 * 긴 변 배율 s = (Icons8 긴 변 − 1.5) / lucide 긴 변, 그림 중심 = Icons8 중심, 한 변 = 24 / s.
 * (Figma 02 아이콘 그리드 24:3870을 4배로 내보내 bbox를 재고, lucide는 헤드리스 Chromium getBBox()로 쟀다.)
 * 아이콘을 추가하면 같은 방법으로 값을 넣는다. 없으면 기본 `0 0 24 24`.
 */
export const ICON_VIEWBOX: Record<IconName, readonly [x: number, y: number, size: number]> = {
  'chevron-down': [4.62, 4.85, 14.77],
  'chevron-right': [3.31, 4.62, 14.77],
  'chevron-left': [4.38, 4.62, 14.77],
  close: [2.71, 2.71, 18.58],
  plus: [2.4, 2.4, 19.2],
  minus: [2.4, 2.4, 19.2],
  check: [2.15, 1.65, 19.69],
  'check-circle': [-0.97, -0.97, 25.95],
  alert: [-0.99, -0.72, 25.97],
  info: [-0.97, -0.97, 25.95],
  wallet: [-1.09, -1.09, 26.18],
  user: [0.32, 0.32, 23.35],
  users: [-0.97, -1.51, 25.95],
  'user-add': [0.17, 0.29, 23.41],
  receipt: [-1.72, -1.15, 27.44],
  map: [-1.09, -1.09, 26.18],
  route: [-0.97, -0.97, 25.95],
  calendar: [-1.82, -2.32, 27.64],
  marker: [-0.97, -0.97, 25.95],
  clock: [-0.97, -0.97, 25.95],
  lock: [-0.97, -0.97, 25.95],
  copy: [-1.71, -1.71, 27.43],
  share: [-1.71, -1.71, 27.43],
  link: [0.29, 0.29, 23.41],
  edit: [-1.71, -1.71, 27.43],
  trash: [-0.97, -0.97, 25.95],
  search: [-1.09, -1.09, 26.18],
  filter: [-2.54, -2.04, 29.09],
  settings: [-0.95, -0.95, 25.9],
  more: [2.86, 2.86, 18.29],
  bell: [-0.97, -0.97, 25.95],
  logout: [-1.09, -1.09, 26.18],
  exchange: [0.32, 0.32, 23.35],
  card: [0.29, 0.29, 23.41],
  bank: [-2.54, -2.85, 29.09],
  coins: [-0.97, -0.97, 25.94],
  'pie-chart': [-0.89, -0.32, 25.21],
  list: [-0.34, -0.34, 24.69],
  airplane: [-0.98, 0.95, 25.98],
  home: [-0.67, -0.9, 25.33],
  refresh: [-0.34, -0.34, 24.69],
  menu: [1.62, 1.62, 20.76],
  'chevron-up': [4.62, 4.38, 14.77],
  crown: [0.3, 0.3, 23.41],
  // v1.7 Icon/eye(114:15059) · eye-off(114:15073): Figma 자체 벡터 bbox(선 포함) 20.5×14.5 · 20.5×18.5, 중심 (12.5, 12.5) · (12.5, 12)
  eye: [-1.16, -1.16, 25.26],
  'eye-off': [-1.16, -0.63, 25.26],
  // lucide qr-code 그림 18×18(3~21) → copy와 같은 Icons8 긴 변 19(획 포함)에 맞춤: s = 17.5/18, 중심 (12, 12)
  'qr-code': [-0.34, -0.34, 24.69],
}

/**
 * 시각 선 두께 = 박스 크기 / 16 (24 → 1.5px · 20 → 1.25px · 16 → 1.0px, spec §6).
 * viewBox 한 변이 V면 1 user unit = 박스/V px이므로 stroke-width(user unit) = V / 16 — 박스 크기와 무관한 상수라
 * `vector-effect` 없이 CSS로 크기를 바꿔도(예: `size-4.5`) 같은 비율이 유지된다.
 */
export const ICON_STROKE_RATIO = 1 / 16

export const iconStrokeWidth = (viewBoxSize: number) => Math.round(viewBoxSize * ICON_STROKE_RATIO * 1000) / 1000

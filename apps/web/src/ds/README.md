# 디자인 시스템 (`src/ds`)

Figma 「여정」 v1.6.3 디자인 시스템을 코드로 옮긴 것. 원본 문서(`docs/design/`)는 로컬 전용이라 레포에는 없다. v1.6 추가분은 아래 「v1.6 추가분 → 화면 교체 대응표」, v1.6.2(DS17)는 「v1.6.2 추가분」, v1.6.3(DS18 · 수동 결제)은 「v1.6.3 추가분」.

## 토큰

- 원본: `design-tokens/tokens.json` 하나(`docs/design/design-system/tokens.json` v1.4 사본). `palette`·`roles`·`size`(Figma 변수) + `typography`(텍스트 스타일 18종) · `typography_rules` · `elevation`(이펙트 스타일) · `meta`. v1.3까지 따로 두던 `styles.json`은 없앴다.
- 서체 폴백 스택은 tokens.json에 없어서(서체 이름만 있음) `scripts/gen-tokens.mjs`의 `FONT_FAMILIES`가 Figma 서체 이름 → `--font-sans`·`--font-amount` 스택을 정한다. 새 서체가 tokens.json에 나오면 생성기가 실패하니 여기에 추가한다. `tabularNums`는 `font-amount`(IBM Plex Sans KR)에서만 허용한다.
- 그림자 색은 hex로 오는데, 팔레트에 같은 색이 있으면 불투명은 `var(--color-…)`, 반투명은 `rgb(r g b / a)`로 바꾼다. `typography_rules`는 해당 텍스트 스타일 옆 주석으로 남는다.
- `pnpm --filter @yeojeong/web ds:tokens` → `src/styles/tokens.css`(Tailwind `@theme`) 생성. `docs/design`이 있으면 tokens.json을 먼저 복사해 온다. 생성 파일은 커밋한다.
- `ds:tokens:check`는 CI에서 생성 결과와 커밋된 파일이 다르면 실패한다. tokens.css는 손으로 고치지 않는다. `scripts/__fixtures__/tokens-v1.3.css`(v1.3 생성 결과 고정 사본)와 비교하는 테스트가 기존 선언의 이름·값이 바뀌지 않았음을 보장한다.
- Tailwind 기본 색·글자 크기·라운드·그림자는 지웠다. 토큰에 없는 값은 쓸 수 없다.

| Figma                                                                 | CSS 변수                                       | 유틸                                                                |
| --------------------------------------------------------------------- | ---------------------------------------------- | ------------------------------------------------------------------- |
| `primary/500`                                                         | `--color-primary-500`                          | `bg-primary-500` (팔레트는 되도록 역할 토큰으로)                    |
| `bg/canvas` · `text/secondary` · `border/default`                     | `--color-bg-canvas` …                          | `bg-canvas` · `text-secondary` · `border-default` (짧은 이름)       |
| 그 밖의 역할 `icon/default` · `expense/shared/bg` · `trip/active/dot` | `--color-icon-default` …                       | `text-icon-default` · `bg-expense-shared-bg` · `bg-trip-active-dot` |
| `radius/md`                                                           | `--radius-md`                                  | `rounded-md`                                                        |
| `Elevation/1` · `Focus/Ring`                                          | `--shadow-elevation-1` · `--shadow-focus-ring` | `shadow-elevation-1` · `focus-visible:shadow-focus-ring`            |
| `layout/gutter` 등                                                    | `--spacing-gutter`                             | `px-gutter` · `h-header-height` · `min-h-touch-min`                 |
| `space/20`                                                            | Tailwind 기본 4px 스케일                       | `p-5` (space/N = N/4)                                               |
| `Body/M Strong` · `Heading/H1`                                        | `--text-body-m-strong` · `--text-h1`           | `text-body-m-strong` · `text-h1` (크기·행간·자간·굵기 한 번에)      |
| `Amount/L`                                                            | `--text-amount-l` + `--font-amount`            | `font-amount text-amount-l` (`font-amount`에 tabular-nums 포함)     |
| `Amount/XL`(v1.4, 40/48 −1)                                           | `--text-amount-xl`                             | `font-amount text-amount-xl` — 화면당 영웅 숫자 1개만               |

예외: 카카오 버튼의 `#FEE500` · `#EDD500`(눌림) · 라벨 `#000 85%`는 카카오 가이드 고정값. Tag·Badge의 S 크기 글자(11px)는 Figma에 텍스트 스타일이 없어 `text-[11px]`을 쓴다. Amount/XL 영웅 숫자 옆 단위(원·엔)는 `typography_rules`대로 같은 줄에 24 SemiBold로 작게 쓰는데 텍스트 스타일이 없어 `font-amount text-[24px] leading-8 font-semibold`을 쓴다.

## 컴포넌트 규칙

- 폴더 하나에 컴포넌트 하나: `src/ds/<Name>/<Name>.tsx` + `<Name>.catalog.tsx`(+ 필요하면 `<Name>.test.tsx`). `src/ds/index.ts`에 export를 추가한다.
- 이름은 Figma와 1:1. 컴포넌트 이름 = Figma 세트 이름, prop 이름 = Figma 속성 이름의 camelCase, 값 = Figma 값의 소문자(kebab-case).
  - 예: `Type=Primary, Size=L` → `type="primary" size="l"`, `Leading icon` → `leadingIcon`, `Label` → `label`, `Count=2/3, Selected=Second` → `labels` 개수 + `selected="second"`.
  - `State=Pressed`는 CSS `:active`, `Focus`는 `:focus-visible`/`:focus-within`, `Disabled`는 `disabled` 속성으로. prop으로 받지 않는다.
  - HTML `type`과 겹치는 버튼류는 HTML 쪽을 `htmlType`으로 받는다.
- 스타일은 Tailwind 유틸 + 토큰만. raw hex·임의 색 금지. 클래스 합치기는 `clsx`.
- 접근성: 진짜 `<button>`/`<input>`, 라벨 연결, 아이콘만 있으면 `label`(aria-label) 필수, 포커스 링은 `styles.ts`의 `focusRing`, 보이는 크기가 44px보다 작으면 `touchTarget`으로 누르는 영역만 넓힌다.

## 레이아웃 · 오버레이

- 화면은 v1.4 셸로 조립한다(아래 「셸 사용 규칙」). `Screen`은 셸들이 공통으로 쓰는 레이아웃 틀(spec 7-1): `header` → 본문(`gutter` 좌우 20, 기본 on, `contentClassName`) → `cta`(BottomCTA: Primary L FILL 하나 또는 가로 2버튼) → `nav`(BottomNav). 390 폭 가운데 정렬. 스크롤은 문서가 하고 헤더·하단은 sticky. 셸에 맞지 않는 화면(스플래시)만 `Screen`을 직접 쓴다.
- 안전영역: `index.html`의 `viewport-fit=cover`가 있어야 `env(safe-area-inset-*)`가 잡힌다. 위는 Screen 헤더 자리, 아래는 BottomNav(없으면 CTA나 본문)와 BottomSheet가 채운다.
- `BottomSheet`·`Dialog`는 네이티브 `<dialog>.showModal()`(최상위 레이어 + 배경 inert) 위에 `useModalDialog`가 ESC·Tab 가두기·포커스 되돌리기·스크롤 잠금을 더한다. 열림 상태는 부모가 쥐고(`open`), 닫기 요청은 `onClose`/`onCancel`로만 알린다. 시트는 딤을 누르면 닫히고, 다이얼로그는 딤으로 닫히지 않는다.
- 모션은 시트 200ms·다이얼로그 150ms이고 `prefers-reduced-motion`이면 없다.
- 내용이 필요한 Figma BOOLEAN은 객체를 넘기면 켜진다: BottomSheet `CTA` → `cta={{ label, onClick }}`, Toast `Action` → `action={{ label, onClick }}`, TopHeader Back의 `action` 버튼. `Type=SharedToPersonal`처럼 붙어 있는 값은 kebab-case(`type="shared-to-personal"`).
- `Toast`는 겉모습만, `ToastViewport`는 자리(`anchor`: 내비 위 · CTA 위 · 안전영역 위 16)만 잡는다. 큐·타이머·자동 닫힘은 쓰는 쪽이 붙인다. 화면 코드는 `src/notifications`의 `toast.*`를 쓰고(`ToastHost`가 그린다) DS Toast를 직접 그리지 않는다. 사용법은 `src/api/README.md`.
- 카탈로그에서 열린 모습을 고정해 보여 줄 때는 `BottomSheetPanel`·`DialogPanel`·`PanelSidePanel`·`DropdownMenuPanel`(모달 동작 없는 겉모습)과 `catalog/PhoneFrame`을 쓴다. 화면 코드에서는 쓰지 않는다.

## 카탈로그

- `pnpm --filter @yeojeong/web catalog` → http://localhost:5173/catalog.html (`catalog:build`는 `dist-catalog/`로 따로 빌드).
- `**/*.catalog.tsx`가 `defineCatalog({ title, figma, group, order, Demo })`를 default export하면 `import.meta.glob`으로 자동 등록된다. 모든 변형을 Figma 세트 배치에 가깝게 보여 준다.
- 운영 빌드(`pnpm build`)는 `index.html`만 묶으므로 카탈로그는 `dist/`에 들어가지 않는다.
- `catalog.html?only=Shell/App`처럼 제목을 주면 그 항목만 그린다(헤드리스 브라우저로 찍어 Figma 스크린샷과 나란히 비교할 때).

## 아이콘

- `<Icon name="wallet" size={20} className="text-icon-default" />`. 이름은 Figma `Icon/<이름>` 44종(v1.4 `chevron-up`·`crown` 포함) 그대로, 실제 모양은 `Icon/icons.ts`의 lucide 매핑. 색은 `currentColor`다.
- v1.5 크기 규칙: 헤더·하단 내비·IconButton L/M = 24, 버튼 L/M·리스트·입력·토스트·콜아웃 = 20, 행 메타·Button S·동의 행 chevron·범례 = 16(태그 안은 12~14). 아이콘별 `viewBox`로 lucide 안전 여백을 보정해 그림이 박스의 약 75~85%를 채운다.
- 시각 선 두께는 박스 크기/16(24 → 1.5px, 20 → 1.25px, 16 → 1px). `Icon`이 보정한 viewBox 크기에 맞춰 `strokeWidth`를 계산하므로 사용처에서 덮어쓰지 않는다.
- 아이콘을 추가하려면 Figma 이름을 키로 `ICONS`에 넣고 `icons.test.ts`의 목록도 같이 고친다.
- `Brand/KakaoSymbol`은 카카오 공식 리소스 PNG(`Icon/kakao-symbol.png`)라 `KakaoSymbol`이 data URI 이미지로 그린다.

## 데이터 컴포넌트 (Figma v1.4 기준)

Avatar · AvatarStack · AvatarToggle · PaymentRow · DateHeader · TimelineItem · StatCard · BudgetProgress · MetricBar · SettlementRow · TransferRow · ListItem · Callout · EmptyState · RowConsent · SheetContent/Consent(`SheetContentConsent`) · SheetContent/PaymentDetail(`SheetContentPaymentDetail`) · Card/HeroTone(`CardHeroTone`) · Row/Tone(`RowTone`) · SheetContent/DateRange(`SheetContentDateRange`, v1.6) · Input Type=Picker(`InputPicker`, v1.6).

- **순수 로직은 `<Name>/rules.ts`**(프사 폴백·스택 overflow·예산 상태·정산 부호·1인 금액). 컴포넌트 파일에는 컴포넌트만 둔다(fast refresh). 테스트는 rules 위주.
- **사람 한 명 = `AvatarPerson`**(`name`·`src`·`source`·`color`·`joinOrder`·`me`·`left`). 행·스택·토글은 이 모양을 받는다. 스택 순서는 넘긴 배열 그대로(나 먼저 → 가입 순).
- **프사 규칙(spec 7-2)**: `src`가 있으면 사진 → 없으면 「여정」 기본 이미지(`Avatar/default-image.svg`, Figma `Avatar/DefaultImage` Color=Gray를 SVG로 내보낸 것) → 사진 로딩 실패(`onError`)면 이니셜. 이니셜 색은 `color` 또는 `joinOrder`(Violet → Sunset → Green → Blue → Amber → Gray). 나·나간 멤버는 접근성 이름에 「(나)」「(나간 멤버)」가 붙고, 화면에는 「나」 배지(SettlementRow `me`)·Tag `left`를 같이 쓴다.
- **외부 프사(카카오)**: 운영 CSP가 `img-src 'self' data:`라서 지금은 외부 URL 사진이 막힌다(→ 이니셜로 떨어짐). 카카오 로그인을 붙일 때 `public/_headers`의 `img-src`에 카카오 프사 CDN 호스트(예: `https://k.kakaocdn.net`, 실제 응답의 호스트를 확인)를 추가해야 한다. 카탈로그는 로컬 플레이스홀더(`src/catalog/photos/`)를 쓴다.
- **금액**: `formatKrw(n)` → `₩1,284,000`, 음수는 U+2212 `−₩28,400`, `{ sign: 'always' }` → `+₩161,000`. 다른 통화는 `formatMoney(n, 'JPY')`. 받을 돈·보낼 돈은 색(`text-amount-receive|send`)만이 아니라 부호와 라벨(받을 돈 / 보낼 돈 / 정산 끝)을 항상 같이 쓴다.
- **Figma `Style` 속성**(TimelineItem·Callout·Chip)은 HTML `style`과 이름이 겹친다. `type`/`htmlType`과 같은 규칙으로 Figma 쪽이 `style` 이름을 쓰고, 이 컴포넌트들은 HTML `style` 속성을 받지 않는다.
- 탭하는 행(PaymentRow · TimelineItem 카드 · `SettlementRow tappable={true}` · ListItem · onClick 있는 Callout)은 `<button>`이고 Pressed는 `:active`. `SettlementRow tappable={false}`·ListItem `value`·onClick 없는 Callout은 `div`.
- 글자 예외(Figma에 텍스트 스타일 없음): Avatar 이니셜 XS `text-[10px]` · XL `text-[24px]`, AvatarStack +N 칩 XS `text-[9px]`(S는 Tag와 같은 11px). 원통화 금액·타임라인 시각은 `font-amount text-caption font-medium`(IBM Plex Sans KR 500, `styles/fonts.css`).
- EmptyState 일러스트는 Figma 세트의 Icons8 컬러 PNG 대신 DS v1.4 `Illust/Empty-Trip`(24:61381)을 토큰 색 SVG로 그린다.

## 셸 · 하이파이 패턴 (Figma v1.4 「화면 셸 · 하이파이 패턴」, spec 9장)

ShellApp · ShellSub · ShellOnboarding · ProgressSteps · RouteProgress · RowMemberAmount · BadgeMe · IllustEmptyTrip · IllustLinked · IllustSettled · IllustLinking · SheetContentReadOnly · SheetContentOption · RowOption · RowAccount · RowAdd · RowMember · PanelSide · DropdownMenu. Figma `A/B` 이름은 `AB` 컴포넌트 + `src/ds/A/B.tsx`(SheetContent/PaymentDetail과 같은 규칙).

### 셸 사용 규칙 (spec 9-3)

- **화면 = 셸 1개 + 내용(children = Figma `Content` 슬롯).** 여정 탭(결제내역·현황·여정 정보·정산) = `ShellApp`, 지갑·마이·환율·멤버별 내역·여정 생성·여정 없음 = `ShellSub`(여정 없음은 `header={{ type: 'logo' }}`), 인증 03~08 = `ShellOnboarding`(로그인은 `back={false}`, progress·cta 없음). 스플래시만 셸 없이.
- 셸 바탕은 `bg/surface`(흰색). 헤더는 구분선이 없고, App 헤더 그룹명은 H2다(Figma 셸 인스턴스 덮어쓰기 — TopHeader의 `divider`·`groupNameSize`는 셸이 넣으니 화면에서 직접 쓰지 않는다).
- 첫 블록 위 여백은 셸이 준다(App 8 · Sub 16 · Onboarding 24). 좌우 거터 20도 셸(기본 on). **전폭 DS 행(PaymentRow · TimelineItem · SettlementRow · ListItem · DateHeader · RowAccount · RowAdd)은 자체 좌우 20을 가지므로 거터 밖에 둔다** — 그런 행만 쌓는 화면은 `gutter={false}`, 섞이면 `gutter={false}` + 블록마다 `px-gutter`. `RowMemberAmount`는 거터 블록 안에 넣는다(Figma 350).
- `ShellApp`: `header`(TopHeader Group props: groupName · menu · statusBadge · dropdown · onMenuClick · onGroupClick · onWalletClick · onMyClick) + `nav`(BottomNav props: active · phase(진행 중·시작 전 ongoing, 종료 후 ended) · onChange · hrefs) + `cta`. `ShellSub`: `header`(Back: title · onBack · action / Logo) + `cta`. `ShellOnboarding`: `leading`(back ‹ 기본 · close ✕, v1.6) · `back`(기본 true, Leading 버튼 표시) · `onBack` · `onClose` · `progress`(1~4, 주면 켜짐) + `progressTotal`(기본 4, 가입 2단계는 2 — DS18) · `cta` · `skip` + `skipLabel` + `onSkip`.
- 상태바(44)·홈 인디케이터(34)는 시안용이라 그리지 않는다(Figma `Time` 속성 없음). 안전영역은 `env(safe-area-inset-*)`로만 비운다.
- 오버레이는 셸 위 최상위 레이어(네이티브 `<dialog>`)에 뜬다: 딤 → BottomSheet / Dialog / `PanelSide` / `DropdownMenu`. 열림 상태는 화면이 쥐고 셸 헤더 콜백에서 연다 — ≡ `onMenuClick` → `PanelSide`, 그룹명 `onGroupClick` → `DropdownMenu` + `header.dropdown={open ? 'open' : 'closed'}`(⌃ · aria-expanded).
- `PanelSide`: 왼쪽 300, 오른쪽 radius 24, Elevation/3. `useModalDialog`로 ESC · 딤 · 닫기 · Tab 가두기 · 포커스 되돌리기. children = `RowMember` × n + `RowAdd`("초대코드 공유"). 강퇴는 그룹장 화면의 남의 행에만 `kick={{ onClick }}`.
- `DropdownMenu`(Figma v1.4.1): 헤더 아래부터 딤(헤더는 딤 밖), 패널 화면 좌우 12 · radius 16 · Elevation/2. role=menu, 여정 = menuitemradio(이름 + 상태 `meta` 글자 "진행 중" · "시작 전 · 12.27" · "정산 완료", 앞 아이콘·› 없음, 현재 = checked · Body/M Strong · 체크 icon/brand). `actions` = menuitem(위 여백 8, 구분선 없음, 높이 48 · 왼쪽 20 · 아이콘 20 icon/subtle · Body/M text/secondary): `{ label: '새 여정 만들기', icon: 'plus' }` · `{ label: '초대코드로 참여', icon: 'link' }`. `Row/Add`는 지갑 「계좌·카드 추가」용이라 여기서 쓰지 않는다. ↑↓ · Home · End 이동, 고르면 닫고 `onSelect`, ESC · Tab · 바깥 탭으로 닫힘.
- 시트 내용: 결제자가 아닌 멤버·종료 후·결제자가 나간 결제는 `SheetContentReadOnly`(`locked` = 비활성 "변경 불가"), 단일 선택은 `SheetContentOption`(라디오 그룹, `RowOption`).
- 일러스트는 `Illust*`(토큰 색 SVG, Icons8 금지): 결제 없음·여정 없음 = EmptyTrip, 연동 완료 = Linked, 정산 완료·연결 결과 = Settled, 지갑 연결 단계 = `IllustLinking phase`. 기본 140(120~160), 장식이라 `aria-hidden` — 뜻이 있으면 `label`. `EmptyState`도 IllustEmptyTrip을 쓴다.
- `RouteProgress`는 영웅 카드(톤) 안에서만. Figma는 4일·진행 중 Day 2 고정이고, 코드는 `days`·`current`로 실제 일정을 받는다.

## v1.5 임시 조합 → DS 교체 대응표

W5 화면 통합에서는 아래 임시 조합을 지우고 오른쪽 DS 공개 API로 교체한다. 이 PR은 `features/**`를 수정하지 않는다.

| 현재 임시 조합                                                       | 교체할 DS                                                             | 핵심 props                                             |
| -------------------------------------------------------------------- | --------------------------------------------------------------------- | ------------------------------------------------------ |
| `features/auth/components/LargeInput`                                | `Input`                                                               | `size="l" labelVisible={false}`                        |
| `features/auth/components/ConsentList`                               | 가입 화면은 `RowConsent` 목록, 금융 동의 시트는 `SheetContentConsent` | `required` · `checked` · `chevron`, `items` · `cta`    |
| `features/auth/components/OnboardingShell`                           | `ShellOnboarding`                                                     | `skip skipLabel="나중에" onSkip`                       |
| `features/auth/components/FinConsentSheet`의 직접 CTA/목록 조합      | `BottomSheet` + `SheetContentConsent`                                 | 시트 `cta`는 생략, 내용 `cta` 사용; 기본 gap 20        |
| `features/stats/pages/StatsPage`의 보라 영웅 section                 | `StatCard`                                                            | `type="hero" size="l"`                                 |
| `features/stats/pages/StatsPage`의 공동/개인 지표 막대               | `MetricBar`                                                           | `type="single" total` / `type="split" shared personal` |
| `features/settlement/pages/SettlementPage`의 정산 영웅 section       | `CardHeroTone`                                                        | `sub` + `route={{ phase: 'ended', … }}`                |
| `features/settlement/pages/SettlementMemberPage`의 멤버 영웅 section | `CardHeroTone`                                                        | `aside={<Avatar … />}` + 금액 톤                       |
| 초대코드·토스 연결 상태의 톤 행 조합                                 | `RowTone`                                                             | `label` · `value` · `action`                           |
| 탈퇴한 멤버 정산 행의 `disabled` + CSS chevron 숨김                  | `SettlementRow`                                                       | `tappable={false}`                                     |

## v1.6 추가분 → 화면 교체 대응표 (spec §11)

모두 기존 API에 더한 것이라 기존 호출은 그대로 컴파일된다(기본값 = v1.5 모습). 세트로 바뀐 DateHeader · Shell/Onboarding · SheetContent/ReadOnly는 카탈로그 `figma` ID만 세트 ID로 바꿨다.

| Figma v1.6                                                | 코드                                                                                             | 바꿀 화면 임시 조합                                                                     |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------- |
| DateHeader `Style=Plain`                                  | `DateHeader style="plain"`(배경 없음 · Day·합계 3차 Caption)                                     | `features/payments/components/ListParts`의 `PlainDateHeader`                            |
| TimelineItem `Position=First`                             | `TimelineItem position="first"`(점 위 레일 숨김)                                                 | `features/payments/components/Views`의 `FIRST_NODE` 클래스                              |
| SegmentedControl `Size=S` · `Disabled 1~3`                | `size="s"`(32 · 폭 176/240 · Label/S) · `disabledItems={['second']}`                             | 결제내역 컨트롤 줄 `w-44` 래퍼(ListParts) · 결제 상세 `SHARED_SEGMENT_OFF`(PaymentSheet) |
| Shell/Onboarding `Leading=Close`                          | `ShellOnboarding leading="close" onClose`                                                        | `features/wallet/components/ConnectStatus`의 Screen 조립(HF-06)                          |
| Input `Suffix` · `Trailing icon` · `Icon`                 | `Input suffix suffixText="원"` · `trailingIcon icon="marker"`                                    | 여정 생성 예산 입력(TripForm)                                                           |
| Input `Type=Picker`                                       | `InputPicker`(`<button>`, 라벨+값이 접근성 이름, ⌄, 오류도 ⌄ 유지)                               | `features/trips/components/PickerField`(장소 "도시 검색" · 기간 "출발일 – 도착일")      |
| SheetContent/ReadOnly `Type=Refund`                       | `SheetContentReadOnly type="refund" payment refunds`(취소 금액은 양수로 → −₩ 표기)               | `features/payments/components/SheetParts`의 `RefundSummary` · `RefundFacts`(읽기 전용)  |
| Chip `Removable`                                          | `Chip removable`(오른쪽 ✕ 16, 체크 대신) + "해제"가 든 `aria-label`                              | 결제내역 「확인 필요 n건 ✕」 선택 버튼(ListParts `ControlRow`)                          |
| TopHeader `Type=Close` + `Center title`                   | `TopHeader type="close" title?` · 셸은 `ShellSub header={{ type: 'close' }}`                     | 생성 완료(HF-11 · `features/trips/pages/CreatedPage`)                                   |
| SheetContent/DateRange                                    | `SheetContentDateRange`(+ `formatDateRange` · `pickDate` · `isDateSelectable`)                   | `features/trips/components/PeriodSheet`의 네이티브 date 입력 두 칸                      |
| Dialog `Body` · confirm `State=Loading`                   | `Dialog body={false}` · `confirmState="loading"`                                                 | 처리 중 확인 다이얼로그(여정 종료·멤버 내보내기·결제수단 삭제 등)                       |
| EmptyState `Type=Illust` · `Illust` · `Button 2`          | `EmptyState type="illust" illust? actions?`(일러스트 160 + H2 + 버튼 L)                          | 여정 없음(HF-09 · `features/trips/pages/NoTripPage`)                                    |

- **기간 시트**: `InputPicker` → `BottomSheet`(시트 `cta` 없음) + `SheetContentDateRange`(`cta={{ onClick }}` = "확인", 둘 다 골라야 켜짐). 값은 `'YYYY-MM-DD'`, `today`는 서버 기준일을 넘긴다. 한도는 `min`(기본 오늘 — 과거 출발 허용이면 앞당김) · `max` · `endMin`(진행 중 수정: 오늘) · `maxDays`(최대 일수) · `startLocked`(진행 중 수정). 처음엔 출발일 칩이 활성이고, 날짜를 고르면 도착일 칩으로 넘어간다. 도착일을 고르는 중 출발일 앞을 누르면 새 출발일. 키보드는 grid 하나에 탭 멈춤 하나(←→↑↓ · Home/End · PageUp/PageDown), 날짜 버튼 이름은 "2026년 11월 12일 목요일, 출발일, 오늘".
- **입력 문구(v1.6.1)**: 헬퍼 텍스트는 기본 숨김 — `helper`는 `error`와 같이 오류 문구로만 쓴다(설명형 헬퍼 금지). 장소 Picker 플레이스홀더 "도시 검색", 기간 "출발일 – 도착일", 예산 Suffix "원".
- **Chip 체크**: Figma대로 선택 체크는 Outline에만 붙는다(Tone 선택은 면 색만). v1.5 코드는 Tone 선택에도 체크를 그렸는데 v1.6 속성 연결 복구에 맞춰 고쳤다.
- **Dialog 처리 중**: `confirmState="loading"`이면 확인은 aria-busy + 누름 무시, 포커스는 유지. 처리 중 취소·ESC를 막을지는 `onCancel`에서 정한다.

## v1.6.2 추가분 (DS17 · spec §9-4 · 화면명세 v0.5.8 0-4)

| Figma v1.6.2 | 코드 | 화면에서 바꿀 곳 |
| --- | --- | --- |
| **BottomCTA**(세트 69:10702) `Layout=Single/Horizontal` | 셸·시트 `cta`가 그린다. Single = `cta={{ label, onClick, state? }}`(기본). Horizontal = `cta={{ layout: 'horizontal', secondary: { label, type?: 'danger-weak' }, primary: { label, state? } }}` — 간격 8, 1:1(grid 1fr 1fr), 왼쪽 보조 · 오른쪽 주 행동. 세로 2버튼 없음 | HF-09 여정 없음(초대코드로 참여 \| 여정 만들기) · HF-16·17 그룹장 시작 전(그룹 삭제 Danger-weak \| 여정 시작 / 기간 수정) |
| CTA `State`(Loading·Disabled) | 셸·시트 cta 버튼마다 `state: 'loading' \| 'disabled' \| 'default'`(`disabled`도 그대로 받음). `ScreenCta`·`BottomSheetCta` 타입에 들어 있다 | W5B `app/loadingCta.ts`의 `withLoading` 대신 `state: pending ? 'loading' : 'default'` |
| Button `Type=Danger-weak` | `type="danger-weak"` — 면 feedback/error/bg, 글자·아이콘·스피너 text/error, 테두리 없음. Pressed 글자 error/800 + 면 5% 어둡게(전용 토큰 없음), Disabled = bg/subtle + text/disabled | 2버튼 왼쪽 파괴적 보조(그룹 삭제 등). 텍스트 링크 "그룹 삭제"를 대체 |
| Tag `Type=Warning` | `Tag type="warning"`(기본 "연결 만료") — feedback/warning/bg + fg, 아이콘 없음 | HF-30 마이페이지 지갑 줄 오른쪽(`Me.hasExpiredConnection`) |
| EmptyState `Layout=Vertical/Horizontal` | `EmptyState type="illust" layout="horizontal"` — actions를 왼쪽 Secondary L · 오른쪽 Primary L 순서로, 1:1(하나면 FILL). 기본 vertical(비권장) | 버튼을 EmptyState 안에 둘 때 |
| Row/Member 왕관·강퇴 | 왕관 = 이름 **앞**, 채운 14 · icon/subtle, 간격 4. 다른 곳은 `LeaderCrown`을 이름 앞에. 강퇴 = Body/S Regular + text/error | `features/trip-info/components.tsx`의 `text-warning-500` 왕관(이름 뒤) → `<LeaderCrown />` 이름 앞 |
| StatCard 아이콘 20 | 라벨 아이콘을 18로 줄이던 덮어쓰기 제거 | — |
| SettlementRow `Tappable=false` | 정적 `<div>`(버튼 역할 없음)에 aria-label·data-*·id 등 나머지 prop을 넘긴다(버튼 전용 속성은 버림) | — |
| Toast 위치·수명(0-4) | `ToastViewport anchor`: `nav`(내비 위 16) · `cta`(내비 없음 + CTA 위 16) · `nav-cta`(둘 다 — CTA 위 16) · `safe-area`(안전영역 위 16) · `auto`(지금 그려진 Screen의 하단 구성, Screen이 등록). `onModalOpen(kind => …)`: 시트(`sheet`)·다이얼로그(`dialog`)·패널·메뉴가 열릴 때 알림 | `notifications/ToastHost`: `anchor="auto"` + `onModalOpen`으로 sheet·dialog면 큐 비우기(아래) |

- **토스트 연결(앱 쪽)**: `ToastHost`가 `<ToastViewport anchor="auto" aboveNav={aboveNav}>`로 그리면 Screen이 알려 준 하단 구성(내비·CTA)을 따르고, Screen이 없을 때만 `aboveNav`(라우트 `handle.nav`)로 정한다. 시트·다이얼로그가 열리면 떠 있던 토스트를 닫는다: `useEffect(() => onModalOpen((kind) => { if (kind === 'sheet' || kind === 'dialog') store.clear() }), [store])` — 시트 안에서 새로 띄우는 토스트는 연 뒤라 영향 없음.
- Dialog는 바뀐 게 없다(왼쪽 취소 · 오른쪽 확인, 처리 중 `confirmState="loading"`은 v1.6).

## v1.6.3 추가분 (DS18 · spec §9-5 · 화면명세 v0.6.0 K절 수동 결제)

모두 기존 API에 더한 것이라 기존 호출은 그대로 컴파일되고 모습도 같다(예외: SheetContent/Option 행 간격 4 → 0).

| Figma v1.6.3 | 코드 | 화면에서 쓸 곳 |
| --- | --- | --- |
| BottomSheet `Back#88:0` | `leading="back"`(또는 `back`) + `onBack` · `backLabel`(기본 "뒤로"). Back이면 ✕는 기본 숨김(`close`로 다시 켬) | 같은 시트 안 단계: HF-47 나누기 · 결제자, HF-48b 여정 선택 |
| BottomSheet `Action#88:1` | `action={{ label?, onClick, disabled? }}`(Button Ghost S, 기본 "수정"). 헤더 순서 ‹ · 제목 · action · ✕, 간격 8 | HF-20b 수동 결제 상세 "수정"(작성자 · 종료 전) |
| PaymentRow `Avatar#88:2` off | `leading="none"`(payer 없음) + `walletMeta(time, tripName?)` → "08:50 · 오사카 3박 4일" / "08:50" + `originalAmount` | HF-49 내 지갑 행 |
| DateHeader `Day#88:13` off | `day`를 생략하거나 `day={false}`(빈 자리 없음) | HF-49 "11.13 (금)". 여정 결제내역은 `day="Day 2"` |
| Progress/Steps `Total=4/3/2` | `total`(기본 4). 셸은 `ShellOnboarding progress={1} progressTotal={2}` | 가입 2단계(accountLink=false): 닉네임 1/2(HF-03) · 약관 2/2(HF-04) |
| Row/Option `Logo#88:16` · `Subtitle#88:19` | `logo={false}`(원 아이콘 없음) · `subtitle` 생략 = Subtitle off(높이 46). SheetContentOption 항목도 `logo` | HF-48b 여정 목록 · HF-10b 통화 |
| SheetContent/Option | N행 · 간격 0(2행 · 간격 4에서 일반화) | HF-48b(+ 맨 아래 "추가 안 함") · HF-10b 통화 7행 |
| **Row/Field**(77:10504) | `RowField`(라벨 … 값 ›, `<button>`): `value` · `placeholder`(흐림) · `avatar`(프사 XS) · `stack`(AvatarStack XS, 최대 4 + "+N") · `personal`(자물쇠 개인) · `chevron`(기본 true) · `disabled`. 변형 `RowFieldInput`(값 = 인라인 입력, › 없음) · `RowFieldToggle`(라벨 + Toggle) | 수동 결제 폼 행(내용 · 결제자 · 나누기 · 날짜 · 여정 · 내 지갑에도 기록) |
| **SheetContent/SplitPick**(79:11072) | `SheetContentSplitPick`: 나누기(기본 `mode="multiple"`, `selected: string[]`, `onChange(ids)`, `count?` · `perPerson` · `remainder` · `personal`) / 결제자 `mode="single"`(`selected: string \| null`, `onChange(id)`, 요약 없음 · 라디오 · ←→). `members`: `AvatarPerson & { id, disabled? }`. 글자는 `splitPickSummary(krw, n)` | HF-47 · 47b, 결제자 선택 |
| (Form/ManualPayment 금액 줄) | `InputAmount`: `value`(원값 "1200") · `onChange(raw)` · `symbol` · `fractionDigits` · `currency={{ label, onClick? }}` · `converted`. 순수 로직 `normalizeAmountInput` · `formatAmountInput` · `amountInputNumber` | HF-46 · 48 · 50 맨 위 큰 금액 |

- **Form/ManualPayment는 DS에 없다**(06 로컬 조합). 화면이 조립한다: `BottomSheet` → `InputAmount className="pb-4"` → `RowFieldInput "내용"`(placeholder "예) 저녁", `maxLength={40}`) → `RowField` 결제자(`avatar` + "나"/닉네임) · 나누기(`stack`, 나만이면 `personal`) · 날짜("지금") · (지갑) 여정(이름, 없으면 `placeholder="추가 안 함"`) → `RowFieldToggle "내 지갑에도 기록"`(결제자 = 나일 때만). CTA는 시트 `cta`: 추가 = Single(`state: 금액 > 0 ? 'default' : 'disabled'`), 수정 = Horizontal(삭제 Danger-weak | 저장). 카탈로그 `Pattern/ManualPayment`에 HF-46~50 · 20b · 49 조립 예시와 단계 전환 동작 예시가 있다.
- **시트 안 단계**: 한 `BottomSheet`의 `title` · `leading` · children · `cta`만 바꾼다(겹 시트 금지). 나누기 단계는 임시 선택(draft)을 쥐고 "완료"에서 반영, ‹(`onBack`)은 버림. 결제자 단계는 `cta` 없이 `onChange`에서 바로 반영 + 폼으로. 단계가 바뀌어 누른 행이 사라지면 시트가 포커스를 새 제목으로 옮긴다. 처음 열 때 금액에 포커스를 주려면 `InputAmount autoFocus`.
- **나누기 요약**: `splitPickSummary(amountKrw, n)` → `{ perPerson: "1인 ₩3,676", remainder: "결제자 +2원" | null }`(FR-509 내림 + 나머지 결제자, Figma 샘플 ₩3,677이 아니다). 나만(결제자 = 나) 선택이면 `personal`. 완료 비활성 조건(0명 · 결제자 ≠ 나인데 결제자 혼자)은 화면이 시트 `cta.state`로.
- **수정(WF-50) 나간 멤버**: 기존 부담 인원 중 나간 멤버는 `left: true`로 흐리게, "해제만 가능"은 선택이 꺼졌을 때 `disabled: true`.
- **통화 칩**: KRW ↔ 여정 통화는 화면 상태. 칩 글자는 코드("JPY"), 금액 앞 기호는 `symbol`. KRW 여정은 `currency={{ label: 'KRW' }}`(onClick 없음 = 정적 칩). 환산 줄은 외화이고 환율이 있을 때만.

### 명세 충돌 반영 (docs/spec README §7)

- **C-05 스택·멤버 순서**: 나 먼저 → 가입 순, 결제자를 앞세우지 않는다(결제자는 행 왼쪽 아바타). 컴포넌트는 받은 순서대로 그리므로 데이터 순서는 호출자 책임 — `orderMembers(people)`로 정렬해서 넘긴다(AvatarStack · PaymentRow/TimelineItem `participants` · SheetContent 부담 인원 · 멤버별 부담 · 그룹원 패널).
- **C-06 결제자 표기**: 메타 줄은 `paymentMeta('18:20', payer)` → "18:20 · 내 결제" / "18:20 · 민지"(접미사 없음), 타임라인처럼 앞부분이 다르면 `payerLabel(payer)`. 미확정은 메타에 붙이지 않는다(PaymentRow `type="pending"`이 칩을 그림). 결제 상세 결제자 행은 프사 + 닉네임, 나는 "나"(`SheetContentReadOnly`가 처리).
- **C-08 나간 멤버**: 이름 뒤 "(나감)" 대신 프사 Left + `Tag type="left"`("나간 멤버"). SettlementRow `member="left"`, `RowMemberAmount`·`SheetContentReadOnly` 결제자는 `person.left`로 자동. 결제 행(PaymentRow)은 프사 Left만(메타는 닉네임 그대로).
- 나(`me`)는 프사 Me 테두리와 「나」 배지(`BadgeMe`)를 같이 쓴다 — RowMemberAmount · RowMember · SettlementRow 공통.

## DS가 바뀌었을 때

1. Figma에서 `docs/design/design-system/*.json`이 다시 나오면 `pnpm --filter @yeojeong/web ds:tokens` 후 `tokens.json`·`tokens.css` 변경을 커밋한다(텍스트·이펙트 스타일도 tokens.json의 `typography`·`elevation`에서 온다). 기존 값이 바뀌는 게 의도라면 `scripts/__fixtures__/tokens-v1.3.css` 비교 테스트를 고친다.
2. 컴포넌트 변형·속성이 바뀌었으면 같은 이름의 prop 유니온에 값을 더하거나 빼고, catalog에 변형을 추가한다(타입 오류가 쓰는 곳을 알려 준다).
3. 카탈로그를 Figma 세트 스크린샷과 나란히 놓고 크기·색·굵기를 확인한다.

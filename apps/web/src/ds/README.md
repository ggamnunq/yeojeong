# 디자인 시스템 (`src/ds`)

Figma 「여정」 v1.3 디자인 시스템을 코드로 옮긴 것. 원본 문서(`docs/design/`)는 로컬 전용이라 레포에는 없다.

## 토큰

- 원본: `design-tokens/tokens.json`(Figma 변수 · `docs/design/design-system/tokens.json` 사본)과 `design-tokens/styles.json`(텍스트·이펙트 스타일 · spec 4·5장).
- `pnpm --filter @yeojeong/web ds:tokens` → `src/styles/tokens.css`(Tailwind `@theme`) 생성. `docs/design`이 있으면 tokens.json을 먼저 복사해 온다. 생성 파일은 커밋한다.
- `ds:tokens:check`는 CI에서 생성 결과와 커밋된 파일이 다르면 실패한다. tokens.css는 손으로 고치지 않는다.
- Tailwind 기본 색·글자 크기·라운드·그림자는 지웠다. 토큰에 없는 값은 쓸 수 없다.

| Figma | CSS 변수 | 유틸 |
|---|---|---|
| `primary/500` | `--color-primary-500` | `bg-primary-500` (팔레트는 되도록 역할 토큰으로) |
| `bg/canvas` · `text/secondary` · `border/default` | `--color-bg-canvas` … | `bg-canvas` · `text-secondary` · `border-default` (짧은 이름) |
| 그 밖의 역할 `icon/default` · `expense/shared/bg` · `trip/active/dot` | `--color-icon-default` … | `text-icon-default` · `bg-expense-shared-bg` · `bg-trip-active-dot` |
| `radius/md` | `--radius-md` | `rounded-md` |
| `Elevation/1` · `Focus/Ring` | `--shadow-elevation-1` · `--shadow-focus-ring` | `shadow-elevation-1` · `focus-visible:shadow-focus-ring` |
| `layout/gutter` 등 | `--spacing-gutter` | `px-gutter` · `h-header-height` · `min-h-touch-min` |
| `space/20` | Tailwind 기본 4px 스케일 | `p-5` (space/N = N/4) |
| `Body/M Strong` · `Heading/H1` | `--text-body-m-strong` · `--text-h1` | `text-body-m-strong` · `text-h1` (크기·행간·자간·굵기 한 번에) |
| `Amount/L` | `--text-amount-l` + `--font-amount` | `font-amount text-amount-l` (`font-amount`에 tabular-nums 포함) |

예외: 카카오 버튼의 `#FEE500` · `#EDD500`(눌림) · 라벨 `#000 85%`는 카카오 가이드 고정값. Tag·Badge의 S 크기 글자(11px)는 Figma에 텍스트 스타일이 없어 `text-[11px]`을 쓴다.

## 컴포넌트 규칙

- 폴더 하나에 컴포넌트 하나: `src/ds/<Name>/<Name>.tsx` + `<Name>.catalog.tsx`(+ 필요하면 `<Name>.test.tsx`). `src/ds/index.ts`에 export를 추가한다.
- 이름은 Figma와 1:1. 컴포넌트 이름 = Figma 세트 이름, prop 이름 = Figma 속성 이름의 camelCase, 값 = Figma 값의 소문자(kebab-case).
  - 예: `Type=Primary, Size=L` → `type="primary" size="l"`, `Leading icon` → `leadingIcon`, `Label` → `label`, `Count=2/3, Selected=Second` → `labels` 개수 + `selected="second"`.
  - `State=Pressed`는 CSS `:active`, `Focus`는 `:focus-visible`/`:focus-within`, `Disabled`는 `disabled` 속성으로. prop으로 받지 않는다.
  - HTML `type`과 겹치는 버튼류는 HTML 쪽을 `htmlType`으로 받는다.
- 스타일은 Tailwind 유틸 + 토큰만. raw hex·임의 색 금지. 클래스 합치기는 `clsx`.
- 접근성: 진짜 `<button>`/`<input>`, 라벨 연결, 아이콘만 있으면 `label`(aria-label) 필수, 포커스 링은 `styles.ts`의 `focusRing`, 보이는 크기가 44px보다 작으면 `touchTarget`으로 누르는 영역만 넓힌다.

## 레이아웃 · 오버레이

- 화면은 `Screen`으로 조립한다(spec 7-1): `header`(TopHeader) → 본문(`gutter` 좌우 20, 기본 on) → `cta`(Button Primary L FILL) → `nav`(BottomNav). 390 폭 가운데 정렬, 바탕 `bg/canvas`. 스크롤은 문서가 하고 헤더·하단은 sticky.
- 안전영역: `index.html`의 `viewport-fit=cover`가 있어야 `env(safe-area-inset-*)`가 잡힌다. 위는 Screen 헤더 자리, 아래는 BottomNav(없으면 CTA나 본문)와 BottomSheet가 채운다.
- `BottomSheet`·`Dialog`는 네이티브 `<dialog>.showModal()`(최상위 레이어 + 배경 inert) 위에 `useModalDialog`가 ESC·Tab 가두기·포커스 되돌리기·스크롤 잠금을 더한다. 열림 상태는 부모가 쥐고(`open`), 닫기 요청은 `onClose`/`onCancel`로만 알린다. 시트는 딤을 누르면 닫히고, 다이얼로그는 딤으로 닫히지 않는다.
- 모션은 시트 200ms·다이얼로그 150ms이고 `prefers-reduced-motion`이면 없다.
- 내용이 필요한 Figma BOOLEAN은 객체를 넘기면 켜진다: BottomSheet `CTA` → `cta={{ label, onClick }}`, Toast `Action` → `action={{ label, onClick }}`, TopHeader Back의 `action` 버튼. `Type=SharedToPersonal`처럼 붙어 있는 값은 kebab-case(`type="shared-to-personal"`).
- `Toast`는 겉모습만, `ToastViewport`는 자리(내비 위 16)만 잡는다. 큐·타이머·자동 닫힘은 쓰는 쪽이 붙인다. 화면 코드는 `src/notifications`의 `toast.*`를 쓰고(`ToastHost`가 그린다) DS Toast를 직접 그리지 않는다. 사용법은 `src/api/README.md`.
- 카탈로그에서 열린 모습을 고정해 보여 줄 때는 `BottomSheetPanel`·`DialogPanel`(모달 동작 없는 겉모습)과 `catalog/PhoneFrame`을 쓴다. 화면 코드에서는 쓰지 않는다.

## 카탈로그

- `pnpm --filter @yeojeong/web catalog` → http://localhost:5173/catalog.html (`catalog:build`는 `dist-catalog/`로 따로 빌드).
- `**/*.catalog.tsx`가 `defineCatalog({ title, figma, group, order, Demo })`를 default export하면 `import.meta.glob`으로 자동 등록된다. 모든 변형을 Figma 세트 배치에 가깝게 보여 준다.
- 운영 빌드(`pnpm build`)는 `index.html`만 묶으므로 카탈로그는 `dist/`에 들어가지 않는다.

## 아이콘

- `<Icon name="wallet" size={20} className="text-icon-default" />`. 이름은 Figma `Icon/<이름>` 42종 그대로, 실제 모양은 `Icon/icons.ts`의 lucide 매핑. 색은 `currentColor`, 선 굵기는 1.75(Fluency Systems Regular에 맞춤).
- 아이콘을 추가하려면 Figma 이름을 키로 `ICONS`에 넣고 `icons.test.ts`의 목록도 같이 고친다.
- `Brand/KakaoSymbol`은 카카오 공식 리소스 PNG(`Icon/kakao-symbol.png`)라 `KakaoSymbol`이 data URI 이미지로 그린다.

## 데이터 컴포넌트 (Figma v1.4 기준)

Avatar · AvatarStack · AvatarToggle · PaymentRow · DateHeader · TimelineItem · StatCard · BudgetProgress · SettlementRow · TransferRow · ListItem · Callout · EmptyState · SheetContent/PaymentDetail(`SheetContentPaymentDetail`).

- **순수 로직은 `<Name>/rules.ts`**(프사 폴백·스택 overflow·예산 상태·정산 부호·1인 금액). 컴포넌트 파일에는 컴포넌트만 둔다(fast refresh). 테스트는 rules 위주.
- **사람 한 명 = `AvatarPerson`**(`name`·`src`·`source`·`color`·`joinOrder`·`me`·`left`). 행·스택·토글은 이 모양을 받는다. 스택 순서는 넘긴 배열 그대로(나 먼저 → 가입 순).
- **프사 규칙(spec 7-2)**: `src`가 있으면 사진 → 없으면 「여정」 기본 이미지(`Avatar/default-image.svg`, Figma `Avatar/DefaultImage` Color=Gray를 SVG로 내보낸 것) → 사진 로딩 실패(`onError`)면 이니셜. 이니셜 색은 `color` 또는 `joinOrder`(Violet → Sunset → Green → Blue → Amber → Gray). 나·나간 멤버는 접근성 이름에 「(나)」「(나간 멤버)」가 붙고, 화면에는 「나」 배지(SettlementRow `me`)·Tag `left`를 같이 쓴다.
- **외부 프사(카카오)**: 운영 CSP가 `img-src 'self' data:`라서 지금은 외부 URL 사진이 막힌다(→ 이니셜로 떨어짐). 카카오 로그인을 붙일 때 `public/_headers`의 `img-src`에 카카오 프사 CDN 호스트(예: `https://k.kakaocdn.net`, 실제 응답의 호스트를 확인)를 추가해야 한다. 카탈로그는 로컬 플레이스홀더(`src/catalog/photos/`)를 쓴다.
- **금액**: `formatKrw(n)` → `₩1,284,000`, 음수는 U+2212 `−₩28,400`, `{ sign: 'always' }` → `+₩161,000`. 다른 통화는 `formatMoney(n, 'JPY')`. 받을 돈·보낼 돈은 색(`text-amount-receive|send`)만이 아니라 부호와 라벨(받을 돈 / 보낼 돈 / 정산 끝)을 항상 같이 쓴다.
- **Figma `Style` 속성**(TimelineItem·Callout)은 HTML `style`과 이름이 겹친다. `type`/`htmlType`과 같은 규칙으로 Figma 쪽이 `style` 이름을 쓰고, 이 컴포넌트들은 HTML `style` 속성을 받지 않는다.
- 탭하는 행(PaymentRow · TimelineItem 카드 · SettlementRow · ListItem · onClick 있는 Callout)은 `<button>`이고 Pressed는 `:active`. ListItem `value`와 onClick 없는 Callout은 `div`.
- 글자 예외(Figma에 텍스트 스타일 없음): Avatar 이니셜 XS `text-[10px]` · XL `text-[24px]`, AvatarStack +N 칩 XS `text-[9px]`(S는 Tag와 같은 11px). 원통화 금액·타임라인 시각은 `font-amount text-caption font-medium`(IBM Plex Sans KR 500, `styles/fonts.css`).
- EmptyState 일러스트는 Figma 세트의 Icons8 컬러 PNG 대신 DS v1.4 `Illust/Empty-Trip`(24:61381)을 토큰 색 SVG로 그린다.

## DS가 바뀌었을 때

1. Figma에서 `docs/design/design-system/*.json`이 다시 나오면 `pnpm --filter @yeojeong/web ds:tokens` 후 `tokens.json`·`tokens.css` 변경을 커밋한다. 텍스트·이펙트 스타일이 바뀌었으면 `design-tokens/styles.json`을 고친다.
2. 컴포넌트 변형·속성이 바뀌었으면 같은 이름의 prop 유니온에 값을 더하거나 빼고, catalog에 변형을 추가한다(타입 오류가 쓰는 곳을 알려 준다).
3. 카탈로그를 Figma 세트 스크린샷과 나란히 놓고 크기·색·굵기를 확인한다.

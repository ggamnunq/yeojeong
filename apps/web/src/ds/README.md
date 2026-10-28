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

## 카탈로그

- `pnpm --filter @yeojeong/web catalog` → http://localhost:5173/catalog.html (`catalog:build`는 `dist-catalog/`로 따로 빌드).
- `**/*.catalog.tsx`가 `defineCatalog({ title, figma, group, order, Demo })`를 default export하면 `import.meta.glob`으로 자동 등록된다. 모든 변형을 Figma 세트 배치에 가깝게 보여 준다.
- 운영 빌드(`pnpm build`)는 `index.html`만 묶으므로 카탈로그는 `dist/`에 들어가지 않는다.

## 아이콘

- `<Icon name="wallet" size={20} className="text-icon-default" />`. 이름은 Figma `Icon/<이름>` 42종 그대로, 실제 모양은 `Icon/icons.ts`의 lucide 매핑. 색은 `currentColor`, 선 굵기는 1.75(Fluency Systems Regular에 맞춤).
- 아이콘을 추가하려면 Figma 이름을 키로 `ICONS`에 넣고 `icons.test.ts`의 목록도 같이 고친다.
- `Brand/KakaoSymbol`은 카카오 공식 리소스 PNG(`Icon/kakao-symbol.png`)라 `KakaoSymbol`이 data URI 이미지로 그린다.

## DS가 바뀌었을 때

1. Figma에서 `docs/design/design-system/*.json`이 다시 나오면 `pnpm --filter @yeojeong/web ds:tokens` 후 `tokens.json`·`tokens.css` 변경을 커밋한다. 텍스트·이펙트 스타일이 바뀌었으면 `design-tokens/styles.json`을 고친다.
2. 컴포넌트 변형·속성이 바뀌었으면 같은 이름의 prop 유니온에 값을 더하거나 빼고, catalog에 변형을 추가한다(타입 오류가 쓰는 곳을 알려 준다).
3. 카탈로그를 Figma 세트 스크린샷과 나란히 놓고 크기·색·굵기를 확인한다.

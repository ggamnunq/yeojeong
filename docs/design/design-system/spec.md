# 「여정」 브랜드 · 디자인 시스템 스펙 v1.3

> Figma 페이지 「화면」 · 섹션 `01 브랜드 · 로고`(0,0) / `02 디자인 시스템`(3200,0). 노드 ID는 `components.json`, 인스턴스 만드는 법은 `README_handoff.md`.
> 작성 2026-10-28 · 브랜드/DS 에이전트 · v1.1: Callout 신설, TopHeader ≡(Menu), BottomNav 3탭 기본 + Phase, BottomSheet hug + 안전영역, feedback/* 토큰 · v1.2: 프사(Photo/Default/Initial) · 공동 결제 = 부담 인원 프사 스택 · Avatar/DefaultImage · AvatarToggle · PaymentRow Refund/Duplicate/Changed · Dialog SharedToPersonal · Callout Disconnected · v1.3: 기본 이미지 Gray · 미확정 조용히(회색 글자, 메타 줄 끝) · 점선 테두리 전면 제거 · 금액 서체 IBM Plex Sans KR

## 1. 브랜드 방향

- **한 줄**: 함께 떠난 여행의 결제를 한 지갑에 모으고, 끝나면 정확하게 나눠 주는 그룹 여행 공동 지갑.
- **키워드**: 동행(같이 쓰고 같이 본다) · 정확(한 푼까지 추적되는 정산) · 설렘(돈 얘기는 짧게, 여행은 길게).
- **프라이머리 = Journey Violet `#5B4CF5`** (blue-violet, hue ≈ 246°).
  - 토스 블루 `#3182F6`(hue 215°), 카카오 옐로 `#FEE500`, 스플릿와이즈 민트, 트리카운트의 청록 계열과 겹치지 않는다.
  - 파랑이 주는 금융 신뢰감은 유지하고, 해 질 녘 하늘의 보랏빛으로 여행의 설렘을 더한다.
  - Success(초록)·Warning(주황)·Error(빨강)·Info(파랑) 어느 의미색에도 속하지 않아서, 돈 화면에서 브랜드 색이 수입·손실로 읽히지 않는다.
  - **대비(직접 계산, WCAG 2.x 상대휘도)**: 흰 글자 on `#5B4CF5` = **5.53:1 → AA 통과**(본문 크기 포함). on 600 `#4935D4` = 7.66:1(AAA). `text/brand`(600) on 흰 배경 = 7.66:1.
- **포인트 Sunset `#FF7A59`**: 로고의 "도착점"(받침 ㅇ), 앱 아이콘, 진행 중 라이브 점.
- **테두리 규칙(v1.3)**: 점선(dash) 테두리는 쓰지 않는다. 구분이 필요하면 실선 1px `border/default`(gray/200) 또는 테두리 없이 면 색으로. 넓은 면이나 상태 의미로는 쓰지 않는다. 글자색으로 쓸 때는 `sunset/700 #C4411E`(흰 배경 5.09:1). 정산의 "보낼 금액(−)"에 쓴다.
- **±금액 색 결정**: 한국 증시 관습(빨강=상승·파랑=하락)과 서구 관습(초록=+·빨강=−)이 충돌하므로 둘 다 피했다. 받을 돈(+)은 `amount/receive`(보라 600), 보낼 돈(−)은 `amount/send`(Sunset 700). 항상 부호(+/−)와 라벨(받을 돈/보낼 돈)을 함께 붙인다.
- **개인 vs 공동**: 공동 = **부담 인원의 프사 스택**(v1.2 사용자 결정, 누가 나눠 내는지가 바로 보이게; 타임라인 점·차트는 브랜드 보라), 개인 = 무채색 + 자물쇠 Tag(나만 보이고 정산에서 빠짐), 미확정 = **조용한 회색 "미확정" 글자 Tag**(테두리·아이콘 없음, 메타 줄 맨 끝) + 금액 text/secondary — 주황은 Callout의 점 하나에만(v1.3), 중복 의심 = 빨강 Tag, 환불 = 파랑 Tag. 기획 원칙("금융 원본은 본인만, 공동 공개는 명시적 승인 후")을 시각 언어로 옮겼다.
- **여정 상태**: 시작 전 = Info 파랑 연한 면, 진행 중 = 보라 솔리드 + 노을 점(유일하게 꽉 찬 배지라 눈에 띔), 종료 = 회색.

## 2. 로고

- 워드마크 「여정」: Gothic A1 Black, 자간 −7%, 외곽선 처리. **두 ㅇ 콘셉트**: 첫 글자 ㅇ은 출발(보라), 마지막 받침 ㅇ은 도착(Sunset). 장식은 이 색 대비 하나뿐이다.
- 라틴 보조 표기(yeojeong)는 **넣지 않는다**. 한글 두 글자가 가장 강한 식별자이고, 로마자 표기는 발음이 직관적이지 않다.
- 컴포넌트: `Logo/Primary`(흰/밝은 배경), `Logo/Inverse`(보라·어두운 배경, 흰 글자 + 노을 받침), `Logo/Mono`(neutral/900), `Logo/AppIcon`(1024, 모서리 229, 스무딩 60%), `Logo/Lockup`(Layout=Horizontal|Vertical, 태그라인 "함께 쓰고, 정확히 나누는 여행 공동 지갑").
- 앱 아이콘 축약 마크: 받침 ㅇ 모양의 두 지점, 출발(흰) → 점 6개 경로 → 도착(노을). 지도 위 두 장소를 잇는 여정. 세로 타원(여의 ㅇ)은 숫자 "0"처럼 보여 금융 앱에서 오독 위험이 있어 쓰지 않았다.
- 여백: 로고 사방 X 이상(X = 받침 ㅇ 높이 ≈ 워드마크 높이의 41%). 최소 크기: 워드마크 높이 20px(인쇄 6mm), 축약 마크 24px.
- 편집용 라이브 텍스트 원본 3종(`Logo/* · 편집용 텍스트` 프레임)은 실험용이다. 화면에는 외곽선 컴포넌트 인스턴스를 쓴다.

## 3. 컬러 토큰

Figma Variables: 컬렉션 **`여정/Color`**(모드 `Light`) · **`여정/Size`**(모드 `Default`). 같은 이름의 Paint style이 `여정/<이름>`으로 있다(변수 바인딩됨). 역할 토큰은 팔레트 변수의 alias다.

### 3-1. 팔레트 (직접 쓰지 말고 역할 토큰을 거쳐 쓴다)
| 그룹 | 값 |
|---|---|
| `primary` | 50 `#F4F3FF` · 100 `#E8E6FF` · 200 `#D0CCFF` · 300 `#AEA7FF` · 400 `#8A80FA` · 500 `#5B4CF5` · 600 `#4935D4` · 700 `#3A24B0` · 800 `#2A1789` · 900 `#1C0B63` |
| `neutral` | 0 `#FFFFFF` · 50 `#F9F9FC` · 100 `#F3F3F7` · 200 `#E6E6EC` · 300 `#D4D4DC` · 400 `#A8A8B3` · 500 `#70707E` · 600 `#5C5C69` · 700 `#42424F` · 800 `#292935` · 900 `#14141E` |
| `sunset` | 50 `#FFF1EC` · 100 `#FFE0D6` · 300 `#FFB49E` · 500 `#FF7A59` · 700 `#C4411E` |
| `success` | 50 `#E8F7EE` · 500 `#16A34A` · 700 `#0F7A3A` |
| `warning` | 50 `#FFF5E1` · 500 `#F59E0B` · 700 `#B45309` |
| `error` | 50 `#FEEDEE` · 500 `#E5484D` · 700 `#C0262D` · 800 `#9E1B21` |
| `info` | 50 `#EAF3FF` · 500 `#2F80ED` · 700 `#1A5DC0` |

### 3-2. 역할 토큰
| 토큰 | HEX | 원본 | 용도 |
|---|---|---|---|
| `bg/canvas` | `#F9F9FC` | neutral/50 | 앱 전체 배경(화면 바탕) |
| `bg/surface` | `#FFFFFF` | neutral/0 | 카드·시트·리스트 바탕 |
| `bg/subtle` | `#F3F3F7` | neutral/100 | 입력창·비활성·보조 영역 바탕 |
| `bg/muted` | `#E6E6EC` | neutral/200 | 트랙·스켈레톤·구분 블록 |
| `bg/brand` | `#5B4CF5` | primary/500 | 주요 버튼·활성 탭·강조 면 |
| `bg/brand-pressed` | `#4935D4` | primary/600 | 주요 버튼 눌림 |
| `bg/brand-subtle` | `#F4F3FF` | primary/50 | 선택된 항목·브랜드 연한 면 |
| `bg/inverse` | `#14141E` | neutral/900 | 토스트·반전 면 |
| `bg/danger` | `#C0262D` | error/700 | 파괴적 버튼(삭제·나가기·강퇴) 바탕 (흰 글자 5.9:1) |
| `bg/danger-pressed` | `#9E1B21` | error/800 | 파괴적 버튼 눌림 |
| `bg/pressed` | `#F3F3F7` | neutral/100 | Secondary·리스트 행 눌림 |
| `bg/dim` | `#14141E` @48% | - | 바텀시트·다이얼로그 뒤 딤 |
| `border/default` | `#E6E6EC` | neutral/200 | 카드·입력창 기본 테두리, 디바이더 |
| `border/strong` | `#D4D4DC` | neutral/300 | 강조 테두리·Secondary 버튼 |
| `border/focus` | `#5B4CF5` | primary/500 | 포커스 링·선택 테두리 |
| `border/error` | `#E5484D` | error/500 | 오류 입력 테두리 |
| `text/primary` | `#14141E` | neutral/900 | 본문·제목 (18.3:1) |
| `text/secondary` | `#5C5C69` | neutral/600 | 보조 설명·메타 정보 (6.6:1) |
| `text/tertiary` | `#70707E` | neutral/500 | 플레이스홀더·시각 표기 (4.9:1) |
| `text/disabled` | `#A8A8B3` | neutral/400 | 비활성 텍스트 (장식 수준) |
| `text/inverse` | `#FFFFFF` | neutral/0 | 진한 면 위 텍스트 |
| `text/brand` | `#4935D4` | primary/600 | 브랜드 강조 텍스트·링크 (7.7:1) |
| `text/error` | `#C0262D` | error/700 | 오류 메시지 |
| `text/success` | `#0F7A3A` | success/700 | 완료·성공 메시지 |
| `icon/default` | `#42424F` | neutral/700 | 기본 아이콘 |
| `icon/subtle` | `#70707E` | neutral/500 | 보조·비활성 탭 아이콘 |
| `icon/disabled` | `#A8A8B3` | neutral/400 | 비활성 아이콘 |
| `icon/brand` | `#5B4CF5` | primary/500 | 활성 탭·브랜드 아이콘 |
| `icon/inverse` | `#FFFFFF` | neutral/0 | 진한 면 위 아이콘 |
| `brand/accent` | `#FF7A59` | sunset/500 | 로고 도착점·일러스트 포인트(장식 전용) |
| `expense/shared/bg` | `#F4F3FF` | primary/50 | 공동 지출 태그 바탕 |
| `expense/shared/fg` | `#4935D4` | primary/600 | 공동 지출 태그 글자·아이콘 |
| `expense/shared/solid` | `#5B4CF5` | primary/500 | 공동 지출 차트·바·점 |
| `expense/personal/bg` | `#F3F3F7` | neutral/100 | 개인 지출 태그 바탕 |
| `expense/personal/fg` | `#5C5C69` | neutral/600 | 개인 지출 태그 글자·아이콘 |
| `expense/personal/solid` | `#A8A8B3` | neutral/400 | 개인 지출 차트·바·점 |
| `expense/pending/bg` | `#F3F3F7` | neutral/100 | 미확정 태그 바탕(조용한 회색) |
| `expense/pending/fg` | `#5C5C69` | neutral/600 | 미확정 태그 글자 (6.6:1) |
| `expense/pending/border` | `#E6E6EC` | neutral/200 | 미확정 배너·타임라인 카드 테두리(실선 1px) |
| `expense/pending/dot` | `#F59E0B` | warning/500 | 미확정 표시 점 — 미확정에서 주황은 이 점 하나뿐 |
| `trip/upcoming/bg` | `#EAF3FF` | info/50 | 여정 시작 전 배지 바탕 |
| `trip/upcoming/fg` | `#1A5DC0` | info/700 | 여정 시작 전 배지 글자 |
| `trip/upcoming/dot` | `#2F80ED` | info/500 | 여정 시작 전 점 |
| `trip/active/bg` | `#5B4CF5` | primary/500 | 여정 진행 중 배지 바탕(솔리드) |
| `trip/active/fg` | `#FFFFFF` | neutral/0 | 여정 진행 중 배지 글자 |
| `trip/active/dot` | `#FFB49E` | sunset/300 | 여정 진행 중 라이브 점 |
| `trip/ended/bg` | `#E6E6EC` | neutral/200 | 여정 종료 배지 바탕 |
| `trip/ended/fg` | `#42424F` | neutral/700 | 여정 종료 배지 글자 |
| `trip/ended/dot` | `#70707E` | neutral/500 | 여정 종료 점 |
| `feedback/info/bg` | `#EAF3FF` | info/50 | Info 배너(Callout) 바탕 |
| `feedback/info/fg` | `#1A5DC0` | info/700 | Info 배너 아이콘·강조 |
| `feedback/info/border` | `#2F80ED` | info/500 | Info 배너 테두리 |
| `feedback/warning/bg` | `#FFF5E1` | warning/50 | Warning 배너 바탕 (예산 주의 등) |
| `feedback/warning/fg` | `#B45309` | warning/700 | Warning 배너 아이콘·강조 |
| `feedback/warning/border` | `#F59E0B` | warning/500 | Warning 배너 테두리(실선) |
| `feedback/error/bg` | `#FEEDEE` | error/50 | Error 배너·중복 의심 태그 바탕 |
| `feedback/error/fg` | `#C0262D` | error/700 | Error 배너·중복 의심 태그 글자·아이콘 |
| `feedback/error/border` | `#E5484D` | error/500 | Error 배너 테두리 (연동 끊김) |
| `amount/receive` | `#4935D4` | primary/600 | 정산: 받을 금액(+) |
| `amount/send` | `#C4411E` | sunset/700 | 정산: 보낼 금액(−) |
| `amount/default` | `#14141E` | neutral/900 | 일반 금액 |
| `budget/track` | `#E6E6EC` | neutral/200 | 예산 바 트랙 |
| `budget/fill` | `#5B4CF5` | primary/500 | 예산 사용(정상) |
| `budget/caution` | `#F59E0B` | warning/500 | 예산 80% 이상 |
| `budget/over` | `#E5484D` | error/500 | 예산 초과 |

### 3-3. 대비 체크 (흰 배경 기준)
text/primary 18.3 · text/secondary 6.6 · text/tertiary 4.9 · text/brand 7.7 · text/error 5.9 · text/success 5.4 · expense/pending/fg 6.6 · trip/upcoming/fg 6.2 · amount/send 5.1. 모두 AA(4.5) 이상. `text/disabled`(2.4)는 비활성 전용.
Kakao 버튼 라벨(#000 85%) on #FEE500 = 11.8:1.

## 4. 타이포그래피

- 한글: **Noto Sans KR** (Pretendard 없음. 굵기 7단계, 숫자 기본 고정폭).
- 금액: **IBM Plex Sans KR** (v1.3 교체). 기본 숫자가 고정폭(tabular, 32px에서 0000…/1111… 192/192)이라 자릿수가 세로로 정렬되고, ₩ 가로획이 양쪽으로 돌출되어 온전하며, 한글이 들어 있어 "1인 ₩9,467" 같은 혼합 문자열도 같은 서체로 쓸 수 있다. 처음 고른 **Archivo**는 ₩의 두 가로획이 W 윗모서리와 같은 지점에서 끝나는 글리프라 본문 크기에서 왼쪽 획이 잘린 것처럼 보였다(EX-01b 결제 상세 금액에서 발견, 클리핑 문제가 아니라 글리프 디자인). Figma 플러그인 API로는 OpenType `tnum`을 켤 수 없어 기본 숫자가 고정폭인 서체만 후보로 삼았다(Inter/Manrope/DM Sans 탈락).
- 통화 기호는 숫자 앞(₩ ¥ $). ‘원’ 같은 한글 단위가 필요하면 Noto Sans KR 텍스트로 따로 붙인다.
- Amount/* (IBM Plex Sans KR)에는 한글이 들어 있다. 다만 문장형 혼합 문자열("공동 ₩1,026,000 · 내 개인 ₩258,000")은 본문 리듬에 맞게 Noto Sans KR 스타일(Body/·Caption/)을 쓰고, 숫자가 주인공인 금액에만 Amount/*를 쓴다. (v1.2까지의 "Archivo는 한글 불가" 주의는 해소)

| Text style | 서체 | 크기/행간 | 자간(px) | 용도 |
|---|---|---|---|---|
| Display | Noto Sans KR Bold | 32/42 | −0.8 | 스플래시·정산 결과 큰 제목 |
| Heading/H1 | Noto Sans KR Bold | 26/36 | −0.6 | 화면 제목(여정 이름) |
| Heading/H2 | Noto Sans KR Bold | 22/30 | −0.4 | 섹션·시트 제목 |
| Heading/H3 | Noto Sans KR Bold | 18/26 | −0.3 | 카드·헤더 제목 |
| Body/L · Body/L Strong | Regular · Medium | 16/24 | −0.2 | 긴 본문·입력값 / 강조 |
| Body/M · Body/M Strong | Regular · Medium | 15/22 | −0.15 | 기본 본문 / 가맹점명·이름 |
| Body/S · Body/S Strong | Regular · Medium | 13/19 | −0.1 | 보조 설명 |
| Caption | Regular | 12/16 | 0 | 시각·환산 기준·헬퍼 |
| Label/L | Bold | 16/22 | −0.2 | 버튼 L·M |
| Label/M | Bold | 14/20 | −0.1 | 버튼 S·탭·세그먼트 |
| Label/S | Medium | 12/16 | 0 | 태그·배지·칩 |
| Amount/L | IBM Plex Sans KR Bold | 32/40 | −0.6 | 총지출·내가 낼 금액·결제 상세 금액 |
| Amount/M | IBM Plex Sans KR SemiBold | 20/28 | −0.3 | 카드 금액·순잔액 |
| Amount/S | IBM Plex Sans KR SemiBold | 15/20 | −0.1 | 결제 행 금액 |

## 5. 간격 · 라운드 · 그림자 · 레이아웃

- **space/** (4px 기반): 2, 4, 8, 12, 16, 20, 24, 32, 40, 48, 64. 화면 좌우 거터 20, 카드 안쪽 16~20, 카드 사이 12~16, 섹션 사이 24~32.
- **radius/**: xs 4(체크박스·태그) · sm 8(칩·버튼 S) · md 12(버튼·입력·토스트) · lg 16(카드·리스트 그룹) · xl 20(통계 카드·다이얼로그) · 2xl 24(바텀시트 상단) · full 999(pill·아바타·세그먼트).
- **Effect style**: `Elevation/1` 카드(0 1 2 6% + 0 2 6 4%) · `Elevation/2` 드롭다운·토스트(0 4 16 8% + 0 1 4 4%) · `Elevation/3` 시트·다이얼로그(0 12 32 16% + 0 2 8 6%) · `Focus/Ring`(0 0 0 3px primary/200). 그림자 색은 #14141E.
- **layout/**: screen-width 390 · gutter 20 · header-height 56 · nav-height 64(+ 안전영역) · touch-min 44.
- 화면 배경 `bg/canvas`, 카드 `bg/surface` + Elevation/1(또는 border/default 1px).

## 6. 아이콘

Icons8 **Fluency Systems Regular**(모노 선형) PNG 한 가지 스타일. `Icon/<이름>` 24×24 컴포넌트 42종. 구조: `mask`(PNG, 알파 마스크) + `color`(사각형, 기본 `icon/default` 변수). 색 바꾸기 = 인스턴스의 `color` 레이어 fill을 다른 토큰 변수로. 크기 16/20/24.
이름: chevron-down, chevron-right, chevron-left, close, plus, minus, check, check-circle, alert, info, wallet, user, users, user-add, receipt, map, route, calendar, marker, clock, lock, copy, share, link, edit, trash, search, filter, settings, more, bell, logout, exchange, card, bank, coins, pie-chart, list, airplane, home, refresh, menu. + `Brand/KakaoSymbol`(Icons8 kakaotalk 컬러 PNG).
빈 화면 일러스트는 Icons8 Fluency 컬러 PNG(suitcase, receipt). 프사 샘플은 Icons8가 아닌 자체 생성 플레이스홀더(ds/photos/photo_a.png, photo_b.png).

## 7. 컴포넌트

모두 오토레이아웃, 색은 역할 토큰 변수에 바인딩. 속성 이름 뒤의 `#숫자`는 Figma 내부 키다(`components.json`의 `componentProps`에 전체 키가 있음).

| 컴포넌트 | ID | 변형 속성 | 컴포넌트 속성 | 언제 쓰나 |
|---|---|---|---|---|
| **Button** | `24:6232` | Type=Primary/Secondary/Ghost/Danger, Size=L/M/S, State=Default/Pressed/Disabled | Label(TEXT), Leading icon(BOOLEAN), Icon(INSTANCE_SWAP) | 화면의 주요 행동. 한 화면에 Primary는 하나(하단 CTA L, 350 폭). 보조 = Secondary, 텍스트 링크 = Ghost, 삭제·나가기·강퇴 = Danger. 아이콘은 Leading icon 토글 + Icon 교체. |
| **IconButton** | `24:6386` | Type=Ghost/Outline/Filled, Size=L/M/S, State=Default/Pressed/Disabled | Icon(INSTANCE_SWAP) | 아이콘만 있는 버튼. 헤더의 ≡·지갑·마이, 시트 닫기, 복사. Ghost가 기본, Filled = 떠 있는 추가 버튼, Outline = 카드 안 보조 행동. |
| **KakaoLoginButton** | `24:6419` | Size=L/M, State=Default/Pressed | Label(TEXT) | 로그인 화면 전용 소셜 로그인. 카카오 가이드 고정색(#FEE500, 라벨 #000 85%), 심볼 + "카카오 로그인". 화면 폭에 맞춰 늘린다. |
| **Input** | `24:6970` | State=Default/Focus/Error/Disabled | Label(TEXT), Helper(BOOLEAN) | 그룹 생성(그룹명·장소·예산), 닉네임, 초대코드 입력. 라벨은 위, 헬퍼/오류 문구는 아래. 오류는 테두리+문구+아이콘으로 표시. |
| **SegmentedControl** | `24:7040` | Count=2/3, Selected=First/Second/Third | — | 같은 데이터의 보기 전환. 리스트/타임라인(2개), 개인/공동 전환(2개, 라벨 교체), 전체·공동·개인 필터(3개). |
| **Chip** | `24:7111` | State=Default/Selected/Disabled | Label(TEXT) | 선택형 칩(복수 선택). 부담 인원 고르기(일부 인원만 참여한 지출), 결제 내역 필터, 날짜 점프. |
| **Checkbox** | `24:8822` | Checked=Off/On, State=Default/Disabled | Label(TEXT) | 약관 동의(온보딩)·복수 선택. 라벨 전체가 터치 영역. [필수]/[선택]은 라벨 앞. |
| **Toggle** | `24:8839` | Value=Off/On, State=Default/Disabled | — | 즉시 반영되는 켜기/끄기. 알림 설정, 결제 상세의 공개 여부 등. |
| **AvatarToggle** | `24:17006` | Selected=On/Off | Name(TEXT) | 부담 인원 선택(결제 상세 시트·일부 인원만 참여한 지출). 프사 + 이름. Selected=On = 체크 배지 + 선명, Off = 40% 흐림 + 이름 보조색. 복수 선택. |
| **Tag** | `24:7086` | Type=Shared/Personal/Pending/Duplicate/Refund, Size=M/S | — | 결제 행·상세·정산 내역의 비대화형 라벨. Personal(자물쇠) / Pending(회색 "미확정" 글자만, 테두리·아이콘 없음, 메타 줄 맨 끝) / Duplicate(중복 의심, 빨강) / Refund(환불, 파랑). Shared는 레거시 — 공동 결제는 AvatarStack. |
| **Badge** | `24:6998` | Status=Upcoming/Active/Ended, Size=M/S | — | 여정 상태 표시(여정 카드·헤더·여정 정보). 시작 전(파랑) → 진행 중(보라 솔리드+노을 점) → 종료(회색). label에 D-3 등 문구 가능. |
| **Avatar** | `24:7235` | Color=Violet/Sunset/Green/Blue/Amber/Gray, Size=L/M/S/XS/XL, Source=Initial/Photo/Default | Ring(BOOLEAN), Me(BOOLEAN), Left(BOOLEAN) | 그룹원 한 명의 프사. Source=Photo(카카오 프사, 샘플은 회색조 플레이스홀더) → Default(「여정」 기본 이미지, **Color=Gray**; Violet·Sunset은 레거시) → Initial(로딩 실패·텍스트 폴백). Size XS20/S28/M36/L48/XL64. Ring = 흰 테두리(스택), Me = 나(보라 테두리 2), Left = 나간 멤버(회색+40%). |
| **AvatarStack** | `24:7268` | Count=5+/2/3/4, Size=M/S/XS | Overflow(BOOLEAN) | 공동 결제의 부담 인원·여정 참여자 요약. Count=2/3/4/5+(최대 4명 + "+N" 칩), Size=XS/S/M, 겹침 −6(XS·S)/−8(M), 흰 테두리. 접근성 라벨 "준용 외 3명"을 붙인다. |
| **Avatar/DefaultImage** | `24:15850` | Color=Violet/Sunset/Gray | — | 서비스 기본 프로필 이미지 1024 원본. 기본 Color=Gray(neutral/100 바탕 + neutral/400 머리 · neutral/300 어깨). Violet·Sunset은 레거시 — 쓰지 않음. 직접 쓰지 말고 Avatar Source=Default, Color=Gray를 쓴다. |
| **TopHeader** | `24:7328` | Type=Group/Back/Logo | Status badge(BOOLEAN), Menu(BOOLEAN) | 모든 여정 화면 상단 56px. Group = ≡(그룹 구성원 드로어, Menu 속성) + 그룹명 + 아래 화살표(그룹 목록 드롭다운) + 지갑·마이. Back = 상세/지갑/마이. Logo = 소속 여정이 없을 때. |
| **NavItem** | `24:7347` | State=Active/Inactive | Label(TEXT), Icon(INSTANCE_SWAP) | BottomNav 안의 탭 하나(아이콘 24 + 라벨). 단독으로 쓰지 않고 BottomNav 변형 안에서 Active/Inactive로 쓰인다. Label·Icon 속성으로 교체. |
| **BottomNav** | `24:7446` | Tabs=2/3, Active=First/Second/Third, Phase=Ongoing/Ended | — | 현재 여정 안에서의 이동(하단 64px + 안전영역). 기본 Tabs=3: 결제내역 / 현황 / 여정 정보. Phase=Ended(종료 후)면 가운데가 「정산」. Active로 활성 탭 선택. Tabs=2는 레거시. |
| **ListItem** | `24:8635` | Type=Navigation/Value/Selected/Destructive | Subtitle(BOOLEAN), Leading icon(BOOLEAN) | 범용 행. 여정 정보(기간·장소·예산·초대코드), 그룹 드롭다운 목록, 마이페이지 메뉴(로그아웃), 지갑 계좌. Navigation / Value / Selected / Destructive. |
| **Callout** | `24:12804` | Tone=Pending/Info/Warning/Disconnected | Label(TEXT), Chevron(BOOLEAN) | 화면 상단 한 줄 배너. Pending(회색 바탕 + 연회색 테두리 + 주황 점 하나, "확인 필요 n건") / Info / Warning / Disconnected("토스 연결이 끊겼어요 › 다시 연결", 레이어 직접 수정). 부모 안에서 FILL. |
| **PaymentRow** | `24:8257` | Type=Shared/Personal/Pending/Refund/Duplicate, State=Default/Pressed | Changed(BOOLEAN) | 결제 내역 한 줄. Shared = 부담 인원 AvatarStack(participants), Personal·Duplicate·Refund = Tag(메타 줄 앞), Pending = 메타 줄 맨 끝 회색 "미확정" + 금액 text/secondary. Changed = "· 변경됨". Refund = 마이너스 금액 + 링크 아이콘 + 원 결제 시각. |
| **DateHeader** | `24:8264` | — | — | 결제 내역 리스트·타임라인의 날짜 구분 헤더. 날짜 + n일차 + 그날 합계(KRW). |
| **TimelineItem** | `24:8408` | Type=Shared/Personal/Pending/Now, Position=Middle/Last | — | 결제 내역 타임라인 노드. 점 = 공동 보라 / 개인 회색 / 미확정 빈 회색 링. 공동 카드는 participants 스택, 미확정은 메타 줄 끝 "미확정" + 금액 보조색. Now = 현재 시각. 날짜의 마지막만 Position=Last. |
| **StatCard** | `24:8452` | Type=Default/Brand, Size=L/M | — | 현황 탭 요약 숫자. 총지출 / 예산 / 내가 낼 금액. Brand(보라 면)는 화면당 하나 — "내가 낼 금액"에만. L=350, M=167(2열). |
| **BudgetProgress** | `24:8517` | State=Normal/Caution/Over | — | 예산 대비 사용률(공동 지출 기준). 정상(<80% 보라) / 주의(80~100% 주황) / 초과(>100% 빨강 + 초과 문구). |
| **SettlementRow** | `24:8571` | Net=Receive/Send/Even | Me(BOOLEAN) | 정산 요약의 사람별 행. 결제합·부담액·순잔액(+받을/−보낼). avatar는 중첩 Avatar(사진/기본/이니셜, Me 표시). 탭하면 그 사람의 결제 내역. |
| **TransferRow** | `24:8575` | — | — | 정산 요약의 송금 권장안 한 줄(누가 → 누구에게 얼마). 실제 송금은 하지 않고 금액 복사만. |
| **BottomSheet** | `24:8647` | — | Content(INSTANCE_SWAP), Title(TEXT), CTA(BOOLEAN), Close(BOOLEAN) | 그룹 드롭다운, 결제 상세(공동/개인 지정·부담 인원), 초대코드 공유. 손잡이+제목+닫기, Content 슬롯(hug), CTA, 하단 안전영역 패딩 34. 뒤에 bg/dim. |
| **SheetContent/PaymentDetail** | `24:18023` | — | Pending(BOOLEAN) | BottomSheet Content 슬롯용 결제 상세: 금액 요약(detail 줄 끝에 Pending 속성으로 "미확정" 태그) · 개인/공동 전환 · 부담 인원 AvatarToggle ×4. Content 속성으로 교체. |
| **Slot/Placeholder** | `24:8645` | — | — | BottomSheet Content 슬롯의 기본 자리표시자. 직접 쓰지 않는다 — 내용 컴포넌트로 교체(Content 속성)하거나 시트를 detach해서 채운다. |
| **Dialog** | `24:8719` | Type=Default/Danger/SharedToPersonal | — | 되돌리기 어려운 결정 확인. Default(여정 종료 등) / Danger(그룹 삭제·강퇴) / SharedToPersonal("공동에서 뺄까요?" → 개인으로 변경). |
| **Toast** | `24:8745` | Type=Success/Info/Error | Action(BOOLEAN) | 짧은 결과 알림(2~3초). 초대코드 복사, 공동 지출로 지정, 저장 실패. 하단 내비 위 16px. 액션 하나까지(Action 속성). |
| **EmptyState** | `24:8783` | Type=NoTrip/NoPayments | — | 빈 화면. NoTrip = 소속 여정 없음(여정 만들기/초대코드로 참여), NoPayments = 진행 중인데 결제 없음. |
| **Divider** | `24:8796` | Type=Full/Inset/Thick | — | 구분선. Inset = 리스트 행 사이(왼쪽 20 들여쓰기), Full = 화면 폭, Thick = 섹션 사이 8px. |
| **Logo/Primary** | `14:476` | — | — | 기본 워드마크(흰/밝은 배경). 크기는 instance.rescale(높이/96). |
| **Logo/Inverse** | `14:481` | — | — | 프라이머리·어두운 배경 위 흰 워드마크(받침 ㅇ은 노을색 유지). 스플래시에 사용. |
| **Logo/Mono** | `14:486` | — | — | 단색(neutral/900). 흑백 인쇄·도장. |
| **Logo/AppIcon** | `14:506` | — | — | 앱 아이콘/축약 마크. 작게 쓸 땐 rescale(px/1024). 최소 24px. |
| **Logo/Lockup** | `14:658` | Layout=Horizontal/Vertical | — | 태그라인 결합형. Vertical = 스플래시/온보딩, Horizontal = 웹 헤더·문서. |

### 7-1. 화면 조립 규칙 (예시 화면 에이전트용)
- 프레임 390×844, 배경 `bg/canvas`. 위에서부터 `TopHeader`(56) → 내용(좌우 20) → `BottomNav`(64, 아래 안전영역은 화면 쪽에서 bg/surface로). 하단 CTA는 `Button Primary L`을 350 폭(또는 FILL)으로.
- **헤더**: 여정 화면은 `TopHeader Type=Group`(Menu=true 기본: 왼쪽 ≡ → 그룹 구성원 드로어, 그룹명 + 아래 화살표 → 그룹 목록, 오른쪽 지갑·마이). 상세·지갑·마이페이지는 `Type=Back`, 여정 없음은 `Type=Logo`.
- **하단 내비(3탭)**: `BottomNav Tabs=3` — 결제내역(receipt) / 현황(pie-chart) / 여정 정보(info). 활성 탭은 `Active=First|Second|Third`. 여정 진행 중·시작 전은 `Phase=Ongoing`, 종료 후는 `Phase=Ended`(가운데 탭이 「정산」, coins). `Tabs=2`는 레거시라 새 화면에 쓰지 않는다.
- **결제내역 탭(진행 중, Active=First)**: TopHeader(Group) → `Callout Tone=Pending`("확인 필요 n건", 미확정이 있을 때만; 회색 배너 + 주황 점) → SegmentedControl Count=2(리스트/타임라인) → DateHeader + PaymentRow 반복(사이 Divider Inset) / 타임라인이면 DateHeader + TimelineItem(간격 0, 맨 위 Type=Now, 날짜의 마지막만 Position=Last). **공동 결제 행은 `Type=Shared`(부담 인원 프사 스택 participants → Count를 실제 인원에 맞춤)**, 개인·중복 의심·환불은 각 Type(Tag, 메타 줄 앞), **미확정은 `Type=Pending`(메타 줄 맨 끝 회색 "미확정" + 금액 보조색)** — 가맹점명 앞이나 금액 옆에 두지 않는다. 공동 결제가 수정됐으면 `Changed` on. 결제자 아바타는 Source=Photo(카카오)/Default.
- **현황 탭(Active=Second, Phase=Ongoing)**: StatCard Brand L("내가 낼 금액") → StatCard M ×2(총지출·예산) → BudgetProgress → (필요 시) SettlementRow로 인당 현재 잔액 미리보기. 예산 80% 이상이면 상단에 `Callout Tone=Warning`.
- **여정 정보 탭(Active=Third)**: Badge(상태) + ListItem(기간·장소·예산·초대코드 Value/Navigation) + AvatarStack/그룹원 목록. 시작 전이면 Button Primary L "여정 시작" + Dialog(시작 확인).
- **정산 탭(Phase=Ended, Active=Second)**: StatCard(총지출·1인 n빵) → SettlementRow 반복(탭하면 그 사람 결제 내역 = PaymentRow 목록, Tag로 공동/개인 구분) → TransferRow(송금 권장안, 실제 송금 X).
- **결제 상세**: BottomSheet(Title "결제 상세") + Content = `SheetContent/PaymentDetail`(금액 요약 · 개인/공동 SegmentedControl · 부담 인원 AvatarToggle). 미확정 결제면 SheetContent의 `Pending` 속성을 켜서 detail 줄 끝에 "미확정"을 표시한다. 공동 → 개인으로 바꾸면 `Dialog Type=SharedToPersonal`로 확인. 필요하면 ListItem(Value: 원통화·환율·환산액)을 아래에 덧붙인다.
- **그룹 구성원 드로어(≡)**: 전용 컴포넌트는 없다. 왼쪽 패널(폭 300, bg/surface, Elevation/3) 또는 BottomSheet 안에 ListItem + Avatar로 구성하고 뒤에 bg/dim.
- **여정 없음**: TopHeader(Type=Logo) + EmptyState(NoTrip). **로그인**: Logo/Lockup(Vertical) 또는 Logo/Primary + KakaoLoginButton(L). 스플래시: bg/brand 전면 + Logo/Inverse.
- **약관 동의**: Checkbox 반복 + Button Primary L. 입력: Input(그룹명·장소·예산·닉네임·초대코드).
- 상태 표현: 공동 = `AvatarStack`(PaymentRow/TimelineItem Shared에 내장), 개인/미확정/중복 의심/환불 = `Tag` Type, 여정 상태 = `Badge` Status, 배너 = `Callout` Tone(연동 끊김 = Disconnected). 금액 ± = `amount/receive|send`.
- 그룹원 표시는 전부 `Avatar` 인스턴스로: 프사 규칙은 7-2.

### 7-2. 프로필 사진(프사) 규칙 — v1.2

**소스 우선순위**
1. **카카오 프로필 사진** → `Avatar Source=Photo` (Color=Gray는 로딩 중 바탕). `photo` 레이어 fill을 IMAGE로 교체. 문서·시안의 사진은 채도 낮은 회색조 플레이스홀더(흐린 인물 그라데이션)이며 **실제 카카오 프사로 교체**한다.
2. **사진이 없으면 「여정」 기본 이미지** → `Source=Default, Color=Gray` (`Avatar/DefaultImage Color=Gray`: neutral/100 바탕 + neutral/400 머리 · neutral/300 어깨, 브랜드색 없음 — v1.3 사용자 피드백 "그냥 회색 배경에 회색 아바타"). `Color=Violet|Sunset`은 **레거시 — 쓰지 않음**(기존 인스턴스 보호용으로만 남김).
3. **이미지 로딩 실패·텍스트 위주 목록** → `Source=Initial` (이니셜 1자, 합류 순서대로 Violet→Sunset→Green→Blue→Amber→Gray).

**크기**: XS 20 · S 28 · M 36 · L 48 · XL 64. 결제 행 결제자 = M, 스택 = XS(행 안)·S(카드)·M(헤더/정보), 선택 토글 = L, 마이페이지 = XL.

**스택 (`AvatarStack`)**: Count=2|3|4|5+. 최대 4명을 보이고 나머지는 "+N" 칩(bg/muted + text/secondary, `overflow > count` 텍스트). 겹침 −6(XS·S) / −8(M), 왼쪽 사람이 위. 모든 아바타 `Ring=true`(흰 테두리 1.5, 큰 크기 2). 순서: 결제자 → 나 → 합류 순.

**나 / 나간 멤버**
- 나: `Me=true` → 보라(border/focus) 안쪽 테두리 2px. 이름 옆에는 SettlementRow `Me` 배지("나")를 함께 쓴다.
- 나간 멤버: `Left=true` → 채도 제거 + 흰 막 60%(약 40% 보임). 정산·과거 결제에는 계속 표시하되 이름 뒤에 "(나감)"을 붙인다.

**부담 인원 선택 (`AvatarToggle`)**: Selected=On = 체크 배지(bg/brand) + 선명, Off = 40% 흐림 + 이름 text/tertiary. 탭 영역은 56×(48+이름) 이상.

**접근성**: 사진만으로 사람을 구분하지 않는다. 상세·선택·정산 화면은 항상 이름을 병기하고, 행 안의 스택에는 접근성 라벨("준용, 민지 외 2명이 나눠 냄")을 붙인다. 색(Me 테두리·Left 흐림)만으로 상태를 전달하지 않고 "나"/"(나감)" 텍스트를 함께 쓴다.

## 8. 결정 기록 (노션 TODO → 우리가 정함)
- 결제 내역은 **리스트 + 타임라인 둘 다** 제공하고, SegmentedControl로 전환한다. 리스트는 빠른 훑기용, 타임라인은 하루 흐름(현재 시각 Now 노드)용.
- 하단 내비는 와이어프레임 결정에 맞춰 **3탭**(결제내역 / 현황 / 여정 정보)이 기본이고, 여정 종료 후에는 가운데 탭이 「정산」으로 바뀐다(`Phase=Ended`). 2탭(결제·현황 / 여정 정보)은 레거시 변형으로만 남겨 두었다.
- 노션 "그룹 구성원은 햄버거바로" → TopHeader Group 변형 왼쪽에 ≡(Icon/menu) 버튼을 둔다(`Menu` 속성, 기본 true).
- 미확정 결제가 있으면 결제내역 상단에 `Callout Tone=Pending`("확인 필요 n건")을 띄워 검토로 유도한다.
- (v1.2, 사용자 결정) 공동 결제는 "공동 4명" 태그 대신 **부담 인원 프사 스택**으로 보여 준다. 프사는 카카오 프사 → 없으면 「여정」 기본 이미지. 기존 `Tag Type=Shared`는 레거시로 남겨 두었다(PaymentRow/TimelineItem Shared 변형에서는 숨김 레이어).
- 환불·취소는 별도 행(`PaymentRow Type=Refund`, 마이너스 금액 + 원 결제 시각 링크), 같은 금액·가맹점이 겹치면 `Type=Duplicate`(중복 의심 Tag)로 표시하고 사용자 확인을 받는다.
- 연동이 끊기면 결제내역 상단에 `Callout Tone=Disconnected`("토스 연결이 끊겼어요 › 다시 연결").
- (v1.3, 사용자 피드백) 기본 프로필 이미지는 회색 배경 + 회색 아바타(`Color=Gray`). 브랜드색 Violet/Sunset 기본 이미지는 레거시. 사진 플레이스홀더도 회색조로 낮춰 전체 톤을 차분하게.
- (v1.3, 사용자 피드백) 미확정은 덜 띄게: 태그는 회색 바탕·회색 글자 "미확정"만(높이 20/18, 11~12px), 위치는 메타 줄 맨 끝, 금액은 text/secondary. 배너(Callout Pending)는 회색 바탕 + 연회색 실선 테두리 + 주황 점 하나. 토큰 `expense/pending/*`는 회색으로 재지정하고 `expense/pending/dot`(warning/500)을 추가했다.
- (v1.3, 사용자 피드백) 점선 테두리 전면 제거(01·02에서 39개 노드: 컴포넌트 세트 외곽선 29, 로고 여백 가이드 2, Slot 1, Tag Pending 2, 타임라인 미확정 카드·점 4, Callout Pending 1). 미확정의 의미는 색(회색) + 금액 보조색으로만 전달한다.
- (v1.3) 금액 서체를 Archivo → IBM Plex Sans KR로 교체(₩ 글리프가 잘려 보이던 문제 해결, 한글 혼합 지원, 숫자 폭은 거의 동일).
- 미확정 결제 = 자동 수집됐지만 공동/개인이 아직 정해지지 않은 결제. 금액을 보조색으로 낮추고 주황 점선으로 표시한다.
- 예산은 공동 지출 기준 사용률로 정상(<80%) / 주의(80~100%) / 초과(>100%) 3단계.
- 아바타 색은 그룹 합류 순서대로 Violet → Sunset → Green → Blue → Amber → Gray로 고정 배정한다.

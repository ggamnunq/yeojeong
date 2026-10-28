# 03 예시 화면 — 작업 노트

Figma 페이지 「화면」 → 섹션 `03 예시 화면` (node `24:9887`, 원점 9000,0, 1800×1547, fill #F4F5F7).
**DS v1.2 반영 완료.** v1.1(Callout · TopHeader Menu · BottomNav Phase · BottomSheet hug)과 v1.2(프사 규칙 · 공동 결제 AvatarStack · SheetContent/PaymentDetail · Dialog SharedToPersonal)를 반영했다. 아래 ID는 v1.2로 다시 만든 최종본이다.
목적: 디자인 시스템(섹션 01·02) 컴포넌트 **인스턴스만으로** 실제 화면을 만들 수 있는지 증명.
작성 2026-10-28 · 예시 화면 에이전트

## 노드 ID (`ex/ids.json`에도 있음)

| 노드 | ID | 위치(섹션 내부) |
|---|---|---|
| **EX-01 여정 진행 중 · 결제내역(리스트)** (390×844, clipsContent) | `24:25388` | (80, 240) |
| **EX-01b 결제 상세 · 미확정 → 개인 확정 (바텀시트)** | `24:26006` | (510, 240) |
| **EX-01c 공동 → 개인 확인** | `24:26487` | (940, 240) |
| Caption · 카드 (WF-18 기반 · 컴포넌트 · 결정) | `24:29715` | (1370, 240), 폭 360 |
| Caption · 섹션 제목 / EX-01 라벨 / EX-01b 라벨 / EX-01c 라벨 | `24:29709` / `24:29712` / `24:29713` / `24:29714` | |
| EX-01 내부: TopHeader `24:25394` · scroll `24:25416` · Callout(미확정 배너) `24:25418` · SegmentedControl `24:25426` · BottomNav `24:25988` | | |
| EX-01b 내부: BottomSheet `24:26042` · 딤 `24:26041` | | |
| EX-01c 내부: Dialog `24:26523` · 딤 `24:26522` | | |

v1.1까지 쓰던 로컬 콘텐츠 컴포넌트 `EX/Sheet content · 결제 상세(미확정)`는 v1.2 `SheetContent/PaymentDetail`로 바꾸면서 삭제했다.

PNG: `ex/shots/EX-01.png` · `ex/shots/EX-01b.png` · `ex/shots/EX-01c.png`(모두 1x) · `ex/shots/section_03.png`(0.5x) · `ex/shots/section_03_1x.png` · 비교 `ex/shots/compare_WF-18_EX-01.png`(왼쪽 WF-18, 오른쪽 EX-01).

## 화면 구조 (EX-01, 위→아래)

1. **StatusBar (system)**: 직접 그림(허용된 예외). 18:34, Icons8 ios-glyphs wifi·full-battery(#14141E). 배경은 `bg/surface` 변수.
2. **TopHeader** `Type=Group`, `Menu`=true(왼쪽 ≡), Status badge 끔. group name = "오사카 3박 4일". 배치는 WF-18과 같다(≡ · 그룹명 ▾ · … · 지갑 · 마이).
3. **scroll · 결제내역**: 오토레이아웃 세로, `layoutGrow 1` + clipsContent. 646px만 보이고 Day 1 첫 행에서 잘린다.
   - controls(패딩 16/20/8/20, 간격 12): **Callout** `Tone=Pending`(Label "확인 필요 2건", Chevron true, FILL) → **SegmentedControl** `Count=2, Selected=First`(리스트 | 타임라인, FILL)
   - **DateHeader** "11.13 (금)" / "Day 2" / "공동 ₩143,950"(한글이 섞여 `daily total`에 Body/S 스타일) → PaymentRow ×5(사이 Divider `Type=Inset`)
   - **DateHeader** "11.12 (목)" / "Day 1" / "공동 ₩208,840" → PaymentRow ×4
4. **bottom bar** (`bg/surface`): **BottomNav** 기본 변형 `Tabs=3, Active=First, Phase=Ongoing`, override 0개(결제내역 / 현황 / 여정 정보). 아래에 안전영역 34px와 홈 인디케이터(시스템 크롬).

### v1.2 결제 행 (PaymentRow)
- **공동(Type=Shared)**: Tag가 숨겨지고 노출된 중첩 인스턴스 `participants`(AvatarStack XS)가 들어간다. 행마다 실제 부담 인원으로 Count를 맞췄다. **우메다 공중정원·오사카성·쿠시카츠(+이치란·난카이) = 4, MK택시 = 2(준용·민지)**.
- **스택 순서**(spec 7-2): 결제자 → 나 → 합류 순. 슬롯마다 사람에 맞춰 Source·Color·사진·Me를 지정하고, 슬롯 레이어 이름도 `avatar · 이름`으로 맞췄다.
  - 우메다 [민지, 준용, 태현, 수빈] · MK택시 [준용, 민지] · 오사카성 [수빈, 준용, 민지, 태현] · 쿠시카츠 [태현, 준용, 민지, 수빈] · 이치란 [준용, 민지, 태현, 수빈] · 난카이 [민지, 준용, 태현, 수빈]
- **프사 규칙**: 준용·민지 = `Source=Photo`(Color=Gray, DS 샘플 플레이스홀더 사진. 사람마다 다른 이미지 해시를 AvatarStack 원본에서 읽어 재사용), 태현 = `Source=Default, Color=Violet`, 수빈 = `Source=Default, Color=Sunset`, 나(준용) = `Me=true`(보라 테두리). 스택 슬롯과 결제자 아바타(`payer avatar`, M) 모두 같은 규칙이다. 8배 확대로 겹침을 확인했다: 왼쪽이 위(itemReverseZIndex), 흰 Ring으로 분리, Me 테두리 보임.
- **개인·미확정**: Tag(개인 / 미확정) 그대로, 결제자는 모두 나 → Photo + Me.
- **메타**: "시각 · ○○ 결제"(내 결제는 "내 결제"). 스택(부담 인원)과 결제자를 구분하려고 DS v1.2 샘플("민지 결제") 표기를 따랐다.

### EX-01b (결제 상세 시트)
EX-01 복제 + `bg/dim` + **BottomSheet**(Title "결제 상세", Content = `SheetContent/PaymentDetail`(24:18023), CTA "개인으로 확정", 닫기 켬).
- summary: merchant "패밀리마트 난바역점", amount "₩11,770", detail "¥1,280 · 100엔 = 919.20원 · 11.13 08:50 · 내 결제"
- expense type(SegmentedControl Count=2): `Selected=First`(개인)
- 부담 인원(AvatarToggle ×4 + "부담 인원 n명 / 1인 ₩…" 헤더): **숨김**. AvatarToggle은 `Selected=On|Off`뿐이고 비활성 변형이 없어서, 개인 확정 상태에서는 `participants header`와 `participants` 레이어를 숨겼다(Off는 "선택 안 됨"이지 "비활성"이 아니다).
- 시트 높이는 hug(356, 하단 패딩 58은 컴포넌트 기본값), 잘림 없음.

### EX-01c (공동 → 개인 확인)
EX-01 복제 + `bg/dim` + **Dialog** `Type=SharedToPersonal`(가운데, 35/324, 320×196). 문구("공동에서 뺄까요?" / "다른 멤버의 정산에서도 빠져요. 이 결제는 나만 볼 수 있게 돼요.")와 버튼(취소 / 개인으로 변경)은 컴포넌트 기본값 그대로다. 그 외 요소는 없다.

## 사용한 컴포넌트 · 변형

| 프레임 | 배치 인스턴스 | 중첩 포함 | 종류 |
|---|---|---|---|
| EX-01 | 22 | 105 | 15 (숨겨진 Badge, Avatar/DefaultImage 포함) |
| EX-01b | 23 | 126 | 19 |
| EX-01c | 23 | 110 | 17 |

| 컴포넌트 | 변형 | 수(EX-01) | 덮어쓴 것 |
|---|---|---|---|
| TopHeader | Type=Group | 1 | group name, Menu=true, Status badge=false |
| Callout | Tone=Pending | 1 | Label="확인 필요 2건", Chevron=true (속성만) |
| SegmentedControl | Count=2, Selected=First | 1 | label 1·2, FILL |
| DateHeader | (단일) | 2 | date, day, daily total(텍스트 스타일 Body/S) |
| PaymentRow | Type=Pending ×2 · Shared ×6 · Personal ×1, State=Default | 9 | merchant, meta, amount, original amount |
| ↳ Avatar (payer avatar) | Size=M, Source=Photo(Gray) / Default(Violet·Sunset) | 9 | Source, Color, Me, photo fill |
| ↳ AvatarStack (participants) | Count=4, Size=XS ×5 · Count=2, Size=XS ×1 | 6 | Count |
| ↳↳ Avatar (스택 슬롯) | Size=XS, Ring=true, Photo/Default | 22 | Source, Color, Me, photo fill, 레이어 이름 |
| ↳ Tag | Type=Pending ×2 · Personal ×1, Size=S | 3 | — (기본 라벨) |
| Divider | Type=Inset | 7 | — |
| BottomNav | Tabs=3, Active=First, Phase=Ongoing | 1 | — (override 0) |
| ↳ NavItem / IconButton(헤더) | 기본값 | 3 / 3 | — |

EX-01b에 추가: BottomSheet · SheetContent/PaymentDetail(↳ SegmentedControl, AvatarToggle ×4 숨김) · ↳ Button Primary L(cta) · ↳ IconButton Ghost M(close).
EX-01c에 추가: Dialog Type=SharedToPersonal(↳ Button Secondary M · Primary M).

색: 직접 만든 노드의 칠은 모두 변수 바인딩이다(`bg/canvas`, `bg/surface`, `bg/dim`, `text/*`). 인스턴스 색 override는 없다. 바인딩 안 된 칠은 상태바 시각과 홈 인디케이터(OS 크롬 예외), 그리고 DS Avatar 안의 숨겨진 `left overlay > desaturate`(피드백 12)뿐이다.

## 데이터 출처

`wf/screens.md` 「샘플 데이터 정의」를 그대로 썼다. 오사카 3박 4일, 11.13(금) 18:34 시점, Day 2. 멤버(가입 순): 준용(나) · 민지 · 태현 · 수빈.
- Day 2(최신순): 551 호라이 난바본점 18:20 준용 ¥2,800 ₩25,740 미확정 / 우메다 스카이빌딩 공중정원 16:40 민지 ¥8,000 ₩73,540 공동 4명 / MK택시 14:10 준용 ¥2,860 ₩26,290 공동 2명(준용·민지) / 오사카성 천수각 10:30 수빈 ¥4,800 ₩44,120 공동 4명 / 패밀리마트 난바역점 08:50 준용 ¥1,280 ₩11,770 미확정
- Day 1: 쿠시카츠 다루마 신세카이점 19:30 태현 ¥12,800 ₩117,660 공동 4명 / 돈키호테 도톤보리점 17:40 준용 ¥8,640 ₩79,420 개인 / 이치란 라멘 도톤보리점 13:05 준용 ¥3,960 ₩36,400 공동 4명 / 난카이 라피트 간사이공항역 11:20 민지 ¥5,960 ₩54,780 공동 4명
- 일자별 공동 합계: Day 2 ₩143,950 (44,120+26,290+73,540), Day 1 ₩208,840. 환율 100엔 = 919.20원.
- 프사(v1.2 조정자 지정): 준용·민지 = 카카오 프사(샘플 사진), 태현 = 기본 이미지 Violet, 수빈 = 기본 이미지 Sunset.

## 결정 사항

1. **하단 네비 3탭(결제내역 / 현황 / 여정 정보)**: WF 결정 #1. DS 기본 변형 그대로 쓴다.
2. **미확정 배너는 한 줄 「확인 필요 2건 ›」**(Callout Pending): 이 화면의 주요 액션.
3. **공동 결제 = 부담 인원 스택**(v1.2): 「공동 n명」 Tag는 쓰지 않는다. 인원은 Count로 보이고, MK택시는 2명이라 스택만 봐도 예외가 드러난다. 스택 순서는 결제자 → 나 → 합류 순.
4. **메타 「시각 · ○○ 결제」**: 스택이 들어가면서 이름 하나가 결제자인지 부담 인원인지 헷갈릴 수 있어 "결제"를 붙였다. 내 결제는 "내 결제".
5. **날짜 헤더 합계 = 확정된 공동 지출만**("공동 ₩143,950"). 미확정·개인 결제는 결제자에게만 보이니 그룹 합계에서 뺐다. 조정자 지시("11.13 (금) · Day 2 + 합계 하나")를 따랐다.
6. **헤더 「진행 중」 배지 끔**: WF-18에 없다.
7. **필터 「전체」 뺌**: 정보 최소화 원칙과 최신 WF-18(필터 제거)에 맞췄다.
8. **EX-01b**: 시트 제목은 "결제 상세", 가맹점명은 SheetContent summary에 둔다. [개인] 확정 상태라 부담 인원 영역은 숨겼다(AvatarToggle에 비활성 변형이 없음).
9. **EX-01c**: Dialog 기본 문구를 그대로 썼다(어느 결제인지와 상관없이 같은 문구라 화면별 덮어쓰기가 필요 없다).

## 정보 최소화를 위해 뺀 것

- 미확정 배너 부연 "개인인지 공동인지 정해 주세요 · 나만 보여요"
- 필터 「전체 ▾」
- 헤더 「진행 중」 상태 배지
- 「공동 n명」 태그(v1.2에서 스택으로 대체), 메타의 부담 인원 수(스택과 중복)
- 날짜 헤더의 보조 설명. 날짜 · Day · 합계 하나만 남겼다.
- EX-01b: "나만 볼 수 있어요", "어떻게 나눌까요?" 제목, 자물쇠 안내 문구, 결제 수단 행, [개인]일 때 의미 없는 부담 인원 영역
- EX-01c: Dialog 외 요소 없음

## DS 피드백 (원본은 고치지 않음)

1. **[해결] v1.1에서 해결됨: Banner/Callout 없음.** v1.0에서는 ListItem(Navigation)에 pending 토큰 fill, 점선 stroke, radius, padding, 아이콘을 전부 덮어써서 배너를 만들었다. v1.1에서 `Callout` 세트(`24:12804`, Tone=Pending|Info|Warning, Label·Chevron 속성)가 생겨 EX-01은 override 없이 Callout 인스턴스를 쓴다.
2. **[해결] v1.1에서 해결됨: TopHeader에 ≡ 자리 없음.** `Menu#24:198`(기본 true)과 `menu` IconButton이 추가됐다. EX-01·EX-01b 헤더가 WF-18과 같은 순서(≡ · 그룹명 ▾ · 지갑 · 마이)로 나오고 따로 정리할 것이 없었다.
3. **[해결] v1.1에서 해결됨: BottomNav 기본 라벨이 WF와 다름.** 기본 변형 `Tabs=3, Active=First, Phase=Ongoing`(24:7380)이 결제내역/현황/여정 정보이고, 종료 후는 `Phase=Ended`. EX-01은 탭 Label·Icon override를 전부 없앴다(override 0). spec 7-1의 "결제·현황 탭" 조립 규칙 문구는 v1.1 spec에서 다시 확인해 볼 것.
4. **[부분 해결]: 금액용 레이어(Archivo)에 한글 라벨을 넣을 수 없음.** v1.1 인계 문서 주의점 3이 "한글 섞인 문자열은 Noto Sans KR 스타일로"를 규칙으로 정해서, DateHeader `daily total`("공동 ₩143,950")은 Body/S, ListItem `value`("토스뱅크 체크카드 1934")는 Body/M Strong 스타일로 바꿨다(v1.0의 range 서체 override는 없앰). 화면마다 스타일을 바꿔야 하는 점은 남아 있으니 DateHeader `total label` 레이어 분리를 계속 권한다.
5. **[해결] v1.1에서 해결됨: BottomSheet 슬롯 높이 고정.** Content 슬롯이 hug, 하단 패딩이 58(24 + 안전영역 34)이 됐다. EX-01b는 높이·패딩 override를 모두 없앴고, 시트는 hug로 480(내용 266)이며 잘림이 없다.
6. **Button에 trailing 아이콘이 없고, Ghost는 브랜드색으로 고정이다.** "전체 ▾" 같은 드롭다운 필터를 만들 수 없고, 보조 행동을 중립 톤으로 낮출 변형도 없다. 첫 시도에서는 색을 override했고 최종본에서는 필터를 뺐다. `Trailing icon` 속성과 Ghost/Neutral 톤 추가를 권한다.
7. **[부분 해결] v1.2에서 공동 결제는 스택으로 바뀌어 「공동 n명」 표기가 필요 없어졌다. Tag 라벨이 TEXT 속성으로 노출되지 않는 점은 그대로다.** 인원 표기를 하려면 `label` 레이어를 이름으로 찾아 덮어써야 한다. Tag S 라벨이 11px라 가독성 하한에 걸치니 12px도 검토해 주길 바란다.
8. **[부분 해결](v1.1 인계 문서 5절에 규칙과 덤프 코드 추가, 이름 통일은 안 함): 레이어 이름이 일관되지 않다.** BottomNav의 tab 1 아이콘 레이어는 `Icon/receipt`, tab 2·3은 `icon`이다. TopHeader의 wallet 아이콘은 `Icon/wallet`, my 아이콘은 `icon`이다. `findOne(name==='icon')` 방식이 위치에 따라 깨진다. 인스턴스 교체 후 이름이 바뀐 것으로 보이니 원본에서 `icon`으로 통일하길 권한다.
9. **[해결] v1.1에서 해결됨: spec.md 표 오류.** DateHeader·SlotPlaceholder·TransferRow·AvatarStack의 "언제 쓰나" 칸에 옆 컴포넌트 설명이 복사돼 있다(DateHeader에 PaymentRow 설명이 들어가 있음).
10. PaymentRow는 meta 행이 [tag 또는 participants][시각 · 결제자] 순서이고 WF-18은 [시각 · 결제자][tag]다. 문제는 아니고 차이만 적어 둔다.
11. 잘 된 점(v1.0~v1.2): 변형을 먼저 바꾸고 텍스트를 넣는 순서만 지키면 덮어쓴 텍스트가 유지된다. 중첩 칠이 변수에 바인딩되어 있다(v1.2 Avatar left overlay만 예외, 16 참고). clone해도 바인딩과 override가 유지된다. SegmentedControl은 세그먼트가 FILL이라 폭을 줄여도 잘 늘고 준다. `bg/dim` 48%도 정상이다(픽셀 확인).
12. **(v1.2) AvatarToggle에 비활성 변형이 없다.** `Selected=On|Off`뿐이다. [개인] 상태처럼 부담 인원을 고를 수 없는 경우를 표현할 방법이 없어서, EX-01b에서는 SheetContent의 `participants header`·`participants` 레이어를 숨겼다. `State=Disabled` 변형이나 SheetContent의 `Participants`(BOOLEAN) 속성을 권한다.
13. **(v1.2) SheetContent/PaymentDetail은 AvatarToggle 4개로 고정이다.** 2명이 나눈 MK택시 같은 결제는 인계 문서대로 detach해야 한다. 인원 수 변형(Count=2|3|4)이나 토글 4개 각각의 표시 속성이 있으면 detach 없이 쓸 수 있다.
14. **(v1.2) Photo 변형은 Color=Gray뿐, Default는 Violet·Sunset뿐이다.** 그래서 Source를 바꿀 때 Color도 맞는 값으로 같이 지정해야 한다(예: `{Source:'Photo', Color:'Gray'}`). 인계 문서 예시에 이 조합 제약을 한 줄 적어 두면 좋겠다.
15. **(v1.2) 사람별 샘플 사진을 직접 가리킬 방법이 없다.** 준용·민지 플레이스홀더는 이미지 해시가 다른데, AvatarStack 원본 슬롯(`avatar · 준용`/`avatar · 민지`)의 photo fill에서 읽어 와야 한다. 스택 순서를 바꾸면(결제자 → 나 → 합류 순) 슬롯 이름과 사람이 어긋나서 사진·Source·Me·레이어 이름을 슬롯마다 다시 지정했다. `components.json`에 샘플 사진 해시 맵(사람 → imageHash)을 넣어 주길 권한다.
16. **(v1.2, 사소) Avatar `left overlay > desaturate` 칠이 변수에 바인딩되어 있지 않다.** 숨겨진 레이어(Left=false)라 화면에는 영향이 없지만 토큰 검사에 걸린다.
17. 잘 된 점(v1.2): AvatarStack은 왼쪽이 위(itemReverseZIndex)이고 흰 Ring으로 분리되며 Me 테두리도 XS에서 보인다(8배 확대로 확인). SheetContent는 Content 속성 교체만으로 들어가고 시트가 hug로 맞춰진다(356). Dialog SharedToPersonal은 덮어쓰기 없이 바로 쓸 수 있다.

## 파일 · 재실행

- `ex/lib.js`: 헬퍼(`V` `paint` `bindRadius` `inst` `icon` `propKey` `setText` `loadAllFonts` `box` `exSection`)
- `ex/icons_sb.js`: 상태바 아이콘(Icons8 ios-glyphs 64 #14141E: wifi, full-battery. cellular-network는 방송탑 모양이라 쓰지 않음)
- `ex/01_ex01.js`: EX-01, v1.2 기준(Callout · Menu · BottomNav 기본 · 프사 규칙 · participants 스택). 이름이 같은 기존 프레임을 지우고 다시 만든다.
  `cat ds/C.js ex/icons_sb.js ex/lib.js ex/01_ex01.js > ex/.run.js && python3 tools/figrun.py ex/.run.js`
- `ex/02_ex01b.js`: EX-01b(EX-01 복제 + 딤 + BottomSheet/SheetContent). v1.1 로컬 콘텐츠 컴포넌트가 남아 있으면 지운다.
- `ex/04_ex01c.js`: EX-01c(EX-01 복제 + 딤 + Dialog SharedToPersonal)
- `ex/03_caption.js`: 섹션 제목, 라벨 3개, 캡션 카드(오른쪽, 폭 360), 섹션 크기 맞춤(가로 ≤ 1800)
- 02·03·04는 `__IDS__`를 `ex/ids.json` 내용으로 치환해서 실행한다. 순서: 01 → ids.json 갱신 → 02 → 04 → ids.json 갱신 → 03.
- `ex/00_inspect*.js`: 컴포넌트 구조 덤프(읽기 전용)

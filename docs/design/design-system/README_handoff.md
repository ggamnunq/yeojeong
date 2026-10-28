# 인계: 「여정」 디자인 시스템 인스턴스 사용법 (v1.3)

대상: `03 예시 화면` 등 이 디자인 시스템으로 화면을 조립하는 에이전트.
참고 파일: `ds/components.json`(모든 ID) · `ds/spec.md`(토큰·규칙·조립 가이드) · `ds/tokens.json`(원시 값).
실행 방법은 `context/README.md`와 같다(`python3 tools/figrun.py script.js`). 컴포넌트 원본은 섹션 01/02 안에 있으니 **절대 수정·이동·삭제하지 말고 `createInstance()`만** 쓴다. 인스턴스는 바로 자기 섹션의 프레임에 `appendChild` 한다.

## 0. 준비: components.json을 스크립트 앞에 붙이기

```bash
# $S/ds/C.js = `const C = <components.json>;` (미리 만들어 둠. components.json을 다시 만들면 아래 한 줄로 재생성)
# python3 -c "import json;open('$S/ds/C.js','w').write('const C='+json.dumps(json.load(open('$S/ds/components.json')),ensure_ascii=False)+';')"
cat $S/ds/C.js my_screen.js > run.js && python3 $S/tools/figrun.py run.js
```

- 세트 → `C.components.<이름>.setId`, 단일 컴포넌트 → `.componentId`.
- 변형 이름은 `"Type=Primary, Size=L, State=Default"` 형식이다(속성 순서는 `props` 키 순서). 전체 목록은 `.variants`.
- 텍스트·불리언·인스턴스 교체 속성은 키에 `#숫자`가 붙는다(예: Button `Label#24:0`). `componentProps`에서 `startsWith('Label#')`로 찾는다.
- 변수 ID: `C.variables.vars['bg/surface'].id`, 스타일 ID: `C.styles.text['Amount/L']`, `C.styles.effect['Elevation/1']`, `C.styles.paint['여정/bg/brand']`.

## 1. 버튼: 변형 고르기 + 라벨 + 아이콘

```js
const set = figma.getNodeById(C.components.Button.setId);
const btn = set.findChild(c => c.name === 'Type=Primary, Size=L, State=Default').createInstance();
screen.appendChild(btn);
const P = C.components.Button.componentProps, key = p => Object.keys(P).find(k => k.startsWith(p + '#'));
btn.setProperties({ [key('Label')]: '여정 시작', [key('Leading icon')]: true,
                     [key('Icon')]: C.components.Icons.components['Icon/airplane'] });
// 변형 바꾸기: btn.setProperties({ Type: 'Secondary', State: 'Disabled' });
// ⚠ 변형을 바꾸면 크기가 초기화된다. 너비 조정은 마지막에:
btn.layoutSizingHorizontal = 'FIXED'; btn.resize(350, 56);   // 또는 오토레이아웃 부모 안이면 btn.layoutSizingHorizontal = 'FILL'
```

## 2. 결제 내역 행: 변형 먼저, 텍스트는 그다음 (폰트 로드 필수)

```js
const row = figma.getNodeById(C.components.PaymentRow.setId).defaultVariant.createInstance();
list.appendChild(row); row.layoutSizingHorizontal = 'FILL';
row.setProperties({ Type: 'Shared' });            // Shared | Personal | Pending (태그·금액색이 같이 바뀜)
async function setText(inst, layer, s) {
  const t = inst.findOne(n => n.name === layer && n.type === 'TEXT');
  await figma.loadFontAsync(t.fontName); t.characters = s;
}
await setText(row, 'merchant', '쿠로몬 시장 타코야키');
await setText(row, 'meta', '18:20 · 서준 · 4명');
await setText(row, 'amount', '₩8,900');
await setText(row, 'original amount', '¥1,000');
const av = row.findOne(n => n.name === 'payer avatar');   // 중첩 Avatar 인스턴스
av.setProperties({ Color: 'Sunset' }); await setText(av, 'initial', '서');
```
레이어 이름은 `components.json`의 `textLayers` / `nested`에 있다. 변형을 바꾸면 덮어쓰지 않은 텍스트는 새 변형의 기본 문구로 바뀌므로, **변형 → 텍스트** 순서로 한다.

## 3. 직접 그리는 요소에 토큰·스타일 입히기 + 아이콘 색 바꾸기

```js
const V = async name => figma.variables.getVariableByIdAsync(C.variables.vars[name].id);
const paint = async name => figma.variables.setBoundVariableForPaint({ type: 'SOLID', color: { r: 0, g: 0, b: 0 } }, 'color', await V(name));
const card = figma.createFrame(); screen.appendChild(card);
card.fills = [await paint('bg/surface')];
for (const f of ['topLeftRadius','topRightRadius','bottomLeftRadius','bottomRightRadius']) card.setBoundVariable(f, await V('radius/lg'));
await card.setEffectStyleIdAsync(C.styles.effect['Elevation/1']);
const t = figma.createText(); card.appendChild(t);
await figma.loadFontAsync({ family: 'Archivo', style: 'Bold' });
await t.setTextStyleIdAsync(C.styles.text['Amount/L']); t.characters = '₩1,284,000';
t.fills = [await paint('amount/default')];
// 아이콘: color 레이어 fill만 바꾸면 된다
const icon = figma.getNodeById(C.components.Icons.components['Icon/wallet']).createInstance();
card.appendChild(icon); icon.resize(20, 20);
icon.findOne(n => n.name === 'color').fills = [await paint('icon/brand')];
```

## 4. 바텀시트: 제목·CTA·콘텐츠 슬롯

```js
const sh = figma.getNodeById(C.components.BottomSheet.componentId).createInstance(); screen.appendChild(sh);
const SP = C.components.BottomSheet.componentProps, sk = p => Object.keys(SP).find(k => k.startsWith(p + '#'));
sh.setProperties({ [sk('Title')]: '초대코드 공유' });
// 중첩 버튼 라벨은 중첩 인스턴스에 직접 지정한다
const BP = C.components.Button.componentProps;
sh.findOne(n => n.name === 'cta').setProperties({ [Object.keys(BP).find(k => k.startsWith('Label#'))]: '코드 복사' });
// 콘텐츠: 내 섹션 안에 내용 컴포넌트를 만들고 Content 속성으로 교체 → sh.setProperties({ [sk('Content')]: myContentComponent.id })
// 또는 sh.detachInstance() 후 content 레이어를 지우고 직접 채운다.
// 딤: 화면 크기 사각형에 paint('bg/dim')(48%)를 칠해 시트 아래에 깐다.
```

## 5. 실제 레이어 이름 찾는 법 (Icon/* vs icon)

컴포넌트 **원본 이름**과 인스턴스 안의 **레이어 이름**은 다르다. 대량 리네임은 하지 않았으므로 아래 규칙과 덤프 코드로 확인한다.
- 아이콘 원본 컴포넌트 이름 = `Icon/<이름>` (예: `Icon/wallet`, `C.components.Icons.components['Icon/wallet']`).
- Avatar 안: `initial`(Initial만), `photo`(Photo만, 이미지 fill), `image > default image`(Default만), `ring`·`me ring`·`left overlay`(속성으로 표시). AvatarStack 안: `avatar · 이름`, `overflow > count`. PaymentRow·TimelineItem 안: `payer avatar`, `participants`(AvatarStack), `tag`, `changed`.
- 다른 컴포넌트 안에 들어간 아이콘 **인스턴스 레이어 이름**은 역할 이름이다: `icon`(Button·IconButton·Tag·Chip·Toast·StatCard·Callout·NavItem), `chevron`(TopHeader 그룹명 옆·SettlementRow·Callout 오른쪽), `trailing icon`·`leading icon`(Input·ListItem), `check`(Checkbox).
- 헤더·시트 안의 버튼은 IconButton 인스턴스이고 레이어 이름은 `menu`·`wallet`·`my`·`back`·`action`·`close`, 그 안의 아이콘 레이어는 다시 `icon`이다.
- 아이콘 색을 바꿀 레이어는 항상 아이콘 인스턴스 안의 `color` 사각형이다(`mask`는 건드리지 않는다).

```js
// 인스턴스 하나의 텍스트·아이콘·중첩 인스턴스 레이어를 한 번에 덤프
function dumpLayers(inst) {
  return inst.findAll(n => n.type === 'TEXT' || n.type === 'INSTANCE').map(n =>
    n.type === 'TEXT' ? `TEXT  ${n.name} = "${n.characters}"`
                      : `INST  ${n.name} → ${n.mainComponent ? n.mainComponent.name : '?'}`);
}
// 예: return dumpLayers(figma.getNodeById(C.components.TopHeader.setId).defaultVariant.createInstance());
// 아이콘 레이어만: inst.findAll(n => n.type==='INSTANCE' && n.mainComponent?.name.startsWith('Icon/'))
// 아이콘 바꾸기:   layer.swapComponent(figma.getNodeById(C.components.Icons.components['Icon/menu']))
```

## 6. v1.1 추가·변경 (EX-01 피드백 반영)

```js
// Callout — 미확정 배너 (부모 오토레이아웃 안에서 가로 채움)
const CO = C.components.Callout, ck = p => Object.keys(CO.componentProps).find(k => k.startsWith(p + '#'));
const banner = figma.getNodeById(CO.variants['Tone=Pending']).createInstance();   // Pending | Info | Warning
body.appendChild(banner); banner.layoutSizingHorizontal = 'FILL';
banner.setProperties({ [ck('Label')]: '확인 필요 2건', [ck('Chevron')]: true });
// 아이콘 교체는 속성이 아니라 레이어 교체(변형마다 기본 아이콘이 달라 공용 INSTANCE_SWAP을 두지 않음)
// banner.findOne(n => n.name === 'icon').swapComponent(figma.getNodeById(C.components.Icons.components['Icon/pie-chart']));

// BottomNav — 3탭 기본, 종료 후 정산
const nav = figma.getNodeById(C.components.BottomNav.setId).defaultVariant.createInstance(); // Tabs=3, Active=First, Phase=Ongoing
nav.setProperties({ Active: 'Second' });                 // 현황 탭 활성
nav.setProperties({ Phase: 'Ended', Active: 'Second' }); // 종료 후: 가운데 탭 = 정산

// TopHeader — 왼쪽 ≡(그룹 구성원) : Menu 속성(기본 true)
const hd = figma.getNodeById(C.components.TopHeader.variants['Type=Group']).createInstance();
const hk = p => Object.keys(C.components.TopHeader.componentProps).find(k => k.startsWith(p + '#'));
hd.setProperties({ [hk('Menu')]: true, [hk('Status badge')]: false });
```
- BottomSheet: Content 슬롯은 이제 hug(내용 높이), 하단 패딩 58(= 24 + 안전영역 34). 시트 인스턴스 높이를 고정하지 말고 hug로 두면 내용에 맞춰 늘어난다.
- 새 토큰: `feedback/info/{bg,fg,border}`, `feedback/warning/{bg,fg,border}` (Callout Info/Warning용).

## 7. v1.2 프사 · 공동 결제 스택 (사용자 결정 반영)

규칙 요약(자세히는 spec.md 7-2): 카카오 프사 = `Avatar Source=Photo` → 없으면 **`Source=Default, Color=Gray`**(「여정」 기본 이미지, 회색) → 로딩 실패 = `Source=Initial`. 공동 결제는 Tag 대신 부담 인원 `AvatarStack`.

> v1.3: 기본 이미지 변형 이름은 `Color=Gray, Size=XS|S|M|L|XL, Source=Default`. `Color=Violet|Sunset, …, Source=Default`는 **레거시 — 쓰지 않음**. `Avatar/DefaultImage` 세트의 기본 변형도 `Color=Gray`.

```js
async function setText(inst, layer, s) { const t = inst.findOne(n => n.name === layer && n.type === 'TEXT'); await figma.loadFontAsync(t.fontName); t.characters = s; }
const key = (comp, p) => Object.keys(C.components[comp].componentProps).find(k => k.startsWith(p + '#'));

// (1) 사진 아바타: photo 레이어에 IMAGE fill. URL(createImageAsync)이나 바이트(createImage) 둘 다 된다(실행 확인).
const av = figma.getNodeById(C.components.Avatar.variants['Color=Gray, Size=L, Source=Photo']).createInstance();
parent.appendChild(av);
const img = await figma.createImageAsync('https://…카카오 프로필 URL…');      // 또는 figma.createImage(uint8Array)
av.findOne(n => n.name === 'photo').fills = [{ type: 'IMAGE', scaleMode: 'FILL', imageHash: img.hash }];
av.setProperties({ [key('Avatar','Me')]: true });                         // 나 = 보라 테두리
// 기본 이미지: Avatar.variants['Color=Gray, Size=M, Source=Default'] (Violet/Sunset은 레거시) · 나간 멤버: { [key('Avatar','Left')]: true }

// (2) AvatarStack: 인원 수 = Count 변형, 각 사람 = 중첩 avatar 인스턴스(이름 'avatar · 준용' 등)
const st = figma.getNodeById(C.components.AvatarStack.variants['Count=3, Size=S']).createInstance(); parent.appendChild(st);
const avs = st.findAll(n => n.type === 'INSTANCE' && n.name.startsWith('avatar'));
avs[2].setProperties({ Source: 'Initial', Color: 'Blue' }); await setText(avs[2], 'initial', '도');
// 기본 이미지로: avs[1].setProperties({ Source: 'Default', Color: 'Gray' })
// 5명 이상: Count=5+ (4명 + 칩) → await setText(st, 'count', '+3')
// 사진 교체: avs[0].findOne(n => n.name === 'photo').fills = [ … IMAGE … ]

// (3) PaymentRow 공동: Type=Shared에 participants(AvatarStack) 내장
const row = figma.getNodeById(C.components.PaymentRow.variants['Type=Shared, State=Default']).createInstance();
list.appendChild(row); row.layoutSizingHorizontal = 'FILL';
row.findOne(n => n.name === 'participants').setProperties({ Count: '2' });            // 택시 2명
row.findOne(n => n.name === 'payer avatar').setProperties({ Source: 'Default', Color: 'Gray' });
row.setProperties({ [key('PaymentRow','Changed')]: true });                          // "· 변경됨"
await setText(row, 'merchant', 'MK택시'); await setText(row, 'meta', '14:10 · 태현 결제');
await setText(row, 'amount', '₩26,290'); await setText(row, 'original amount', '¥2,860');
// 환불: variants['Type=Refund, State=Default'] (−금액, 링크 아이콘 + "원 결제 …") · 중복 의심: 'Type=Duplicate, …'
// 타임라인도 동일: TimelineItem 'Type=Shared, Position=…'의 participants
```

- 결제 상세 시트: `BottomSheet`의 Content 속성 = `C.components.SheetContent.componentId`(금액 요약 · 개인/공동 · 부담 인원 AvatarToggle ×4). 부담 인원 수가 다르면 시트를 detach해서 `participants` 행의 AvatarToggle을 늘리거나 줄인다.
- 부담 인원 토글: `AvatarToggle` `Selected=On|Off`, 이름 = `Name#…` 속성, 프사 = 중첩 `avatar`의 Source/photo.
- 공동 → 개인 전환 확인: `Dialog` `Type=SharedToPersonal`. 연동 끊김 배너: `Callout` `Tone=Disconnected`(label/action 레이어를 직접 수정, Label 속성은 이 변형에 연결되어 있지 않음).
- Avatar 세트의 기본 변형이 `Color=Violet, Size=XS, Source=Initial`로 바뀌었다(왼쪽 위 기준). `defaultVariant` 대신 변형 이름으로 고른다.
- 샘플 사진은 플레이스홀더다. 실제 화면에서는 카카오 프사로 바꾸거나, 프사가 없다는 설정이면 Source=Default를 쓴다.

## 주의점
1. **원본 컴포넌트 수정 금지.** 필요한 변형이 없으면 인스턴스를 `detachInstance()`해서 쓰고, 문서에 적는다.
2. 텍스트를 바꾸기 전 `figma.loadFontAsync(t.fontName)`. 서체는 Noto Sans KR(Regular/Medium/Bold)과 Archivo(SemiBold/Bold/Medium)다.
3. 금액은 `₩1,284,000`처럼 기호를 앞에 둔다. **v1.3부터 Amount/* = IBM Plex Sans KR**(이전 Archivo는 ₩ 왼쪽 획이 잘려 보이는 글리프라 교체). Plex KR은 한글이 있어 "1인 ₩9,467"도 깨지지 않지만, 문장형 혼합 문자열은 Noto Sans KR 스타일(Body/·Caption)로, 숫자가 주인공인 금액에만 Amount/*를 쓴다. 직접 만든 금액 텍스트에 Archivo를 쓰지 말 것(텍스트 스타일을 연결하면 자동으로 맞춰진다).
4. 로고는 `Logo/Primary`(밝은 배경) / `Logo/Inverse`(보라 배경) 인스턴스를 `inst.rescale(원하는높이/96)`으로 키운다. resize는 비율이 깨진다. 앱 아이콘은 `rescale(px/1024)`.
5. 결제 내역 레이아웃: (미확정 있으면) Callout Pending → SegmentedControl → DateHeader → PaymentRow 반복(사이 Divider Type=Inset) / 타임라인은 TimelineItem을 간격 0으로 쌓고, 날짜의 마지막 노드만 `Position=Last`.
6. BudgetProgress의 막대는 `track > fill` 사각형 너비로 조정한다(기본 트랙 310px × 비율).
7. 헤더 오른쪽 버튼과 시트 닫기 버튼은 IconButton(Ghost·M) 인스턴스다. 아이콘 교체는 그 인스턴스의 `Icon#…` 속성으로 한다.
8. 카카오 버튼 색(#FEE500, #000 85%)은 카카오 가이드 고정값이다. 토큰으로 바꾸지 않는다.
9. 하단 내비는 `BottomNav`의 기본 변형(Tabs=3, Phase=Ongoing)을 쓴다. `Tabs=2`는 레거시.
10. 중첩 인스턴스 텍스트(시트 CTA 라벨 등)는 부모 인스턴스를 만든 뒤 중첩 인스턴스에 `setProperties`로 다시 지정한다.
11. 공동 결제 행에 "공동 n명" Tag를 다시 보이게 하지 않는다(v1.2 결정). 인원 수는 participants의 Count로 맞춘다.
12. 미확정 표기(v1.3): `Tag Type=Pending`은 회색 "미확정" 글자만이고 **메타 줄 맨 끝**에 둔다(PaymentRow·TimelineItem Pending 변형은 이미 그렇게 배치). 결제 상세는 `SheetContent`의 `Pending` 속성. 배너는 `Callout Tone=Pending`(회색 + 주황 점). 주황 점선·주황 면은 쓰지 않는다.
13. 점선 테두리는 쓰지 않는다(v1.3). 영역 구분은 실선 1px `border/default` 또는 면 색으로.

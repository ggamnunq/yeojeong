// 섹션 제목 · 프레임 라벨 · 캡션 카드 (섹션 캡션 예외: 텍스트 직접 생성, 색·서체는 토큰/스타일)
// 배치: EX-01(80) · EX-01b(510) · EX-01c(940) · 캡션 카드(1370, 폭 360) → 섹션 가로 ≤ 1800
const IDS = __IDS__;
const sec = exSection();
const CAP = 'Caption · ';
for (const old of sec.children.filter(n => n.name.startsWith(CAP))) old.remove();

for (const f of [['Noto Sans KR', 'Regular'], ['Noto Sans KR', 'Medium'], ['Noto Sans KR', 'Bold']]) await figma.loadFontAsync({ family: f[0], style: f[1] });
async function T(chars, style, color, o = {}) {
  const t = figma.createText();
  await t.setTextStyleIdAsync(C.styles.text[style]);
  t.characters = chars;
  t.fills = [await paint(color)];
  if (o.parent) o.parent.appendChild(t);
  if (o.fill) { t.layoutSizingHorizontal = 'FILL'; t.textAutoResize = 'HEIGHT'; }
  if (o.name) t.name = o.name;
  return t;
}

// ---- 섹션 제목 ----
const head = box({ name: CAP + '섹션 제목', parent: sec, gap: 6 });
head.x = 80; head.y = 80;
await T('03 예시 화면', 'Heading/H1', 'text/primary', { parent: head });
await T('디자인 시스템(v1.2) 컴포넌트 인스턴스만으로 조립한 하이파이 화면 · 기준 와이어프레임 WF-18 / WF-20', 'Body/M', 'text/secondary', { parent: head });

// ---- 프레임 라벨 ----
const ex01 = node(IDS.ex01.frame), ex01b = node(IDS.ex01b.frame), ex01c = node(IDS.ex01c.frame);
for (const [fr, label] of [[ex01, 'EX-01 · 결제내역(리스트)  ←  WF-18'], [ex01b, 'EX-01b · 결제 상세 시트(미확정 → 개인)  ←  WF-20'], [ex01c, 'EX-01c · 공동 → 개인 확인 다이얼로그']]) {
  const t = await T(label, 'Label/M', 'text/primary', { parent: sec, name: CAP + fr.name.split(' ')[0] + ' 라벨' });
  t.x = fr.x; t.y = fr.y - 32;
}

// ---- 캡션 카드 ----
const card = box({ name: CAP + '카드 (WF-18 기반 · 컴포넌트 · 결정)', parent: sec, gap: 20, pad: 24 });
card.counterAxisSizingMode = 'FIXED'; card.resize(360, 100); card.primaryAxisSizingMode = 'AUTO';
card.x = ex01c.x + 390 + 40; card.y = ex01.y;
card.fills = [await paint('bg/surface')];
card.strokes = [await paint('border/default')]; card.strokeWeight = 1;
await bindRadius(card, 'radius/xl');

async function block(title, lines) {
  const b = box({ name: title, parent: card, gap: 6 }); b.layoutSizingHorizontal = 'FILL';
  await T(title, 'Label/M', 'text/brand', { parent: b });
  for (const l of lines) await T(l, 'Body/S', 'text/secondary', { parent: b, fill: true });
  return b;
}
const top = box({ name: 'title', parent: card, gap: 4 }); top.layoutSizingHorizontal = 'FILL';
await T('EX-01 · WF-18 기반 하이파이', 'Heading/H3', 'text/primary', { parent: top });
await T('여정 진행 중 홈(결제내역 탭). 와이어프레임 구조를 그대로 두고 DS 인스턴스로만 조립했다. 상태바·홈 인디케이터만 직접 그림.', 'Body/S', 'text/secondary', { parent: top, fill: true });

await block('v1.2 반영', [
  '공동 결제 = 태그 대신 부담 인원 스택(participants, MK택시 2명 · 나머지 4명). 프사 규칙: 준용·민지 Photo, 태현 Default Violet, 수빈 Default Sunset, 나 = Me 테두리. 시트 = SheetContent/PaymentDetail, EX-01c = Dialog SharedToPersonal.',
]);
await block('기준 와이어프레임', [
  'WF-18 결제내역 · 리스트 (24:7451) → EX-01',
  'WF-20 결제 상세 · 미확정 → 개인 확정 (24:7766) → EX-01b',
]);
await block('사용 컴포넌트 · EX-01 (배치 ' + IDS.count.ex01Placed + '개 · 중첩 포함 ' + IDS.count.ex01AllInstances + '개 · ' + IDS.count.ex01Kinds + '종)', [
  'TopHeader Group(Menu ≡) · Callout Pending · SegmentedControl 2/First · DateHeader ×2 · PaymentRow Pending ×2 / Shared ×6 / Personal ×1 · Divider Inset ×7 · BottomNav 기본(3탭·Ongoing)',
  '중첩: Avatar M ×9(Photo/Default, Me) · AvatarStack XS Count=4 ×5 / Count=2 ×1(Avatar XS ×22) · Tag S ×3(개인·미확정)',
  'EX-01b: BottomSheet + SheetContent/PaymentDetail([개인] 선택, 부담 인원 숨김) · CTA 「개인으로 확정」 · 딤 bg/dim',
  'EX-01c: Dialog Type=SharedToPersonal(기본 문구) · 딤 bg/dim',
]);
await block('결정 사항', [
  '1. 하단 네비 3탭(결제내역 / 현황 / 여정 정보) — WF 결정 #1, DS 기본 변형 그대로.',
  '2. 미확정 배너는 한 줄 「확인 필요 2건 ›」. 이 화면의 주요 액션.',
  '3. 스택 순서는 결제자 → 나 → 합류 순. 메타는 「시각 · ○○ 결제」로 결제자와 부담 인원을 구분.',
  '4. 날짜 합계 = 확정된 공동 지출만(「공동 ₩143,950」, Body/S). 미확정·개인은 비공개라 제외.',
  '5. 시트에서 [개인]이면 부담 인원 영역을 숨김(AvatarToggle에 비활성 변형 없음).',
]);
await block('정보 최소화로 뺀 것', [
  '배너 부연 · 필터 「전체」 · 헤더 「진행 중」 배지 · 「공동 n명」 태그(→ 스택) · 시트의 「나만 볼 수 있어요」 · 「어떻게 나눌까요?」 · 자물쇠 안내',
]);
await block('DS 피드백 → ex/notes.md', [
  'v1.1~1.2 해결: Callout · TopHeader ≡ · BottomNav 3탭 · 시트 슬롯 hug · 공동 결제 스택 · 시트 콘텐츠 컴포넌트',
  '남은 것: AvatarToggle 비활성 변형 없음 · DateHeader 합계 Archivo · Tag 라벨 속성 미노출 · Avatar left overlay 색 미바인딩',
]);

// 섹션 크기 맞춤 (가로 ≤ 1800)
let maxX = 0, maxY = 0;
for (const c of sec.children) { maxX = Math.max(maxX, c.x + c.width); maxY = Math.max(maxY, c.y + c.height); }
sec.resizeWithoutConstraints(Math.min(1800, maxX + 70), maxY + 80);
return { card: card.id, head: head.id, cardH: card.height, sec: [sec.width, sec.height], labels: sec.children.filter(n => n.name.startsWith(CAP) && n.type === 'TEXT').map(n => [n.name, n.id]) };

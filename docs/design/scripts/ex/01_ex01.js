// EX-01 여정 진행 중 · 결제내역(리스트) — DS 인스턴스만으로 조립
// 실행: cat ds/C.js ex/icons_sb.js ex/lib.js ex/01_ex01.js > ex/.run.js && python3 tools/figrun.py ex/.run.js
const FRAME_NAME = 'EX-01 여정 진행 중 · 결제내역(리스트)';
const sec = section(SECTION_NAME, { x: 9000, y: 0, w: 1600, h: 1300, fill: '#F4F5F7' });
for (const old of sec.children.filter(n => n.name === FRAME_NAME)) old.remove();

// ---------- 화면 프레임 ----------
const scr = figma.createFrame();
sec.appendChild(scr);
scr.name = FRAME_NAME;
scr.layoutMode = 'VERTICAL'; scr.primaryAxisSizingMode = 'FIXED'; scr.counterAxisSizingMode = 'FIXED';
scr.itemSpacing = 0;
scr.resize(390, 844);
scr.x = 80; scr.y = 240;
scr.fills = [await paint('bg/canvas')];
scr.clipsContent = true;

// ---------- 상태바 (예외: 직접 그림, OS 크롬) ----------
const sb = box({ name: 'StatusBar (system)', dir: 'HORIZONTAL', parent: scr, pad: [0, 22, 0, 30], justify: 'SPACE_BETWEEN', align: 'CENTER' });
sb.primaryAxisSizingMode = 'FIXED'; sb.counterAxisSizingMode = 'FIXED'; sb.resize(390, 44);
sb.fills = [await paint('bg/surface')];
await text('18:34', { parent: sb, family: 'Noto Sans KR', style: 'Bold', size: 15, color: '#14141E', name: 'time' });
const ind = box({ name: 'indicators', dir: 'HORIZONTAL', parent: sb, gap: 5, align: 'CENTER' });
imageNode(ICONS['wifi'], { parent: ind, w: 17, h: 17, name: 'wifi' });
imageNode(ICONS['full-battery'], { parent: ind, w: 26, h: 26, name: 'battery' });

// ---------- TopHeader (Type=Group) ----------
const hdr = inst('TopHeader', 'Type=Group');
scr.appendChild(hdr); hdr.layoutSizingHorizontal = 'FILL';
hdr.setProperties({ [propKey('TopHeader', 'Menu')]: true, [propKey('TopHeader', 'Status badge')]: false });   // v1.1: 왼쪽 ≡(그룹 구성원)
await setText(hdr, 'group name', '오사카 3박 4일');

// ---------- 스크롤 영역 ----------
const scroll = box({ name: 'scroll · 결제내역', parent: scr, clip: true });
scroll.layoutSizingHorizontal = 'FILL';
scroll.layoutGrow = 1; scroll.primaryAxisSizingMode = 'FIXED';

// 상단 컨트롤: 미확정 배너(Callout) + [리스트|타임라인]
const ctr = box({ name: 'controls', parent: scroll, gap: 12, pad: [16, 20, 8, 20] });
ctr.layoutSizingHorizontal = 'FILL';

// 미확정 배너 = Callout Tone=Pending (v1.1). 라벨·chevron은 컴포넌트 속성으로만 지정
const ban = inst('Callout', 'Tone=Pending');
ctr.appendChild(ban);
ban.layoutSizingHorizontal = 'FILL';
await loadAllFonts(ban.findOne(n => n.name === 'label' && n.type === 'TEXT'));
ban.setProperties({ [propKey('Callout', 'Label')]: '확인 필요 2건', [propKey('Callout', 'Chevron')]: true });

// 세그먼트 [리스트|타임라인] — DS 기본 폭(FILL). 필터 「전체」는 정보 최소화 + 최신 WF-18에 맞춰 뺌(notes.md)
const seg = inst('SegmentedControl', 'Count=2, Selected=First');
ctr.appendChild(seg);
seg.layoutSizingHorizontal = 'FILL';
await setText(seg, 'label 1', '리스트');
await setText(seg, 'label 2', '타임라인');

// ---------- 데이터 (wf/screens.md 샘플) ----------
// v1.2 프사 규칙(spec 7-2): 준용·민지 = 카카오 프사(Source=Photo, 샘플 플레이스홀더), 태현 = Default Violet, 수빈 = Default Sunset, 나(준용) = Me
const PH = (() => {   // DS 샘플 사진(플레이스홀더) 해시를 AvatarStack 원본에서 읽어 사람별로 재사용
  const st = node(C.components.AvatarStack.variants['Count=4, Size=XS']);
  const h = n => st.findOne(x => x.name === 'avatar · ' + n).findOne(x => x.name === 'photo').fills[0].imageHash;
  return { '준용': h('준용'), '민지': h('민지') };
})();
const PEOPLE = {
  '준용': { Source: 'Photo', Color: 'Gray', me: true },
  '민지': { Source: 'Photo', Color: 'Gray', me: false },
  '태현': { Source: 'Default', Color: 'Violet', me: false },
  '수빈': { Source: 'Default', Color: 'Sunset', me: false },
};
const ME_KEY = propKey('Avatar', 'Me');
function applyPerson(av, who) {
  const p = PEOPLE[who];
  av.setProperties({ Source: p.Source, Color: p.Color, [ME_KEY]: p.me });
  if (p.Source === 'Photo') av.findOne(x => x.name === 'photo').fills = [{ type: 'IMAGE', scaleMode: 'FILL', imageHash: PH[who] }];
}
const DAYS = [
  { date: '11.13 (금)', day: 'Day 2', total: '₩143,950', rows: [
    { m: '551 호라이 난바본점', t: '18:20', p: '준용', krw: '₩25,740', jpy: '¥2,800', type: 'Pending' },
    { m: '우메다 스카이빌딩 공중정원', t: '16:40', p: '민지', krw: '₩73,540', jpy: '¥8,000', type: 'Shared', who: ['민지', '준용', '태현', '수빈'] },
    { m: 'MK택시', t: '14:10', p: '준용', krw: '₩26,290', jpy: '¥2,860', type: 'Shared', who: ['준용', '민지'] },
    { m: '오사카성 천수각', t: '10:30', p: '수빈', krw: '₩44,120', jpy: '¥4,800', type: 'Shared', who: ['수빈', '준용', '민지', '태현'] },
    { m: '패밀리마트 난바역점', t: '08:50', p: '준용', krw: '₩11,770', jpy: '¥1,280', type: 'Pending' },
  ] },
  { date: '11.12 (목)', day: 'Day 1', total: '₩208,840', rows: [
    { m: '쿠시카츠 다루마 신세카이점', t: '19:30', p: '태현', krw: '₩117,660', jpy: '¥12,800', type: 'Shared', who: ['태현', '준용', '민지', '수빈'] },
    { m: '돈키호테 도톤보리점', t: '17:40', p: '준용', krw: '₩79,420', jpy: '¥8,640', type: 'Personal' },
    { m: '이치란 라멘 도톤보리점', t: '13:05', p: '준용', krw: '₩36,400', jpy: '¥3,960', type: 'Shared', who: ['준용', '민지', '태현', '수빈'] },
    { m: '난카이 라피트 간사이공항역', t: '11:20', p: '민지', krw: '₩54,780', jpy: '¥5,960', type: 'Shared', who: ['민지', '준용', '태현', '수빈'] },
  ] },
];
const payerLabel = p => (p === '준용' ? '내 결제' : p + ' 결제');   // 스택(부담 인원)과 결제자를 구분 (DS v1.2 샘플 "민지 결제")

const used = {};
const mark = (k) => { used[k] = (used[k] || 0) + 1; };
mark('TopHeader:Type=Group'); mark('Callout:Tone=Pending'); mark('SegmentedControl:Count=2, Selected=First');

for (const d of DAYS) {
  const dh = inst('DateHeader'); scroll.appendChild(dh); dh.layoutSizingHorizontal = 'FILL'; mark('DateHeader');
  dh.name = 'DateHeader · ' + d.date;
  await setText(dh, 'date', d.date);
  await setText(dh, 'day', d.day);
  const tt = await setText(dh, 'daily total', '공동 ' + d.total);
  await figma.loadFontAsync({ family: 'Noto Sans KR', style: 'Regular' });
  await tt.setTextStyleIdAsync(C.styles.text['Body/S']);   // 한글 섞인 금액 → Noto Sans KR 스타일 (handoff v1.1 주의점 3)
  const list = box({ name: 'rows · ' + d.date, parent: scroll });
  list.layoutSizingHorizontal = 'FILL';
  for (let i = 0; i < d.rows.length; i++) {
    const r = d.rows[i];
    if (i > 0) { const dv = inst('Divider', 'Type=Inset'); list.appendChild(dv); dv.layoutSizingHorizontal = 'FILL'; mark('Divider:Type=Inset'); }
    const row = inst('PaymentRow', 'Type=' + r.type + ', State=Default');
    list.appendChild(row); row.layoutSizingHorizontal = 'FILL'; mark('PaymentRow:Type=' + r.type);
    row.name = 'PaymentRow · ' + r.m;
    await setText(row, 'merchant', r.m);
    await setText(row, 'meta', r.t + ' · ' + payerLabel(r.p));
    await setText(row, 'amount', r.krw);
    await setText(row, 'original amount', r.jpy);
    applyPerson(row.findOne(n => n.name === 'payer avatar'), r.p); mark('Avatar:Size=M');
    if (r.type === 'Shared') {
      // 공동 = 부담 인원 AvatarStack(participants). Count 먼저 → 슬롯별 사람(결제자 → 나 → 합류 순)
      const st = row.findOne(n => n.name === 'participants');
      st.setProperties({ Count: String(r.who.length) }); mark('AvatarStack:Count=' + r.who.length + ', Size=XS');
      const slots = st.children.filter(n => n.type === 'INSTANCE' && n.name.startsWith('avatar'));
      for (let k = 0; k < r.who.length; k++) { applyPerson(slots[k], r.who[k]); try { slots[k].name = 'avatar · ' + r.who[k]; } catch (e) {} mark('Avatar:Size=XS'); }
    } else {
      mark('Tag:Type=' + r.type + ', Size=S');   // 개인·미확정은 Tag 그대로(기본 라벨)
    }
  }
}

// ---------- 하단: BottomNav 기본 변형(Tabs=3, Active=First, Phase=Ongoing) + 안전영역 ----------
const bottom = box({ name: 'bottom bar', parent: scr });
bottom.layoutSizingHorizontal = 'FILL';
bottom.fills = [await paint('bg/surface')];
const nav = node(C.components.BottomNav.setId).defaultVariant.createInstance(); mark('BottomNav:' + nav.mainComponent.name);
bottom.appendChild(nav); nav.layoutSizingHorizontal = 'FILL';   // 탭 라벨·아이콘은 컴포넌트 기본값(결제내역/현황/여정 정보) 그대로
const safe = box({ name: 'safe area (home indicator)', parent: bottom, justify: 'MAX', align: 'CENTER', pad: [0, 0, 8, 0] });
safe.layoutSizingHorizontal = 'FILL'; safe.primaryAxisSizingMode = 'FIXED'; safe.resize(390, 34);
rect({ parent: safe, w: 134, h: 5, radius: 3, fill: '#14141E', name: 'home indicator (system)' });

return { frame: scr.id, section: sec.id, header: hdr.id, scroll: scroll.id, banner: ban.id, seg: seg.id, nav: nav.id, used, scrollH: scroll.height, contentH: scroll.children.reduce((a, c) => a + c.height, 0) };

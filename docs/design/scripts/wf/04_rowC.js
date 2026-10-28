// Row C: WF-13 ~ WF-15  공통 UI  (정보 다이어트 v2)
const Y0 = BAND_Y[1], FY = Y0 + FRAME_DY, NY = FY + SH + 24, GX = 2280;
clean(['13', '14', '15'], ['RowTitle · C']);
const ids = {};
await rowTitle('C', GX, Y0, 'C. 공통 UI',
  '상태바 44 + 헤더 56 + 콘텐츠 + 하단 네비 78 — 모든 여정 화면 공통', 1400);

function relPos(f, n) { return { x: n.absoluteTransform[0][2] - f.absoluteTransform[0][2], y: n.absoluteTransform[1][2] - f.absoluteTransform[1][2] }; }
async function numBadge(parent, num, o = {}) {
  const b = box({ parent, abs: o.abs, dir: 'H', w: 20, h: 20, radius: 10, fill: C.ink, align: 'CENTER', justify: 'CENTER', name: 'Badge/' + num });
  await T(String(num), { parent: b, size: 11, weight: 'Bold', color: '#FFFFFF', lh: 14 });
  if (o.abs) { b.x = o.x; b.y = o.y; }
  return b;
}
async function numRow(p, num, title) {
  const r = box({ parent: p, dir: 'H', w: 'fill', gap: 10, align: 'CENTER' });
  await numBadge(r, num);
  await T(title, { parent: r, size: 14, weight: 'Medium', w: 'fill' });
}
async function miniCard(p) { const c = card(p, { pad: 0, gap: 0, radius: 10 }); c.clipsContent = true; return c; }

// WF-13 공통 레이아웃
{
  const f = await screen('13', '공통 레이아웃 (헤더·하단 네비)', fx(GX, 0), FY, { time: '18:34' });
  const hd = await appHeader(f);
  const b = body(f, { gap: 14, pad: [20, 20, 12, 20] });
  await numRow(b, 1, '그룹원 패널 (WF-15)');
  await numRow(b, 2, '그룹 전환 (WF-14)');
  await numRow(b, 3, '지갑 · 마이페이지 (WF-27 · 30)');
  await numRow(b, 4, '하단 탭 3개');
  line(b);
  await T('헤더 변형', { parent: b, size: 13, weight: 'Bold', color: C.sub });
  await appHeader(await miniCard(b), { noGroup: true });
  await subHeader(await miniCard(b), '지갑', { noBorder: true });
  await T('네비 상태 (시작 전 / 종료 후)', { parent: b, size: 13, weight: 'Bold', color: C.sub });
  const n1 = await miniCard(b); await bottomNav(n1, 'info', { locked: true });
  const n2 = await miniCard(b); await bottomNav(n2, 'stat', { ended: true });
  for (const n of [n1, n2]) { const nav = n.children[0]; nav.paddingBottom = 8; nav.resize(nav.width, 60); nav.strokes = []; }
  await bottomNav(f, 'pay');
  const menu = hd.findOne(n => n.name === 'IconButton/menu');
  const gs = hd.findOne(n => n.name === 'GroupSwitcher');
  const wl = hd.findOne(n => n.name === 'IconButton/wallet');
  let p = relPos(f, menu); await numBadge(f, 1, { abs: true, x: p.x + 10, y: 90 });
  p = relPos(f, gs); await numBadge(f, 2, { abs: true, x: p.x + gs.width / 2 - 10, y: 90 });
  p = relPos(f, wl); await numBadge(f, 3, { abs: true, x: p.x + 30, y: 90 });
  await numBadge(f, 4, { abs: true, x: 12, y: SH - 78 - 10 });
  ids['WF-13'] = f.id;
  await note(fx(GX, 0), NY, '13', '공통 레이아웃', '3탭 · 시작 전 잠금 · 종료 후 정산');
}

async function baseList(id, title, x, o = {}) {
  const f = await screen(id, title, x, FY, { time: '18:34' });
  await appHeader(f, { open: o.open });
  const b = body(f, { gap: 12, pad: [16, 20, 0, 20] });
  await payListContent(b);
  await bottomNav(f, 'pay');
  return f;
}
// WF-14 그룹 드롭다운
{
  const f = await baseList('14', '그룹 드롭다운 (펼침)', fx(GX, 1), { open: true });
  dim(f, 100);
  const dd = box({ parent: f, abs: true, dir: 'V', w: 280, pad: [8, 0, 8, 0], gap: 0, radius: 16, fill: C.bg, stroke: C.line, name: 'GroupDropdown' });
  dd.effects = [{ type: 'DROP_SHADOW', color: { r: 0, g: 0, b: 0, a: 0.12 }, offset: { x: 0, y: 8 }, radius: 24, spread: 0, visible: true, blendMode: 'NORMAL' }];
  for (const [n, st, k, cur] of [['오사카 3박 4일', '진행 중', 'solid', true], ['부산 연말 모임', '시작 전', 'soft', false], ['제주 우정여행', '종료', 'personal', false]]) {
    const r = box({ parent: dd, dir: 'H', w: 'fill', h: 52, pad: [0, 16, 0, 16], gap: 8, align: 'CENTER', fill: cur ? C.soft : undefined, name: 'GroupItem/' + n });
    await T(n, { parent: r, size: 15, weight: cur ? 'Bold' : 'Medium' });
    await tag(st, r, k);
    box({ parent: r, dir: 'N', w: 'fill', h: 10, name: 'flex' });
    if (cur) icon('checkmark', { parent: r, size: 20, dark: true });
  }
  const dv = box({ parent: dd, dir: 'V', w: 'fill', pad: [6, 0, 6, 0] }); line(dv);
  for (const [ic, l] of [['plus-math', '새 여정 만들기'], ['link', '초대코드로 참여']]) {
    const r = box({ parent: dd, dir: 'H', w: 'fill', h: 48, pad: [0, 16, 0, 16], gap: 10, align: 'CENTER', name: 'Action/' + l });
    icon(ic, { parent: r, size: 20, dark: true });
    await T(l, { parent: r, size: 15, weight: 'Medium', w: 'fill' });
  }
  dd.x = 12; dd.y = 96;
  ids['WF-14'] = f.id;
  await note(fx(GX, 1), NY, '14', '그룹 드롭다운', '그룹명 + 상태 태그 · 생성/참여');
}
// WF-15 그룹원 패널
{
  const f = await baseList('15', '그룹원 패널 (사이드)', fx(GX, 2));
  dim(f, 0);
  const d = box({ parent: f, abs: true, dir: 'V', w: 304, h: SH, pad: [44, 0, 24, 0], gap: 0, fill: C.bg, name: 'MemberDrawer' });
  d.topRightRadius = 20; d.bottomRightRadius = 20;
  const dh = box({ parent: d, dir: 'H', w: 'fill', h: 56, pad: [0, 8, 0, 20], align: 'CENTER' });
  await T('그룹원 4명', { parent: dh, size: 18, weight: 'Bold', w: 'fill' });
  iconBtn('multiply', dh, { size: 20 });
  const ml = box({ parent: d, dir: 'V', w: 'fill', gap: 0, pad: [0, 20, 0, 20], name: 'Members' });
  for (const [n, lead, me] of [['준용', true, true], ['민지'], ['태현'], ['수빈']]) {
    const r = box({ parent: ml, dir: 'H', w: 'fill', h: 56, gap: 10, align: 'CENTER', borderB: C.box, name: 'Member/' + n });
    await avatar(n, r, 36);
    await T(n, { parent: r, size: 15, weight: 'Bold' });
    if (lead) icon('crown', { parent: r, size: 16, dark: true });
    if (me) await tag('나', r, 'personal');
    box({ parent: r, dir: 'N', w: 'fill', h: 10, name: 'flex' });
    if (!lead) await T('강퇴', { parent: r, size: 13, color: C.sub, underline: true });
  }
  const ic = box({ parent: d, dir: 'V', w: 'fill', pad: [20, 20, 0, 20] });
  await inviteStrip(ic);
  grower(d);
  const lb = box({ parent: d, dir: 'H', gap: 8, align: 'CENTER', pad: [0, 20, 0, 20] });
  icon('exit', { parent: lb, size: 20 });
  await T('그룹 나가기', { parent: lb, size: 15, weight: 'Medium', color: C.sub });
  d.x = 0; d.y = 0;
  ids['WF-15'] = f.id;
  await note(fx(GX, 2), NY, '15', '그룹원 패널', '왕관 = 그룹장 · 강퇴는 그룹장만');
}
return ids;

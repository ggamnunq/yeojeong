const out = {};
async function setText(n, s) { await font(n.fontName.family, n.fontName.style); n.characters = s; }
out.remainingDash = [S1(), S2()].map(s=>s.findAll(n=>'dashPattern' in n && n.dashPattern && n.dashPattern.length>0).length);
const R = name => TOK.roles.find(r=>r.name===name);
// S1 role token cards + S2 compact role items: update hex/desc text for expense/pending/*
let upd = 0;
for (const nm of ['expense/pending/bg','expense/pending/fg','expense/pending/border']) { const r = R(nm);
  for (const it of S1().findAll(n=>n.type==='FRAME' && n.name===nm)) { const texts = it.findAll(n=>n.type==='TEXT');
    for (const t of texts) { if (/#[0-9A-F]{6}/.test(t.characters) && t.characters !== nm) { await setText(t, (r.ref? r.ref+' · ':'') + r.hex); upd++; } else if (t.characters !== nm) { await setText(t, r.desc); upd++; } } }
  for (const it of S2().findAll(n=>n.type==='FRAME' && n.name===nm)) { for (const t of it.findAll(n=>n.type==='TEXT')) if (/#[0-9A-F]{6}/.test(t.characters)) { await setText(t, r.hex); upd++; } } }
out.roleTextUpdated = upd;
// add expense/pending/dot items (S1 expense group grid, S2 roles grid)
const dr = R('expense/pending/dot');
{ const g = S1().findOne(n=>n.name==='roles/지출 구분 — 공동 vs 개인 (+ 미확정)'); const grid = g && g.findOne(n=>n.name==='grid');
  if (grid && !grid.findOne(n=>n.name===dr.name)) { const tpl = grid.findOne(n=>n.name==='expense/pending/border'); const c = tpl.clone(); grid.insertChild(grid.children.indexOf(tpl)+1, c); c.name = dr.name;
    c.findOne(n=>n.name==='swatch').fills=[await P(dr.name)]; const ts = c.findAll(n=>n.type==='TEXT'); await setText(ts[0], dr.name); await setText(ts[1], dr.ref+' · '+dr.hex); await setText(ts[2], dr.desc); out.s1dot = c.id; } }
{ const grid = S2().findOne(n=>n.name==='Color variables').findOne(n=>n.name==='roles');
  if (!grid.findOne(n=>n.name===dr.name)) { const tpl = grid.findOne(n=>n.name==='expense/pending/border'); const c = tpl.clone(); grid.insertChild(grid.children.indexOf(tpl)+1, c); c.name = dr.name;
    c.findOne(n=>n.name==='sw').fills=[await P(dr.name)]; const ts = c.findAll(n=>n.type==='TEXT'); await setText(ts[0], dr.name); await setText(ts[1], dr.hex); out.s2dot = c.id; } }
// S1 typography: Archivo -> IBM Plex Sans KR
const tb = node(IDS.type.type);
const desc = tb.findOne(n=>n.name==='desc'); if (desc) await setText(desc, '한글 본문은 Noto Sans KR, 금액·숫자는 IBM Plex Sans KR. Pretendard가 없는 환경에서 가장 안정적인 한글 산세리프(7단계 굵기)와, 기본 숫자가 고정폭(tabular)이라 금액 자릿수가 세로로 맞고 ₩ 가로획이 온전하며 한글도 들어 있는 Plex KR의 조합이다(v1.3: Archivo에서 교체 — Archivo의 ₩는 가로획이 W 끝과 같은 지점에서 끝나 작은 크기에서 잘려 보였다). 모든 스타일은 같은 이름의 Text style로 등록되어 있다.');
const fam = tb.findOne(n=>n.name==='family/Archivo');
if (fam) { fam.name = 'family/IBM Plex Sans KR';
  for (const t of fam.findAll(n=>n.type==='TEXT')) {
    if (t.fontName !== figma.mixed && t.fontName.family === 'Archivo' && t.name !== 'eyebrow') { const st = t.fontName.style==='Bold'?'Bold':'Regular'; await font('IBM Plex Sans KR', st); t.fontName = {family:'IBM Plex Sans KR', style: st}; }
    if (t.name === 'eyebrow') await setText(t, 'NUMERALS · IBM Plex Sans KR');
    if (t.characters.startsWith('금액 전용')) await setText(t, '금액 전용(Amount/L·M·S). 기본 숫자가 고정폭이라 리스트에서 자릿수가 정렬되고, ₩ 가로획이 양쪽으로 온전하며, 한글이 들어 있어 "1인 ₩9,467"·"11,770원" 같은 혼합 문자열도 같은 서체로 쓸 수 있다.');
  } }
for (const t of tb.findAll(n=>n.type==='TEXT' && n.characters.startsWith('Archivo '))) await setText(t, t.characters.replace(/^Archivo /, 'IBM Plex Sans KR '));
const tab = tb.findOne(n=>n.name==='tab/Archivo');
if (tab) { tab.name = 'tab/IBM Plex Sans KR'; for (const t of tab.findAll(n=>n.type==='TEXT')) { if (t.characters.startsWith('✓ Archivo')) await setText(t, '✓ IBM Plex Sans KR — 고정폭 숫자: 자릿수가 세로로 맞는다'); else if (t.fontName !== figma.mixed && t.fontName.family==='Archivo') { await font('IBM Plex Sans KR','SemiBold'); t.fontName={family:'IBM Plex Sans KR', style:'SemiBold'}; } } }
// S2 type styles card: description line
const tcard = S2().findOne(n=>n.name==='Type styles'); const td = tcard && tcard.findAll(n=>n.type==='TEXT').find(n=>n.characters.startsWith('Noto Sans KR(한글) + Archivo'));
if (td) await setText(td, 'Noto Sans KR(한글) + IBM Plex Sans KR(금액, v1.3). 줄간격은 px 고정.');
return out;

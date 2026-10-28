// v3.1 소규모 패스: "미확정" 표기를 조용한 회색 칩으로 (04만, 노드 ID 유지·제자리 수정)
const s = SEC();
const out = { tags: 0, banners: 0, rowAmounts: 0, tlCards: 0, sheetMoves: 0, headerDesc: 0, screens: new Set() };
const wfOf = n => { let p = n; while (p && !(p.type === 'FRAME' && /^WF-\d\d /.test(p.name))) p = p.parent; return p ? p.name.slice(0, 5) : null; };
await font(FONT, 'Medium'); await font(FONT, 'Regular');
// 1) 미확정 칩: 연회색 배경 + 회색 글자, 테두리·아이콘 없음, 높이 20, 글자 11
const tags = s.findAll(n => n.type === 'FRAME' && n.name === 'Tag/미확정');
for (const t of tags) {
  t.fills = [solid(C.soft)]; t.strokes = []; t.dashPattern = [];
  for (const c of [...t.children]) if (c.type !== 'TEXT') c.remove();
  const tx = t.children.find(c => c.type === 'TEXT'); tx.fills = [solid(C.sub)]; tx.fontSize = 11;
  t.layoutSizingVertical = 'FIXED'; t.resize(t.width, 20);
  out.tags++; const w = wfOf(t); if (w) out.screens.add(w);
}
// 2) 확인 필요 배너: 점선 → 실선 연회색
for (const b of s.findAll(n => n.type === 'FRAME' && n.name === 'Banner/미확정')) {
  b.strokes = [solid(C.line)]; b.dashPattern = []; out.banners++; const w = wfOf(b); if (w) out.screens.add(w);
}
// 3) 미확정 결제 행: 금액(원화·원통화) 보조색
for (const r of s.findAll(n => n.type === 'FRAME' && n.name.startsWith('PayRow/'))) {
  const meta = r.findOne(n => n.name === 'meta');
  if (!meta || !meta.children.some(c => c.name === 'Tag/미확정')) continue;
  const am = r.findOne(n => n.name === 'amount');
  if (am) { for (const tx of am.children) if (tx.type === 'TEXT') tx.fills = [solid(C.sub)]; out.rowAmounts++; }
}
// 4) 타임라인 미확정 카드: 점선 → 실선, 금액 보조색
for (const it of s.findAll(n => n.type === 'FRAME' && n.name.startsWith('TL/') && n.name !== 'TL/now')) {
  if (!it.findOne(n => n.name === 'Tag/미확정')) continue;
  const cardN = it.findOne(n => n.name === 'Card');
  if (cardN) { cardN.strokes = [solid(C.line)]; cardN.dashPattern = []; }
  const r1 = cardN && cardN.children[0];
  if (r1) { const txs = r1.children.filter(c => c.type === 'TEXT'); if (txs[1]) txs[1].fills = [solid(C.sub)]; }
  out.tlCards++;
}
// 5) 결제 상세 시트: 헤더 줄의 미확정 칩 → 부제(메타) 줄 맨 끝으로 이동
for (const sh of s.findAll(n => n.type === 'FRAME' && n.name === 'BottomSheet')) {
  const hr = sh.children[1]; if (!hr) continue;
  const tg = hr.children.find(c => c.name === 'Tag/미확정'); if (!tg) continue;
  const tt = sh.children[2]; const sub = tt && tt.children[1]; if (!sub || sub.type !== 'TEXT') continue;
  const meta = box({ dir: 'H', gap: 6, align: 'CENTER', name: 'meta' });
  tt.insertChild(1, meta); meta.layoutSizingHorizontal = 'HUG'; meta.layoutSizingVertical = 'HUG';
  meta.appendChild(sub); meta.appendChild(tg);
  out.sheetMoves++;
}
// 6) 상단 표기 규칙 카드: 미확정 설명 갱신
const hc = s.children.find(c => c.name === 'Header · 읽는 법 + 표기 규칙');
if (hc) {
  const tg = hc.findOne(n => n.name === 'Tag/미확정');
  const row = tg && tg.parent && tg.parent.parent;
  const desc = row && row.children.find(c => c.type === 'TEXT');
  if (desc) { desc.characters = '결제자만 보임 · 메타 줄 끝 회색 칩'; out.headerDesc++; }
}
out.screens = [...out.screens].sort();
return { patch: out };

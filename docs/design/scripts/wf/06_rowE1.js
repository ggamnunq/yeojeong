// Row E (1/3): WF-18 리스트(제자리 수정) / WF-19 타임라인 / WF-20 결제 상세(개인 확정)  (정보 다이어트 v2)
// ※ WF-18(24:7451)은 03 예시 화면 에이전트가 참고 중 → 프레임을 지우지 않고 내용만 수정한다.
const Y0 = BAND_Y[2], FY = Y0 + FRAME_DY, NY = FY + SH + 24, GX = 1300;
const WF18_ID = '24:7451';
clean(['19', '20'], ['RowTitle · E', 'Note · WF-18']);
const ids = {};
await rowTitle('E', GX, Y0, 'E. 여정 진행 중  (11.13 금 18:34, Day 2)',
  '결제내역 [리스트 ⇄ 타임라인] → 결제 탭 → 상세 바텀시트  |  현황  |  여정 정보 → 수동 종료', 3330);

async function baseList(id, title, x) {
  const f = await screen(id, title, x, FY, { time: '18:34' });
  await appHeader(f);
  const b = body(f, { gap: 12, pad: [16, 20, 0, 20] });
  await payListContent(b);
  await bottomNav(f, 'pay');
  return f;
}
// WF-18 결제내역 리스트 — 제자리 수정
{
  const f = node(WF18_ID);
  const b = f.children.find(c => c.name === 'Body');
  // 1) 미확정 배너 → "확인 필요 2건 ›" 한 줄
  const bn = b.children.find(c => c.name === 'Banner/미확정');
  if (bn.children.length !== 3 || bn.children[1].type !== 'TEXT') {
    for (const c of [...bn.children]) c.remove();
    bn.cornerRadius = 10; bn.paddingTop = 0; bn.paddingBottom = 0; bn.paddingLeft = 14; bn.paddingRight = 14; bn.itemSpacing = 8;
    bn.layoutSizingVertical = 'FIXED'; bn.resize(bn.width, 44);
    await compactBanner(bn);
  }
  // 2) 필터 제거, 토글 전체 폭
  const ctl = b.children.find(c => c.name === 'Controls');
  for (const c of [...ctl.children]) if (c.name === 'Filter' || c.name === 'flex') c.remove();
  const seg = ctl.children.find(c => c.name === 'Segmented'); if (seg) seg.layoutSizingHorizontal = 'FILL';
  // 3) 날짜 헤더의 일자별 합계 제거
  for (const dh of b.findAll(n => n.name === 'DateHeader')) while (dh.children.length > 1) dh.children[dh.children.length - 1].remove();
  // 4) v3: 결제자 아바타 = 프사 규칙, "공동 n명" 태그 → 부담 인원 프사 스택 (PayRow 노드는 유지)
  const all = [...PAY_D2, ...PAY_D1];
  for (const row of b.findAll(n => n.name.startsWith('PayRow/'))) {
    const d = all.find(x => 'PayRow/' + x.name === row.name); if (!d) continue;
    const av = row.children[0];
    if (!/\((사진|기본)\)$/.test(av.name)) { const na = await avatar(d.payer, row, 36); row.insertChild(0, na); av.remove(); }
    const meta = row.findOne(n => n.name === 'meta');
    while (meta.children.length > 1) meta.children[meta.children.length - 1].remove();
    await payMark(meta, d);
  }
  await place('18');
  ids['WF-18'] = f.id;
  await note(fx(GX, 0), NY, '18', '결제내역 · 리스트 (기본)', '최신순 · 부담 인원 = 프사 스택');
}
// WF-19 결제내역 타임라인
{
  const f = await screen('19', '결제내역 · 타임라인', fx(GX, 1), FY, { time: '18:34' });
  await appHeader(f);
  const b = body(f, { gap: 12, pad: [16, 20, 0, 20] });
  await payTop(b, '타임라인');
  const days = box({ parent: b, dir: 'H', w: 'fill', gap: 6, name: 'DayChips' });
  for (const [d, st] of [['Day 1', 'off'], ['Day 2', 'on'], ['Day 3', 'future'], ['Day 4', 'future']]) {
    const c = box({ parent: days, dir: 'H', w: 'fill', h: 36, radius: 18, align: 'CENTER', justify: 'CENTER', fill: st === 'on' ? C.ink : C.bg, stroke: st === 'on' ? undefined : C.line, name: 'Chip/' + d });
    await T(d, { parent: c, size: 13, weight: 'Bold', color: st === 'on' ? '#FFFFFF' : C.ink });
    if (st === 'future') c.opacity = 0.4;
  }
  spacer(b, 2);
  const tl = box({ parent: b, dir: 'V', w: 'fill', gap: 0, name: 'Timeline' });
  const items = [...PAY_D2].reverse();
  for (let i = 0; i < items.length; i++) {
    const d = items[i];
    const it = box({ parent: tl, dir: 'H', w: 'fill', gap: 8, align: 'MIN', name: 'TL/' + d.name });
    const tc = box({ parent: it, dir: 'V', w: 40, pad: [12, 0, 0, 0] });
    await T(d.time, { parent: tc, size: 12, weight: 'Bold', w: 'fill', align: 'RIGHT' });
    const rail = box({ parent: it, dir: 'V', w: 14, h: 'fill', align: 'CENTER', gap: 0, name: 'rail' });
    rail.layoutSizingVertical = 'FILL';
    box({ parent: rail, dir: 'N', w: 2, h: 16, fill: i === 0 ? undefined : C.line, name: 'lineTop' });
    box({ parent: rail, dir: 'N', w: 10, h: 10, radius: 5, fill: d.tag === 'pending' ? C.bg : C.ink, stroke: d.tag === 'pending' ? C.ink : undefined, sw: 2, name: 'dot' });
    const lb = box({ parent: rail, dir: 'N', w: 2, h: 'fill', fill: C.line, name: 'lineBottom' }); lb.layoutSizingVertical = 'FILL';
    const cw = box({ parent: it, dir: 'V', w: 'fill', pad: [0, 0, 12, 0] });
    const c = card(cw, { gap: 4, pad: [10, 12, 10, 12], radius: 12, stroke: C.line });
    const r1 = box({ parent: c, dir: 'H', w: 'fill', gap: 8, align: 'CENTER' });
    await T(d.name, { parent: r1, size: 14, weight: 'Medium', w: 'fill', lh: 19 });
    await T(d.krw, { parent: r1, size: 14, weight: 'Bold', lh: 19, color: d.tag === 'pending' ? C.sub : C.ink });
    const r2 = box({ parent: c, dir: 'H', w: 'fill', gap: 6, align: 'CENTER' });
    await T(d.payer, { parent: r2, size: 12, color: C.sub, lh: 16 });
    await payMark(r2, d);
  }
  const now = box({ parent: tl, dir: 'H', w: 'fill', gap: 8, align: 'CENTER', name: 'TL/now' });
  const tc = box({ parent: now, dir: 'V', w: 40 });
  await T('지금', { parent: tc, size: 12, weight: 'Bold', w: 'fill', align: 'RIGHT' });
  const rail = box({ parent: now, dir: 'V', w: 14, align: 'CENTER' });
  box({ parent: rail, dir: 'N', w: 14, h: 14, radius: 7, fill: C.ink, name: 'nowDot' });
  await bottomNav(f, 'pay');
  ids['WF-19'] = f.id;
  await note(fx(GX, 1), NY, '19', '결제내역 · 타임라인', '하루 단위 시간순 · 토글 전환');
}
// WF-20 결제 상세 · 미확정 → 개인 확정
{
  const f = await baseList('20', '결제 상세 · 미확정→개인 확정 (바텀시트)', fx(GX, 2));
  dim(f, 0);
  const s = sheet(f, { gap: 18 });
  const hr = box({ parent: s, dir: 'H', w: 'fill', align: 'CENTER', gap: 6 });
  box({ parent: hr, dir: 'N', w: 'fill', h: 10, name: 'flex' });
  iconBtn('multiply', hr, { size: 18, box: 28 });
  const tt = box({ parent: s, dir: 'V', w: 'fill', gap: 4 });
  await T('패밀리마트 난바역점', { parent: tt, size: 20, weight: 'Bold', w: 'fill' });
  const mt = box({ parent: tt, dir: 'H', gap: 6, align: 'CENTER', name: 'meta' });
  await T('11.13 08:50 · 체크카드 **1934', { parent: mt, size: 13, color: C.sub });
  await tag('미확정', mt, 'pending');
  const am = box({ parent: s, dir: 'H', w: 'fill', gap: 8, align: 'MAX' });
  await T('₩11,770', { parent: am, size: 30, weight: 'Black', lh: 38 });
  await T('¥1,280', { parent: am, size: 14, color: C.sub, lh: 26 });
  await segmented(s, ['개인', '공동'], '개인', { h: 44, size: 15 });
  await btn('개인으로 확정', s);
  placeBottom(f, s);
  ids['WF-20'] = f.id;
  await note(fx(GX, 2), NY, '20', '결제 상세 · 개인 확정', '미확정 → [개인] 확정');
}
return ids;

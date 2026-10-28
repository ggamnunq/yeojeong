// Row F: WF-25 정산 요약 / WF-26 멤버별 결제 내역  (정보 다이어트 v2)
const Y0 = BAND_Y[3], FY = Y0 + FRAME_DY, NY = FY + SH + 24, GX = 120;
clean(['25', '26'], ['RowTitle · F']);
const ids = {};
await rowTitle('F', GX, Y0, 'F. 여정 종료 · 정산', '종료 → 정산 탭 → 멤버 탭 → 그 사람의 결제 내역', 880);

// WF-25 정산 요약
{
  const f = await screen('25', '정산 요약', fx(GX, 0), FY, { time: '10:05' });
  await appHeader(f);
  const b = body(f, { gap: 14, pad: [16, 20, 16, 20] });
  const sc = card(b, { dir: 'H', gap: 0, pad: [16, 16, 16, 16], name: 'Card/정산 요약' });
  for (const [l, v] of [['총 공동 지출', '₩826,910'], ['N빵 인당', '₩206,728']]) {
    const c = box({ parent: sc, dir: 'V', w: 'fill', gap: 4 });
    await T(l, { parent: c, size: 13, color: C.sub });
    await T(v, { parent: c, size: 20, weight: 'Bold', lh: 28 });
  }
  await T('멤버별 정산', { parent: b, size: 15, weight: 'Bold' });
  const mc = card(b, { gap: 0, pad: [4, 14, 4, 14], name: 'Card/멤버별' });
  const rows = [
    ['준용', true, '₩316,390', '₩213,300', '+₩103,090', '받을 돈'],
    ['민지', false, '₩186,960', '₩213,300', '−₩26,340', '보낼 돈'],
    ['태현', false, '₩191,200', '₩200,155', '−₩8,955', '보낼 돈'],
    ['수빈', false, '₩132,360', '₩200,155', '−₩67,795', '보낼 돈'],
  ];
  for (let i = 0; i < rows.length; i++) {
    const [n, me, paid, bur, net, lab] = rows[i];
    const r = box({ parent: mc, dir: 'H', w: 'fill', h: 66, gap: 10, align: 'CENTER', borderB: i < rows.length - 1 ? C.box : undefined, name: 'SettleRow/' + n });
    await avatar(n, r, 36);
    const t = box({ parent: r, dir: 'V', w: 'fill', gap: 2 });
    await T(me ? `${n} (나)` : n, { parent: t, size: 15, weight: 'Bold' });
    await T(`결제 ${paid} · 부담 ${bur}`, { parent: t, size: 12, color: C.sub });
    const a = box({ parent: r, dir: 'V', align: 'MAX', gap: 0 });
    await T(net, { parent: a, size: 16, weight: net.startsWith('+') ? 'Black' : 'Bold', lh: 22 });
    await T(lab, { parent: a, size: 11, color: C.sub, lh: 14 });
    icon('forward', { parent: r, size: 14 });
  }
  await bottomNav(f, 'stat', { ended: true });
  ids['WF-25'] = f.id;
  await note(fx(GX, 0), NY, '25', '정산 요약', '멤버별 결제 · 부담 · ±');
}
// WF-26 멤버별 결제 내역 (민지)
{
  const f = await screen('26', '멤버별 결제 내역 (민지)', fx(GX, 1), FY, { time: '10:06' });
  await subHeader(f, '민지');
  const b = body(f, { gap: 14, pad: [16, 20, 12, 20] });
  const sm = card(b, { dir: 'H', gap: 0, pad: [14, 4, 14, 4], radius: 12 });
  const cols = [['결제', '₩186,960'], ['부담', '₩213,300'], ['정산', '−₩26,340']];
  for (let i = 0; i < cols.length; i++) {
    const c = box({ parent: sm, dir: 'V', w: 'fill', gap: 2, align: 'CENTER' });
    await T(cols[i][0], { parent: c, size: 12, color: C.sub });
    await T(cols[i][1], { parent: c, size: 15, weight: i === 2 ? 'Black' : 'Bold' });
  }
  await T('공동 결제 3건', { parent: b, size: 15, weight: 'Bold' });
  const l = box({ parent: b, dir: 'V', w: 'fill', gap: 0 });
  const ps = [['11.12 11:20', '난카이 라피트 간사이공항역', '₩54,780'], ['11.13 16:40', '우메다 스카이빌딩 공중정원', '₩73,540'], ['11.15 12:10', '간사이공항 보테쥬', '₩58,640']];
  for (const [dt, n, k] of ps) {
    const r = box({ parent: l, dir: 'H', w: 'fill', pad: [11, 0, 11, 0], gap: 10, align: 'CENTER', borderB: C.box });
    const t = box({ parent: r, dir: 'V', w: 'fill', gap: 2 });
    await T(n, { parent: t, size: 14, weight: 'Medium', w: 'fill' });
    const m = box({ parent: t, dir: 'H', gap: 6, align: 'CENTER' });
    await T(dt, { parent: m, size: 12, color: C.sub });
    await stack(m, ['준용', '민지', '태현', '수빈'], { size: 20 });
    await T(k, { parent: r, size: 14, weight: 'Bold' });
  }
  const pr = box({ parent: b, dir: 'H', w: 'fill', gap: 8, align: 'CENTER', pad: [8, 0, 0, 0] });
  await T('개인 결제 3건', { parent: pr, size: 15, weight: 'Bold', w: 'fill' });
  icon('lock', { parent: pr, size: 16 });
  await T('비공개', { parent: pr, size: 13, color: C.sub });
  await bottomNav(f, 'stat', { ended: true });
  ids['WF-26'] = f.id;
  await note(fx(GX, 1), NY, '26', '멤버별 결제 내역', '남의 개인 결제는 건수만');
}
return ids;

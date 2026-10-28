// Row G: WF-27 지갑 / WF-28 계좌·카드 추가 / WF-29 환율   ·   Row H: WF-30 마이페이지  (정보 다이어트 v2)
const Y0 = BAND_Y[3], FY = Y0 + FRAME_DY, NY = FY + SH + 24, GX = 1300, HX = 2970;
clean(['27', '28', '29', '30'], ['RowTitle · G', 'RowTitle · H']);
const ids = {};
await rowTitle('G', GX, Y0, 'G. 지갑', '헤더 지갑 → 계좌·카드 → 추가(토스) / 환율', 1370);
await rowTitle('H', HX, Y0, 'H. 마이페이지', '닉네임 · 지갑 요약 · 로그아웃', 700);

async function acctList(p) {
  const c = card(p, { gap: 0, pad: [2, 14, 2, 14], radius: 12, name: 'AccountList' });
  const rows = [['bank', '토스뱅크 통장', '1000-12**-**21'], ['bank-card-back-side', '토스뱅크 체크카드', '5365-****-****-1934'], ['bank-card-back-side', '신한카드 Deep Dream', '4518-****-****-1102']];
  for (let i = 0; i < rows.length; i++) {
    const [ic, n, num] = rows[i];
    const r = box({ parent: c, dir: 'H', w: 'fill', h: 64, gap: 12, align: 'CENTER', borderB: i < rows.length - 1 ? C.box : undefined, name: 'Account/' + n });
    const ib = box({ parent: r, dir: 'H', w: 40, h: 40, radius: 10, fill: C.soft, align: 'CENTER', justify: 'CENTER' });
    icon(ic, { parent: ib, size: 22 });
    const t = box({ parent: r, dir: 'V', w: 'fill', gap: 2 });
    await T(n, { parent: t, size: 15, weight: 'Medium' });
    await T(num, { parent: t, size: 13, color: C.sub });
    icon('more', { parent: r, size: 18 });
  }
  return c;
}
async function walletScreen(id, title, x) {
  const f = await screen(id, title, x, FY, { time: '18:34' });
  await subHeader(f, '지갑');
  const b = body(f, { gap: 14, pad: [16, 20, 16, 20] });
  const sh = box({ parent: b, dir: 'H', w: 'fill', align: 'CENTER', gap: 4 });
  await T('연결된 계좌·카드', { parent: sh, size: 15, weight: 'Bold', w: 'fill' });
  await T('18:32 동기화', { parent: sh, size: 12, color: C.sub });
  iconBtn('refresh', sh, { size: 18, box: 32 });
  await acctList(b);
  await btn('계좌·카드 추가', b, { kind: 'secondary', icon: 'plus-math', h: 48, size: 15 });
  spacer(b, 6);
  await T('환율', { parent: b, size: 15, weight: 'Bold' });
  const fxc = card(b, { dir: 'H', gap: 12, align: 'CENTER', radius: 12, pad: [14, 14, 14, 14], name: 'Card/환율' });
  const ib = box({ parent: fxc, dir: 'H', w: 40, h: 40, radius: 10, fill: C.soft, align: 'CENTER', justify: 'CENTER' });
  icon('currency-exchange', { parent: ib, size: 22 });
  await T('100엔 = 919.20원', { parent: fxc, size: 16, weight: 'Bold', w: 'fill' });
  icon('forward', { parent: fxc, size: 16 });
  return f;
}
// WF-27 지갑
{
  const f = await walletScreen('27', '지갑 (연결 계좌·카드)', fx(GX, 0));
  ids['WF-27'] = f.id;
  await note(fx(GX, 0), NY, '27', '지갑', '동기화 시각 · 새로고침');
}
// WF-28 계좌·카드 추가 (바텀시트)
{
  const f = await walletScreen('28', '계좌·카드 추가 (바텀시트)', fx(GX, 1));
  dim(f, 0);
  const s = sheet(f, { gap: 18 });
  const hr = box({ parent: s, dir: 'H', w: 'fill', align: 'CENTER' });
  await T('계좌·카드 추가', { parent: hr, size: 20, weight: 'Bold', w: 'fill' });
  iconBtn('multiply', hr, { size: 18, box: 28 });
  const op = card(s, { dir: 'H', gap: 12, align: 'CENTER', stroke: C.ink, radius: 14, pad: [14, 14, 14, 14] });
  await placeholder(op, '토스', { w: 44, h: 44, radius: 12, size: 12 });
  await T('토스로 불러오기', { parent: op, size: 16, weight: 'Bold', w: 'fill' });
  radio(op, true, 22);
  await btn('토스로 연결하기', s);
  placeBottom(f, s);
  ids['WF-28'] = f.id;
  await note(fx(GX, 1), NY, '28', '계좌·카드 추가', '토스로 불러오기 → WF-06~08');
}
// WF-29 환율 설정
{
  const f = await screen('29', '환율 표시 · 기준 설정', fx(GX, 2), FY, { time: '18:34' });
  await subHeader(f, '환율');
  const b = body(f, { gap: 14, pad: [16, 20, 16, 20] });
  const cur = card(b, { gap: 6, fill: C.soft, noStroke: true, radius: 14, pad: [18, 16, 16, 16] });
  await T('100엔 = 919.20원', { parent: cur, size: 26, weight: 'Black', lh: 34 });
  const cr = box({ parent: cur, dir: 'H', w: 'fill', align: 'CENTER', gap: 6 });
  await T('18:00 갱신', { parent: cr, size: 13, color: C.sub, w: 'fill' });
  icon('refresh', { parent: cr, size: 18, dark: true });
  const cc = card(b, { gap: 0, pad: [2, 14, 2, 14], radius: 12 });
  for (const [i, l, v] of [[0, '기준 통화', 'KRW 원'], [1, '여행 통화', 'JPY 엔']]) {
    const r = box({ parent: cc, dir: 'H', w: 'fill', h: 52, gap: 10, align: 'CENTER', borderB: i === 0 ? C.box : undefined });
    await T(l, { parent: r, size: 14, color: C.sub, w: 'fill' });
    await T(v, { parent: r, size: 15, weight: 'Bold' });
  }
  spacer(b, 4);
  const th = box({ parent: b, dir: 'H', w: 'fill', align: 'CENTER' });
  await T('적용 환율', { parent: th, size: 15, weight: 'Bold', w: 'fill' });
  await tag('그룹장 전용', th, 'soft');
  const rc = card(b, { gap: 0, pad: [2, 14, 2, 14], radius: 12 });
  const opts = [['결제 시점 매매기준율', true], ['카드사 청구 환율', false], ['고정 환율 직접 입력', false]];
  for (let i = 0; i < opts.length; i++) {
    const [t, on] = opts[i];
    const r = box({ parent: rc, dir: 'H', w: 'fill', h: 52, gap: 12, align: 'CENTER', borderB: i < opts.length - 1 ? C.box : undefined });
    radio(r, on, 22);
    await T(t, { parent: r, size: 15, weight: on ? 'Bold' : 'Medium', w: 'fill' });
  }
  ids['WF-29'] = f.id;
  await note(fx(GX, 2), NY, '29', '환율', '여정 단위 · 그룹장만 변경');
}
// WF-30 마이페이지
{
  const f = await screen('30', '마이페이지', HX, FY, { time: '18:34' });
  await subHeader(f, '마이페이지');
  const b = body(f, { gap: 16, pad: [20, 20, 16, 20] });
  const pr = box({ parent: b, dir: 'H', w: 'fill', gap: 14, align: 'CENTER' });
  await avatar('준용', pr, 60);
  await T('준용', { parent: pr, size: 20, weight: 'Bold', w: 'fill' });
  await btn('닉네임 변경', pr, { kind: 'secondary', w: 92, h: 34, size: 13, radius: 8, padX: 8, weight: 'Medium' });
  const wc = card(b, { dir: 'H', gap: 10, align: 'CENTER', radius: 14, pad: [16, 16, 16, 16], name: 'Card/지갑 요약' });
  icon('wallet', { parent: wc, size: 22, dark: true });
  await T('내 지갑', { parent: wc, size: 15, weight: 'Bold', w: 'fill' });
  await T('계좌·카드 3개', { parent: wc, size: 14, color: C.sub });
  icon('forward', { parent: wc, size: 14 });
  const ml = box({ parent: b, dir: 'V', w: 'fill', gap: 0, name: 'Menu' });
  for (const [t, r] of [['이용약관', ''], ['개인정보 처리방침', ''], ['버전 정보', '1.0.0']]) {
    const row = box({ parent: ml, dir: 'H', w: 'fill', h: 52, gap: 8, align: 'CENTER', borderB: C.box });
    await T(t, { parent: row, size: 15, w: 'fill' });
    if (r) await T(r, { parent: row, size: 13, color: C.sub });
    else icon('forward', { parent: row, size: 14 });
  }
  grower(b);
  const lo = box({ parent: b, dir: 'H', w: 'fill', justify: 'CENTER' });
  await btn('로그아웃', lo, { kind: 'ghost', icon: 'exit', w: 140, h: 44, size: 15 });
  ids['WF-30'] = f.id;
  await note(HX, NY, '30', '마이페이지', '닉네임 · 지갑 · 로그아웃');
}
return ids;

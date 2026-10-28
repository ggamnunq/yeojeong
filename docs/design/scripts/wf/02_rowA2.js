// Row A (2/2): WF-05 ~ WF-08  토스 지갑 연동  (정보 다이어트 v2)
const Y0 = BAND_Y[0], FY = Y0 + FRAME_DY, NY = FY + SH + 24, GX = 120;
clean(['05', '06', '07', '08']);
const ids = {};
async function stepBar(p, n, total = 3) {
  const r = box({ parent: p, dir: 'H', w: 'fill', gap: 6, name: 'StepBar' });
  for (let i = 1; i <= total; i++) box({ parent: r, dir: 'N', w: 'fill', h: 4, radius: 2, fill: i <= n ? C.ink : C.box, name: 'step' });
  return r;
}
async function acctRow(p, ic, name, num, on) {
  const r = card(p, { dir: 'H', align: 'CENTER', gap: 12, pad: [14, 14, 14, 14], radius: 12, stroke: on ? C.ink : C.line, name: 'AccountRow/' + name });
  const ib = box({ parent: r, dir: 'H', w: 40, h: 40, radius: 10, fill: C.soft, align: 'CENTER', justify: 'CENTER' });
  icon(ic, { parent: ib, size: 22 });
  const t = box({ parent: r, dir: 'V', w: 'fill', gap: 2 });
  await T(name, { parent: t, size: 15, weight: 'Medium', w: 'fill' });
  await T(num, { parent: t, size: 13, color: C.sub, w: 'fill' });
  checkbox(r, on, 24);
  return r;
}

// WF-05 토스 연동 안내
{
  const f = await screen('05', '토스 지갑 연동 안내', fx(GX, 4), FY);
  await subHeader(f, '', { right: '3/3', noBorder: true });
  const b = body(f, { gap: 24, pad: [4, 20, 20, 20] });
  await stepBar(b, 3);
  await T('토스 지갑을 연결해 주세요', { parent: b, size: 24, weight: 'Bold', lh: 34, w: 'fill' });
  await placeholder(b, '토스 연동 일러스트', { h: 180 });
  const chips = box({ parent: b, dir: 'H', w: 'fill', gap: 8, justify: 'CENTER' });
  for (const [ic, l] of [['lock', '조회 전용'], ['invisible', '내 결제는 나만']]) {
    const c = box({ parent: chips, dir: 'H', h: 32, pad: [0, 12, 0, 10], radius: 16, fill: C.soft, gap: 6, align: 'CENTER', name: 'Chip/' + l });
    icon(ic, { parent: c, size: 16, dark: true });
    await T(l, { parent: c, size: 13, weight: 'Medium' });
  }
  grower(b);
  const bt = box({ parent: b, dir: 'V', w: 'fill', gap: 4 });
  await btn('토스로 연결하기', bt);
  await btn('나중에', bt, { kind: 'ghost', h: 44, size: 14 });
  ids['WF-05'] = f.id;
  await note(fx(GX, 4), NY, '05', '토스 지갑 연동 안내', '라벨 2개 · 나중에 → 지갑에서');
}
// WF-06 토스 인증 (외부 대기)
{
  const f = await screen('06', '토스 인증 (외부 대기)', fx(GX, 5), FY);
  await subHeader(f, '토스 인증', { close: true });
  const b = body(f, { gap: 24, pad: [28, 20, 20, 20], align: 'CENTER' });
  const ph = box({ parent: b, dir: 'V', w: 'fill', h: 240, radius: 16, fill: C.box, align: 'CENTER', justify: 'CENTER', gap: 10, name: 'Placeholder/토스 화면' });
  icon('external-link', { parent: ph, size: 32 });
  await T('토스 인증 화면 (외부)', { parent: ph, size: 15, weight: 'Bold', color: C.sub });
  const tx = box({ parent: b, dir: 'V', w: 'fill', gap: 10, align: 'CENTER' });
  icon('hourglass', { parent: tx, size: 28, dark: true });
  await T('토스에서 인증 중이에요', { parent: tx, size: 20, weight: 'Bold', align: 'CENTER', w: 'fill' });
  grower(b);
  await btn('토스 다시 열기', b, { kind: 'secondary' });
  ids['WF-06'] = f.id;
  await note(fx(GX, 5), NY, '06', '토스 인증 (외부 대기)', '외부 인증 대기 → WF-07 자동 복귀');
}
// WF-07 계좌·카드 선택
{
  const f = await screen('07', '계좌·카드 선택', fx(GX, 6), FY);
  await subHeader(f, '', { right: '3/3', noBorder: true });
  const b = body(f, { gap: 16, pad: [4, 20, 20, 20] });
  await stepBar(b, 3);
  await T('불러올 계좌·카드', { parent: b, size: 24, weight: 'Bold', lh: 34, w: 'fill' });
  const sa = box({ parent: b, dir: 'H', w: 'fill', align: 'CENTER', gap: 10, pad: [4, 4, 4, 4] });
  checkbox(sa, false, 22);
  await T('전체 선택', { parent: sa, size: 15, weight: 'Medium', w: 'fill' });
  const l = box({ parent: b, dir: 'V', w: 'fill', gap: 10 });
  await acctRow(l, 'bank', '토스뱅크 통장', '1000-12**-**21', true);
  await acctRow(l, 'bank-card-back-side', '토스뱅크 체크카드', '5365-****-****-1934', true);
  await acctRow(l, 'bank-card-back-side', '신한카드 Deep Dream', '4518-****-****-1102', true);
  await acctRow(l, 'bank', '카카오뱅크 세이프박스', '3333-**-****821', false);
  grower(b);
  await btn('3개 연결하기', b);
  ids['WF-07'] = f.id;
  await note(fx(GX, 6), NY, '07', '계좌·카드 선택', '기본 전체 선택 · 번호 마스킹');
}
// WF-08 연동 완료
{
  const f = await screen('08', '연동 완료', fx(GX, 7), FY);
  const b = body(f, { gap: 14, pad: [0, 20, 24, 20], align: 'CENTER' });
  grower(b);
  icon('ok', { parent: b, size: 64, dark: true });
  await T('연결 완료', { parent: b, size: 24, weight: 'Bold', align: 'CENTER', w: 'fill' });
  await T('계좌 1 · 카드 2', { parent: b, size: 15, color: C.sub, align: 'CENTER', w: 'fill' });
  grower(b);
  await btn('여정으로 가기', b);
  ids['WF-08'] = f.id;
  await note(fx(GX, 7), NY, '08', '연동 완료', '여정 있으면 마지막 여정, 없으면 WF-09');
}
return ids;

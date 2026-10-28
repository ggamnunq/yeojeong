// Row A (1/2): WF-01 ~ WF-04  인증  (정보 다이어트 v2)
const Y0 = BAND_Y[0], FY = Y0 + FRAME_DY, NY = FY + SH + 24, GX = 120;
clean(['01', '02', '03', '04'], ['RowTitle · A']);
const ids = {};
await rowTitle('A', GX, Y0, 'A. 인증 · 온보딩',
  '스플래시 → 카카오 로그인 → 닉네임 → 약관 → 토스 연결 → 계좌·카드 선택 → 완료 → 여정 화면', 3900);

async function stepBar(p, n, total = 3) {
  const r = box({ parent: p, dir: 'H', w: 'fill', gap: 6, name: 'StepBar' });
  for (let i = 1; i <= total; i++) box({ parent: r, dir: 'N', w: 'fill', h: 4, radius: 2, fill: i <= n ? C.ink : C.box, name: 'step' });
  return r;
}

// WF-01 스플래시
{
  const f = await screen('01', '스플래시', fx(GX, 0), FY);
  const b = body(f, { align: 'CENTER', justify: 'CENTER', gap: 14, pad: [0, 20, 80, 20] });
  await placeholder(b, '로고', { w: 96, h: 96, radius: 24 });
  await T('여정', { parent: b, size: 34, weight: 'Black', ls: -1 });
  ids['WF-01'] = f.id;
  await note(fx(GX, 0), NY, '01', '스플래시', '로고만 · 로그인 상태면 마지막 여정');
}
// WF-02 로그인
{
  const f = await screen('02', '로그인', fx(GX, 1), FY);
  const b = body(f, { align: 'CENTER', gap: 12, pad: [0, 20, 32, 20] });
  grower(b);
  await placeholder(b, '로고', { w: 80, h: 80, radius: 20 });
  await T('여정', { parent: b, size: 30, weight: 'Black', ls: -1 });
  await T('여행 결제는 각자, 정산은 한 번에', { parent: b, size: 15, color: C.sub });
  grower(b);
  await btn('카카오 로그인', b, { kind: 'gray', h: 54 });
  ids['WF-02'] = f.id;
  await note(fx(GX, 1), NY, '02', '로그인', '카카오 버튼 하나');
}
// WF-03 닉네임
{
  const f = await screen('03', '닉네임 입력', fx(GX, 2), FY);
  await subHeader(f, '', { right: '1/3', noBorder: true });
  const b = body(f, { gap: 24, pad: [4, 20, 24, 20] });
  await stepBar(b, 1);
  await T('닉네임을 알려주세요', { parent: b, size: 24, weight: 'Bold', lh: 34, w: 'fill' });
  await input(b, { value: '준용', focus: true, iconR: 'multiply', helper: '중복 가능', count: '2/10' });
  grower(b);
  await btn('다음', b);
  ids['WF-03'] = f.id;
  await note(fx(GX, 2), NY, '03', '닉네임 입력', '카카오 이름 미리 채움 · 중복 허용');
}
// WF-04 약관
{
  const f = await screen('04', '약관 동의', fx(GX, 3), FY);
  await subHeader(f, '', { right: '2/3', noBorder: true });
  const b = body(f, { gap: 24, pad: [4, 20, 24, 20] });
  await stepBar(b, 2);
  await T('약관에 동의해 주세요', { parent: b, size: 24, weight: 'Bold', lh: 34, w: 'fill' });
  const all = card(b, { dir: 'H', fill: C.soft, noStroke: true, align: 'CENTER', gap: 12, pad: [16, 16, 16, 16] });
  checkbox(all, true, 24);
  await T('전체 동의', { parent: all, size: 17, weight: 'Bold', w: 'fill' });
  const list = box({ parent: b, dir: 'V', w: 'fill', gap: 4, pad: [0, 4, 0, 4] });
  const items = [['필수', '서비스 이용약관'], ['필수', '개인정보 수집·이용'], ['필수', '금융거래정보 조회'], ['선택', '마케팅 정보 수신']];
  for (const [k, t] of items) {
    const r = box({ parent: list, dir: 'H', w: 'fill', h: 48, gap: 10, align: 'CENTER' });
    icon('checkmark', { parent: r, size: 20, dark: true });
    await T(`[${k}] ${t}`, { parent: r, size: 15, w: 'fill', color: k === '필수' ? C.ink : C.sub });
    icon('forward', { parent: r, size: 16 });
  }
  grower(b);
  await btn('다음', b);
  ids['WF-04'] = f.id;
  await note(fx(GX, 3), NY, '04', '약관 동의', '금융거래정보 조회는 필수');
}
return ids;

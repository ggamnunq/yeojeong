// Row I: WF-31 ~ WF-39  분담 변경 (공동 ↔ 개인, 부담 인원 변경, 읽기 전용, 종료 후 잠금)  — v3
// 분기 시나리오(11.13 금 21:00). F 정산 수치는 "변경 없음" 기본 시나리오 기준.
clean(['31', '32', '33', '34', '35', '36', '37', '38', '39']);
const ids = {};
const ALL4 = ['준용', '민지', '태현', '수빈'];

async function baseList(id, title, o = {}) {
  const f = await screen(id, title, 0, 0, { time: o.time || '21:00' });
  await appHeader(f);
  const b = body(f, { gap: 12, pad: [16, 20, 0, 20] });
  if (o.rows) { if (o.top !== false) await payTop(b, '리스트'); const l = box({ parent: b, dir: 'V', w: 'fill', gap: 0, name: 'PayList' }); for (const [h, rs] of o.rows) { await dateHeader(l, h); for (const d of rs) await payRow(l, d); } }
  else await payListContent(b, { noTop: o.top === false });
  await bottomNav(f, 'pay', { ended: o.ended });
  return f;
}
// 결제 상세 시트 공통
async function detailSheet(f, d) {
  dim(f, 0);
  const s = sheet(f, { gap: 18 });
  const hr = box({ parent: s, dir: 'H', w: 'fill', align: 'CENTER', gap: 6 });
  for (const [l, k, ic] of d.tags || []) await tag(l, hr, k, { icon: ic });
  box({ parent: hr, dir: 'N', w: 'fill', h: 10, name: 'flex' });
  iconBtn('multiply', hr, { size: 18, box: 28 });
  const tt = box({ parent: s, dir: 'V', w: 'fill', gap: 4 });
  await T(d.name, { parent: tt, size: 20, weight: 'Bold', w: 'fill' });
  await T(d.sub, { parent: tt, size: 13, color: C.sub });
  const am = box({ parent: s, dir: 'H', w: 'fill', gap: 8, align: 'MAX' });
  await T(d.krw, { parent: am, size: 30, weight: 'Black', lh: 38 });
  await T(d.fx, { parent: am, size: 14, color: C.sub, lh: 26 });
  if (d.mode === 'edit') {
    await segmented(s, ['개인', '공동'], d.seg, { h: 44, size: 15 });
    if (d.seg === '공동') {
      const pw = box({ parent: s, dir: 'V', w: 'fill', gap: 10, name: '부담 인원' });
      await T('부담 인원', { parent: pw, size: 14, weight: 'Bold' });
      const tg = box({ parent: pw, dir: 'H', w: 'fill', gap: 0, name: 'AvatarToggles' });
      for (const n of ['나', '민지', '태현', '수빈']) await avatarToggle(tg, n, d.on.includes(n));
      const sum = box({ parent: s, dir: 'H', w: 'fill', align: 'CENTER', gap: 8 });
      await T('인당', { parent: sum, size: 14, color: C.sub, w: 'fill' });
      if (d.remainder) await tag(d.remainder, sum, 'soft');
      await T(d.per, { parent: sum, size: 18, weight: 'Bold' });
    }
    await btn(d.cta, s);
  } else {
    const info = box({ parent: s, dir: 'V', w: 'fill', gap: 12, name: 'ReadOnly' });
    const r1 = box({ parent: info, dir: 'H', w: 'fill', gap: 8, align: 'CENTER' });
    await T('결제', { parent: r1, size: 14, color: C.sub, w: 64 });
    await avatar(d.payer, r1, 24);
    await T(d.payer, { parent: r1, size: 15, weight: 'Medium', w: 'fill' });
    const r2 = box({ parent: info, dir: 'H', w: 'fill', gap: 8, align: 'CENTER' });
    await T('부담', { parent: r2, size: 14, color: C.sub, w: 64 });
    await stack(r2, d.who, { size: 24, overlap: -7 });
    await T(d.who.length + '명', { parent: r2, size: 15, weight: 'Medium', w: 'fill' });
    const r3 = box({ parent: info, dir: 'H', w: 'fill', gap: 8, align: 'CENTER' });
    await T('인당', { parent: r3, size: 14, color: C.sub, w: 64 });
    await T(d.per, { parent: r3, size: 18, weight: 'Bold', w: 'fill' });
    if (d.mode === 'locked') {
      const lk = box({ parent: s, dir: 'H', w: 'fill', h: 52, radius: 12, fill: C.soft, gap: 6, align: 'CENTER', justify: 'CENTER', name: 'Locked' });
      icon('lock', { parent: lk, size: 18 });
      await T('변경 불가', { parent: lk, size: 15, weight: 'Bold', color: C.sub });
    } else spacer(s, 4);
  }
  placeBottom(f, s);
  return s;
}

// WF-31 공동 → 개인 (선택)
{
  const f = await baseList('31', '공동→개인 · 상세에서 [개인] 선택');
  await detailSheet(f, { name: '이치란 라멘 도톤보리점', sub: '11.12 13:05 · 체크카드 **1934', krw: '₩36,400', fx: '¥3,960', mode: 'edit', seg: '개인', cta: '개인으로 변경' });
  ids['WF-31'] = f.id;
  await note(0, 0, '31', '공동→개인 · [개인] 선택', '결제자 본인만 바꿀 수 있음');
}
// WF-32 확인 다이얼로그
{
  const f = await baseList('32', '공동→개인 · 확인 다이얼로그');
  dim(f, 0);
  const d = dialog(f, { gap: 8 });
  await T('개인 결제로 바꿀까요?', { parent: d, size: 20, weight: 'Bold', w: 'fill' });
  await T('다른 멤버의 내역과 정산에서 빠져요', { parent: d, size: 14, color: C.sub, w: 'fill' });
  spacer(d, 12);
  const br = box({ parent: d, dir: 'H', w: 'fill', gap: 8 });
  await btn('취소', br, { kind: 'secondary', h: 48, size: 15 });
  await btn('바꾸기', br, { h: 48, size: 15 });
  placeCenter(f, d);
  ids['WF-32'] = f.id;
  await note(0, 0, '32', '공동→개인 · 확인', '이미 공개된 건이라 한 번 확인');
}
// WF-33 변경 후 · 내 리스트 (Day 1까지 스크롤)
{
  const D1 = [
    { time: '19:30', name: '쿠시카츠 다루마 신세카이점', payer: '태현', krw: '₩117,660', fx: '¥12,800', tag: 'shared', who: ALL4 },
    { time: '17:40', name: '돈키호테 도톤보리점', payer: '나', krw: '₩79,420', fx: '¥8,640', tag: 'personal', tagLabel: '개인' },
    { time: '13:05', name: '이치란 라멘 도톤보리점', payer: '나', krw: '₩36,400', fx: '¥3,960', tag: 'personal', tagLabel: '개인' },
    { time: '11:20', name: '난카이 라피트 간사이공항역', payer: '민지', krw: '₩54,780', fx: '¥5,960', tag: 'shared', who: ALL4 },
  ];
  const f = await baseList('33', '공동→개인 · 변경 후 내 리스트', { top: false, rows: [['11.12 (목) · Day 1', D1]] });
  await toast(f, '개인 결제로 바꿨어요', SH - 78 - 64);
  ids['WF-33'] = f.id;
  await note(0, 0, '33', '변경 후 · 내 화면', '이치란은 나에게만 개인 태그로 남음');
}
// WF-34 변경 후 · 민지 시점 리스트
{
  ME = '민지';
  const rows = [
    ['11.13 (금) · Day 2', [
      { time: '18:20', name: '551 호라이 난바본점', payer: '준용', krw: '₩25,740', fx: '¥2,800', tag: 'shared', who: ['준용', '민지', '태현'], flags: ['변경됨'] },
      { time: '16:40', name: '우메다 스카이빌딩 공중정원', payer: '나', krw: '₩73,540', fx: '¥8,000', tag: 'shared', who: ALL4 },
      { time: '14:10', name: 'MK택시', payer: '준용', krw: '₩26,290', fx: '¥2,860', tag: 'shared', who: ALL4, flags: ['변경됨'] },
      { time: '10:30', name: '오사카성 천수각', payer: '수빈', krw: '₩44,120', fx: '¥4,800', tag: 'shared', who: ALL4 },
    ]],
    ['11.12 (목) · Day 1', [
      { time: '19:30', name: '쿠시카츠 다루마 신세카이점', payer: '태현', krw: '₩117,660', fx: '¥12,800', tag: 'shared', who: ALL4 },
      { time: '11:20', name: '난카이 라피트 간사이공항역', payer: '나', krw: '₩54,780', fx: '¥5,960', tag: 'shared', who: ALL4 },
    ]],
  ];
  const f = await screen('34', '변경 후 · 민지 시점 리스트', 0, 0, { time: '21:00' });
  await appHeader(f);
  const b = body(f, { gap: 12, pad: [16, 20, 0, 20] });
  const ctl = box({ parent: b, dir: 'H', w: 'fill', align: 'CENTER', name: 'Controls' });
  await segmented(ctl, ['리스트', '타임라인'], '리스트', { w: 'fill', h: 36, size: 13 });
  const l = box({ parent: b, dir: 'V', w: 'fill', gap: 0, name: 'PayList' });
  for (const [h, rs] of rows) { await dateHeader(l, h); for (const d of rs) await payRow(l, d); }
  await bottomNav(f, 'pay');
  ME = '준용';
  ids['WF-34'] = f.id;
  await note(0, 0, '34', '변경 후 · 민지 화면', '이치란 사라짐 · 바뀐 공동 결제엔 "변경됨"');
}
// WF-35 개인 → 공동
{
  const f = await baseList('35', '개인→공동 · 부담 인원 프사 선택');
  await detailSheet(f, { tags: [['개인', 'personal', 'lock']], name: '돈키호테 도톤보리점', sub: '11.12 17:40 · 체크카드 **1934', krw: '₩79,420', fx: '¥8,640', mode: 'edit', seg: '공동', on: ['나', '민지', '태현', '수빈'], per: '₩19,855', cta: '공동으로 변경' });
  ids['WF-35'] = f.id;
  await note(0, 0, '35', '개인→공동', '프사 토글로 부담 인원 → 확정 = 공개');
}
// WF-36 부담 인원 변경 · 전원 → 일부
{
  const f = await baseList('36', '부담 인원 변경 · 전원→일부');
  await detailSheet(f, { name: '551 호라이 난바본점', sub: '11.13 18:20 · 신한카드 **1102', krw: '₩25,740', fx: '¥2,800', mode: 'edit', seg: '공동', on: ['나', '민지', '태현'], per: '₩8,580', cta: '저장' });
  ids['WF-36'] = f.id;
  await note(0, 0, '36', '전원 → 일부', '수빈 해제 → 인당 ₩6,435 → ₩8,580');
}
// WF-37 부담 인원 변경 · 일부 → 전원 (+ 원 단위 나머지)
{
  const f = await baseList('37', '부담 인원 변경 · 일부→전원');
  await detailSheet(f, { name: 'MK택시', sub: '11.13 14:10 · 체크카드 **1934', krw: '₩26,290', fx: '¥2,860', mode: 'edit', seg: '공동', on: ['나', '민지', '태현', '수빈'], per: '₩6,572', remainder: '결제자 +2원', cta: '저장' });
  ids['WF-37'] = f.id;
  await note(0, 0, '37', '일부 → 전원', '2명 → 4명 · 나머지 2원은 결제자');
}
// WF-38 결제자 아닌 멤버 · 읽기 전용 (민지가 MK택시 열람)
{
  ME = '민지';
  const f = await screen('38', '읽기 전용 · 결제자 아닌 멤버', 0, 0, { time: '21:00' });
  await appHeader(f);
  const b = body(f, { gap: 12, pad: [16, 20, 0, 20] });
  const ctl = box({ parent: b, dir: 'H', w: 'fill', align: 'CENTER', name: 'Controls' });
  await segmented(ctl, ['리스트', '타임라인'], '리스트', { w: 'fill', h: 36, size: 13 });
  const l = box({ parent: b, dir: 'V', w: 'fill', gap: 0, name: 'PayList' });
  await dateHeader(l, '11.13 (금) · Day 2');
  await payRow(l, { time: '18:20', name: '551 호라이 난바본점', payer: '준용', krw: '₩25,740', fx: '¥2,800', tag: 'shared', who: ['준용', '민지', '태현'], flags: ['변경됨'] });
  await payRow(l, { time: '16:40', name: '우메다 스카이빌딩 공중정원', payer: '나', krw: '₩73,540', fx: '¥8,000', tag: 'shared', who: ALL4 });
  await payRow(l, { time: '14:10', name: 'MK택시', payer: '준용', krw: '₩26,290', fx: '¥2,860', tag: 'shared', who: ALL4, flags: ['변경됨'] });
  await bottomNav(f, 'pay');
  await detailSheet(f, { tags: [['읽기 전용', 'soft'], ['변경됨', 'soft']], name: 'MK택시', sub: '11.13 14:10', krw: '₩26,290', fx: '¥2,860', mode: 'readonly', payer: '준용', who: ALL4, per: '₩6,572' });
  ME = '준용';
  ids['WF-38'] = f.id;
  await note(0, 0, '38', '읽기 전용', '결제자 아님 → 변경 버튼 없음');
}
// WF-39 여정 종료 후 · 잠금
{
  const D3 = [
    { time: '19:10', name: '야키니쿠 와규 이치 난바점', payer: '나', krw: '₩227,960', fx: '¥24,800', tag: 'shared', who: ALL4 },
    { time: '15:00', name: '아베노 하루카스 300', payer: '태현', krw: '₩73,540', fx: '¥8,000', tag: 'shared', who: ALL4 },
    { time: '12:30', name: '쿠로몬 시장', payer: '수빈', krw: '₩88,240', fx: '¥9,600', tag: 'shared', who: ALL4 },
  ];
  const f = await baseList('39', '종료 후 · 변경 잠금', { time: '10:05', top: false, ended: true, rows: [['11.14 (토) · Day 3', D3]] });
  await detailSheet(f, { tags: [['정산 확정', 'soft', 'lock']], name: '야키니쿠 와규 이치 난바점', sub: '11.14 19:10 · 신한카드 **1102', krw: '₩227,960', fx: '¥24,800', mode: 'locked', payer: '준용', who: ALL4, per: '₩56,990' });
  ids['WF-39'] = f.id;
  await note(0, 0, '39', '종료 후 잠금', '정산 확정 → 결제자도 변경 불가');
}
return ids;

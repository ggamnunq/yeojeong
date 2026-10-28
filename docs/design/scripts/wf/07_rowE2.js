// Row E (2/3): WF-21 결제 상세(공동·부담 인원) / WF-22 현황  (정보 다이어트 v2)
const Y0 = BAND_Y[2], FY = Y0 + FRAME_DY, NY = FY + SH + 24, GX = 1300;
clean(['21', '22']);
const ids = {};
async function baseList(id, title, x) {
  const f = await screen(id, title, x, FY, { time: '18:34' });
  await appHeader(f);
  const b = body(f, { gap: 12, pad: [16, 20, 0, 20] });
  await payListContent(b);
  await bottomNav(f, 'pay');
  return f;
}
// WF-21 공동 · 부담 인원
{
  const f = await baseList('21', '결제 상세 · 공동 + 부담 인원 (바텀시트)', fx(GX, 3));
  dim(f, 0);
  const s = sheet(f, { gap: 18 });
  const hr = box({ parent: s, dir: 'H', w: 'fill', align: 'CENTER', gap: 6 });
  box({ parent: hr, dir: 'N', w: 'fill', h: 10, name: 'flex' });
  iconBtn('multiply', hr, { size: 18, box: 28 });
  const tt = box({ parent: s, dir: 'V', w: 'fill', gap: 4 });
  await T('551 호라이 난바본점', { parent: tt, size: 20, weight: 'Bold', w: 'fill' });
  const mt = box({ parent: tt, dir: 'H', gap: 6, align: 'CENTER', name: 'meta' });
  await T('11.13 18:20 · 신한카드 **1102', { parent: mt, size: 13, color: C.sub });
  await tag('미확정', mt, 'pending');
  const am = box({ parent: s, dir: 'H', w: 'fill', gap: 8, align: 'MAX' });
  await T('₩25,740', { parent: am, size: 30, weight: 'Black', lh: 38 });
  await T('¥2,800', { parent: am, size: 14, color: C.sub, lh: 26 });
  await segmented(s, ['개인', '공동'], '공동', { h: 44, size: 15 });
  const pw = box({ parent: s, dir: 'V', w: 'fill', gap: 10, name: '부담 인원' });
  await T('부담 인원', { parent: pw, size: 14, weight: 'Bold' });
  const tg = box({ parent: pw, dir: 'H', w: 'fill', gap: 0, name: 'AvatarToggles' });
  for (const n of ['나', '민지', '태현', '수빈']) await avatarToggle(tg, n, true);
  const sum = box({ parent: s, dir: 'H', w: 'fill', justify: 'SPACE_BETWEEN', align: 'CENTER' });
  await T('인당', { parent: sum, size: 14, color: C.sub });
  await T('₩6,435', { parent: sum, size: 18, weight: 'Bold' });
  await btn('공동으로 확정', s);
  placeBottom(f, s);
  ids['WF-21'] = f.id;
  await note(fx(GX, 3), NY, '21', '결제 상세 · 공동', '프사 토글로 부담 인원 → 공동 확정');
}
// WF-22 현황
{
  const f = await screen('22', '현황 (통계·내가 낼 금액)', fx(GX, 4), FY, { time: '18:34' });
  await appHeader(f);
  const b = body(f, { gap: 12, pad: [16, 20, 16, 20] });
  const hero = card(b, { gap: 4, stroke: C.ink, radius: 14, pad: [18, 16, 18, 16], name: 'Card/내가 낼 금액' });
  hero.strokeWeight = 1.5;
  await T('내가 낼 금액', { parent: hero, size: 14, weight: 'Medium', color: C.sub });
  await T('₩32,080', { parent: hero, size: 32, weight: 'Black', lh: 40 });
  const bc = card(b, { gap: 10, pad: [16, 16, 16, 16], name: 'Card/예산' });
  await T('공동 지출', { parent: bc, size: 14, weight: 'Medium', color: C.sub });
  const b2 = box({ parent: bc, dir: 'H', w: 'fill', gap: 6, align: 'MAX' });
  await T('₩352,790', { parent: b2, size: 22, weight: 'Bold', lh: 30 });
  await T('/ ₩1,200,000', { parent: b2, size: 14, color: C.sub, lh: 24 });
  bar(bc, 318, 0.294, { h: 10 });
  const rc = card(b, { gap: 10, pad: [16, 16, 16, 16], name: 'Card/공동개인' });
  await T('내 지출 ₩174,190', { parent: rc, size: 14, weight: 'Bold' });
  bar(rc, 318, 0.544, { h: 10 });
  const lg = box({ parent: rc, dir: 'H', w: 'fill', gap: 16 });
  for (const [c, l] of [[C.ink, '공동 54%'], [C.box, '개인 46%']]) {
    const it = box({ parent: lg, dir: 'H', gap: 6, align: 'CENTER' });
    box({ parent: it, dir: 'N', w: 10, h: 10, radius: 2, fill: c, stroke: c === C.box ? C.line : undefined, name: 'swatch' });
    await T(l, { parent: it, size: 12, color: C.sub });
  }
  const pc = card(b, { gap: 4, pad: [16, 16, 10, 16], name: 'Card/인당 부담' });
  await T('인당 부담', { parent: pc, size: 14, weight: 'Bold' });
  for (const [n, amt, me] of [['준용', '₩94,770', true], ['민지', '₩94,770'], ['태현', '₩81,625'], ['수빈', '₩81,625']]) {
    const r = box({ parent: pc, dir: 'H', w: 'fill', h: 34, gap: 10, align: 'CENTER' });
    await avatar(n, r, 24);
    await T(me ? n + ' (나)' : n, { parent: r, size: 14, weight: me ? 'Bold' : 'Medium', w: 'fill' });
    await T(amt, { parent: r, size: 14, weight: 'Bold' });
  }
  await bottomNav(f, 'stat');
  ids['WF-22'] = f.id;
  await note(fx(GX, 4), NY, '22', '현황', '내가 낼 금액이 먼저');
}
return ids;

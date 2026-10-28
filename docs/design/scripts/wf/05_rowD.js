// Row D: WF-16 ~ WF-17  여정 시작 전  (정보 다이어트 v2)
const Y0 = BAND_Y[2], FY = Y0 + FRAME_DY, NY = FY + SH + 24, GX = 120;
clean(['16', '17'], ['RowTitle · D']);
const ids = {};
await rowTitle('D', GX, Y0, 'D. 여정 시작 전', '여정 정보 + [여정 시작] → 확인 → E', 880);

async function preStart(id, title, x) {
  const f = await screen(id, title, x, FY, { time: '14:20' });
  await appHeader(f);
  const b = body(f, { gap: 16, pad: [16, 20, 16, 20] });
  await tripInfoCard(b, { status: '시작 전 · D-15', edit: true });
  await T('참여자 4명', { parent: b, size: 15, weight: 'Bold' });
  const av = box({ parent: b, dir: 'H', w: 'fill', gap: 0, name: 'AvatarRow' });
  for (const [n, lead] of [['준용', true], ['민지'], ['태현'], ['수빈']]) {
    const c = box({ parent: av, dir: 'V', w: 'fill', gap: 6, align: 'CENTER' });
    await avatar(n, c, 48);
    const l = box({ parent: c, dir: 'H', gap: 2, align: 'CENTER' });
    if (lead) icon('crown', { parent: l, size: 14, dark: true });
    await T(n, { parent: l, size: 13, weight: 'Medium' });
  }
  await inviteStrip(b);
  grower(b);
  const bt = box({ parent: b, dir: 'V', w: 'fill', gap: 2 });
  await btn('여정 시작', bt);
  await btn('그룹 삭제', bt, { kind: 'ghost', h: 36, size: 13, underline: true });
  await bottomNav(f, 'info', { locked: true });
  return f;
}
// WF-16
{
  const f = await preStart('16', '여정 시작 전 (그룹장)', fx(GX, 0));
  ids['WF-16'] = f.id;
  await note(fx(GX, 0), NY, '16', '여정 시작 전 (그룹장)', '시작·삭제는 그룹장만');
}
// WF-17 시작 확인 다이얼로그
{
  const f = await preStart('17', '여정 시작 확인 (다이얼로그)', fx(GX, 1));
  dim(f, 0);
  const d = dialog(f, { gap: 8 });
  await T('여정을 시작할까요?', { parent: d, size: 20, weight: 'Bold', w: 'fill' });
  await T('시작 후엔 그룹을 삭제할 수 없어요', { parent: d, size: 14, color: C.sub, w: 'fill' });
  spacer(d, 12);
  const br = box({ parent: d, dir: 'H', w: 'fill', gap: 8 });
  await btn('취소', br, { kind: 'secondary', h: 48, size: 15 });
  await btn('시작하기', br, { h: 48, size: 15 });
  placeCenter(f, d);
  ids['WF-17'] = f.id;
  await note(fx(GX, 1), NY, '17', '여정 시작 확인', '제목 + 한 줄 + 버튼 2개');
}
return ids;

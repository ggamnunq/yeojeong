// Row E (3/3): WF-23 여정 정보 탭 / WF-24 수동 종료 확인  (정보 다이어트 v2)
const Y0 = BAND_Y[2], FY = Y0 + FRAME_DY, NY = FY + SH + 24, GX = 1300;
clean(['23', '24']);
const ids = {};
async function infoTab(id, title, x) {
  const f = await screen(id, title, x, FY, { time: '18:34' });
  await appHeader(f);
  const b = body(f, { gap: 14, pad: [16, 20, 12, 20] });
  await tripInfoCard(b, { status: '진행 중', edit: true });
  const mh = box({ parent: b, dir: 'H', w: 'fill', align: 'CENTER', gap: 4, pad: [6, 0, 0, 0] });
  await T('그룹원 4명', { parent: mh, size: 15, weight: 'Bold', w: 'fill' });
  icon('add-user-male', { parent: mh, size: 18, dark: true });
  await T('추가', { parent: mh, size: 14, weight: 'Medium' });
  await memberRows(b, { rowH: 46 });
  await inviteStrip(b);
  grower(b);
  await btn('여정 종료하기', b, { kind: 'ghost', h: 36, size: 14, underline: true });
  await bottomNav(f, 'info');
  return f;
}
// WF-23
{
  const f = await infoTab('23', '여정 정보 탭 (진행 중)', fx(GX, 5));
  ids['WF-23'] = f.id;
  await note(fx(GX, 5), NY, '23', '여정 정보 탭', '그룹원 +추가 = 초대코드 공유');
}
// WF-24 수동 종료 확인
{
  const f = await infoTab('24', '수동 종료 확인 (다이얼로그)', fx(GX, 6));
  dim(f, 0);
  const d = dialog(f, { gap: 8 });
  await T('여정을 종료할까요?', { parent: d, size: 20, weight: 'Bold', w: 'fill' });
  await T('미확정 2건은 개인으로 처리돼요', { parent: d, size: 14, color: C.sub, w: 'fill' });
  await T('11.15 23:59 자동 종료', { parent: d, size: 12, color: C.sub, w: 'fill' });
  spacer(d, 12);
  const br = box({ parent: d, dir: 'H', w: 'fill', gap: 8 });
  await btn('취소', br, { kind: 'secondary', h: 48, size: 15 });
  await btn('종료하기', br, { h: 48, size: 15 });
  placeCenter(f, d);
  ids['WF-24'] = f.id;
  await note(fx(GX, 6), NY, '24', '수동 종료 확인', '미확정 건수 표시 → 개인 처리');
}
return ids;

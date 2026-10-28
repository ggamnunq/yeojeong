// Row B: WF-09 ~ WF-12  여정 없음 / 생성 / 참여  (정보 다이어트 v2)
const Y0 = BAND_Y[1], FY = Y0 + FRAME_DY, NY = FY + SH + 24, GX = 120;
clean(['09', '10', '11', '12'], ['RowTitle · B']);
const ids = {};
await rowTitle('B', GX, Y0, 'B. 여정 없음 · 생성 · 참여',
  '빈 상태 → 생성 → 초대코드 공유 → WF-16  /  초대코드 입력 → 바로 참여', 1860);

// WF-09 여정 없음
{
  const f = await screen('09', '여정 없음 (빈 상태)', fx(GX, 0), FY);
  await appHeader(f, { noGroup: true });
  const b = body(f, { align: 'CENTER', gap: 16, pad: [0, 24, 28, 24] });
  grower(b);
  await placeholder(b, '빈 상태 일러스트', { w: 180, h: 140, radius: 20 });
  await T('참여한 여정이 없어요', { parent: b, size: 20, weight: 'Bold', align: 'CENTER', w: 'fill' });
  grower(b);
  const bt = box({ parent: b, dir: 'V', w: 'fill', gap: 10 });
  await btn('여정 만들기', bt);
  await btn('초대코드로 참여', bt, { kind: 'secondary' });
  ids['WF-09'] = f.id;
  await note(fx(GX, 0), NY, '09', '여정 없음 (빈 상태)', '생성 / 참여 버튼 2개');
}
// WF-10 여정 생성
{
  const f = await screen('10', '여정 생성', fx(GX, 1), FY);
  await subHeader(f, '새 여정 만들기');
  const b = body(f, { gap: 20, pad: [20, 20, 20, 20] });
  await input(b, { label: '그룹명', value: '오사카 3박 4일' });
  await input(b, { label: '여행 장소', value: '일본 오사카', iconL: 'marker' });
  const pw = box({ parent: b, dir: 'V', w: 'fill', gap: 6, name: 'Input/기간' });
  await T('기간', { parent: pw, size: 13, weight: 'Medium', color: C.sub });
  const pr = box({ parent: pw, dir: 'H', w: 'fill', gap: 8, align: 'CENTER' });
  for (const [i, v] of [['0', '2026.11.12 (목)'], ['1', '2026.11.15 (일)']]) {
    const fl = box({ parent: pr, dir: 'H', w: 'fill', h: 52, radius: 10, stroke: C.line, pad: [0, 10, 0, 12], align: 'CENTER', gap: 6, name: 'date' + i });
    icon('calendar', { parent: fl, size: 18 });
    await T(v, { parent: fl, size: 14, w: 'fill' });
    if (i === '0') await T('~', { parent: pr, size: 15, color: C.sub });
  }
  await input(b, { label: '예산', value: '1,200,000', suffix: '원' });
  grower(b);
  await btn('여정 만들기', b);
  ids['WF-10'] = f.id;
  await note(fx(GX, 1), NY, '10', '여정 생성', '노션 4항목 · 통화는 장소로 자동');
}
// WF-11 생성 완료 · 초대코드
{
  const f = await screen('11', '생성 완료 · 초대코드', fx(GX, 2), FY);
  await subHeader(f, '', { close: true, noBorder: true });
  const b = body(f, { gap: 20, pad: [12, 20, 20, 20], align: 'CENTER' });
  grower(b);
  icon('ok', { parent: b, size: 52, dark: true });
  await T('여정을 만들었어요', { parent: b, size: 22, weight: 'Bold', align: 'CENTER', w: 'fill' });
  const ic = card(b, { gap: 12, fill: C.soft, noStroke: true, align: 'CENTER', pad: [20, 16, 16, 16] });
  await T('초대코드', { parent: ic, size: 13, color: C.sub });
  await T('K7M-2QX', { parent: ic, size: 34, weight: 'Black', ls: 4, lh: 42 });
  const br = box({ parent: ic, dir: 'H', w: 'fill', gap: 8 });
  await btn('복사', br, { kind: 'secondary', icon: 'copy', h: 44, size: 14 });
  await btn('공유', br, { kind: 'secondary', icon: 'share', h: 44, size: 14 });
  grower(b);
  await btn('여정으로 이동', b);
  ids['WF-11'] = f.id;
  await note(fx(GX, 2), NY, '11', '생성 완료 · 초대코드', '초대코드 복사·공유 → WF-16');
}
// WF-12 초대코드로 참여
{
  const f = await screen('12', '초대코드로 참여', fx(GX, 3), FY);
  await subHeader(f, '초대코드로 참여');
  const b = body(f, { gap: 20, pad: [24, 20, 20, 20] });
  await input(b, { value: 'K7M-2QX', focus: true, iconR: 'multiply', valueWeight: 'Bold', ls: 2 });
  const pc = card(b, { gap: 10, stroke: C.ink, sw: 1 });
  await T('오사카 3박 4일', { parent: pc, size: 18, weight: 'Bold' });
  await T('11.12 ~ 11.15 · 일본 오사카', { parent: pc, size: 14, color: C.sub });
  const mr = box({ parent: pc, dir: 'H', w: 'fill', gap: 10, align: 'CENTER' });
  ME = '수빈'; // 참여하는 사람 시점
  await stack(mr, ['준용', '민지', '태현'], { size: 28, overlap: -8 });
  ME = '준용';
  await T('3명 참여 중', { parent: mr, size: 14, weight: 'Medium', w: 'fill' });
  grower(b);
  await btn('참여하기', b);
  ids['WF-12'] = f.id;
  await note(fx(GX, 3), NY, '12', '초대코드로 참여', '미리보기 후 승인 없이 참여');
}
return ids;

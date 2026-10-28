// Row J: WF-40 ~ WF-45 엣지케이스 + "엣지케이스 규칙표"  — v3
clean(['40', '41', '42', '43', '44', '45']);
const ids = {};
const ALL4 = ['준용', '민지', '태현', '수빈'];

// 환불 묶음(원 결제 + 취소 = 순액)
async function refundGroup(p) {
  const g = box({ parent: p, dir: 'V', w: 'fill', gap: 0, radius: 12, fill: C.soft, pad: [2, 10, 8, 10], name: 'RefundGroup/오사카 주유패스' });
  await payRow(g, { time: '09:40', name: '오사카 주유패스 (4매)', payer: '태현', krw: '₩121,330', fx: '¥13,200', tag: 'shared', who: ALL4 });
  const rr = box({ parent: g, dir: 'H', w: 'fill', gap: 8, align: 'CENTER', pad: [0, 0, 6, 48], name: 'Refund' });
  await tag('취소', rr, 'personal');
  await T('12:15', { parent: rr, size: 12, color: C.sub, w: 'fill' });
  await T('−₩121,330', { parent: rr, size: 14, weight: 'Bold' });
  line(g);
  const nt = box({ parent: g, dir: 'H', w: 'fill', pad: [6, 0, 0, 48], name: 'Net' });
  await T('합계', { parent: nt, size: 13, color: C.sub, w: 'fill' });
  await T('₩0', { parent: nt, size: 15, weight: 'Black' });
  return g;
}
async function listWithEdges(f) {
  await appHeader(f);
  const b = body(f, { gap: 12, pad: [16, 20, 0, 20] });
  await payTop(b, '리스트');
  const l = box({ parent: b, dir: 'V', w: 'fill', gap: 0, name: 'PayList' });
  await dateHeader(l, '11.13 (금) · Day 2');
  await payRow(l, { time: '14:10', name: 'MK택시', payer: '나', krw: '₩26,290', fx: '¥2,860', tag: 'shared', who: ['준용', '민지'] });
  await payRow(l, { time: '10:30', name: '오사카성 천수각', payer: '수빈', krw: '₩44,120', fx: '¥4,800', tag: 'shared', who: ALL4, flags: ['중복 의심'] });
  await payRow(l, { time: '10:30', name: '오사카성 천수각', payer: '민지', krw: '₩44,120', fx: '¥4,800', tag: 'shared', who: ALL4, flags: ['중복 의심'] });
  spacer(l, 4);
  await refundGroup(l);
  await payRow(l, { time: '08:50', name: '패밀리마트 난바역점', payer: '나', krw: '₩11,770', fx: '¥1,280', tag: 'pending', tagLabel: '미확정' });
  await bottomNav(f, 'pay');
}
// WF-40 결제내역 · 환불 묶음 + 중복 의심
{
  const f = await screen('40', '결제내역 · 환불 묶음 + 중복 의심', 0, 0, { time: '18:34' });
  await listWithEdges(f);
  ids['WF-40'] = f.id;
  await note(0, 0, '40', '환불 묶음 · 중복 의심', '취소는 원 결제에 묶어 상계, 중복은 표시만');
}
// WF-41 환불 묶음 상세
{
  const f = await screen('41', '환불 묶음 상세 (바텀시트)', 0, 0, { time: '18:34' });
  await listWithEdges(f);
  dim(f, 0);
  const s = sheet(f, { gap: 16 });
  const hr = box({ parent: s, dir: 'H', w: 'fill', align: 'CENTER', gap: 6 });
  await tag('취소 포함', hr, 'soft');
  box({ parent: hr, dir: 'N', w: 'fill', h: 10, name: 'flex' });
  iconBtn('multiply', hr, { size: 18, box: 28 });
  const tt = box({ parent: s, dir: 'V', w: 'fill', gap: 4 });
  await T('오사카 주유패스 (4매)', { parent: tt, size: 20, weight: 'Bold', w: 'fill' });
  await T('11.13 · 태현', { parent: tt, size: 13, color: C.sub });
  const lc = card(s, { gap: 10, radius: 12, pad: [14, 16, 14, 16] });
  for (const [l, v, bold] of [['09:40 결제', '₩121,330'], ['12:15 취소', '−₩121,330'], ['합계', '₩0', true]]) {
    const r = box({ parent: lc, dir: 'H', w: 'fill', align: 'CENTER' });
    await T(l, { parent: r, size: 14, color: bold ? C.ink : C.sub, weight: bold ? 'Bold' : 'Regular', w: 'fill' });
    await T(v, { parent: r, size: bold ? 18 : 15, weight: bold ? 'Black' : 'Medium' });
    if (l === '12:15 취소') line(lc);
  }
  const r2 = box({ parent: s, dir: 'H', w: 'fill', gap: 8, align: 'CENTER' });
  await T('부담', { parent: r2, size: 14, color: C.sub, w: 64 });
  await stack(r2, ALL4, { size: 24, overlap: -7 });
  await T('인당 ₩0', { parent: r2, size: 15, weight: 'Bold', w: 'fill', align: 'RIGHT' });
  spacer(s, 4);
  placeBottom(f, s);
  ids['WF-41'] = f.id;
  await note(0, 0, '41', '환불 묶음 상세', '결제 + 취소 = 순액 · 부담 인원 동일 적용');
}
// WF-42 지갑 · 연결 만료
{
  const f = await screen('42', '지갑 · 연결 만료 (다시 연결)', 0, 0, { time: '18:34' });
  await subHeader(f, '지갑');
  const b = body(f, { gap: 14, pad: [16, 20, 16, 20] });
  const co = card(b, { dir: 'H', gap: 10, align: 'CENTER', stroke: C.ink, radius: 12, pad: [12, 12, 12, 14], name: 'Callout/연결 만료' });
  icon('high-priority', { parent: co, size: 20, dark: true });
  await T('토스 연결 만료', { parent: co, size: 15, weight: 'Bold', w: 'fill' });
  await btn('다시 연결', co, { w: 96, h: 36, size: 13, radius: 8, padX: 8 });
  const sh = box({ parent: b, dir: 'H', w: 'fill', align: 'CENTER', gap: 4 });
  await T('연결된 계좌·카드', { parent: sh, size: 15, weight: 'Bold', w: 'fill' });
  await T('09:12 동기화', { parent: sh, size: 12, color: C.sub });
  const c = card(b, { gap: 0, pad: [2, 14, 2, 14], radius: 12, name: 'AccountList (멈춤)' });
  const rows = [['bank', '토스뱅크 통장', '1000-12**-**21'], ['bank-card-back-side', '토스뱅크 체크카드', '5365-****-****-1934'], ['bank-card-back-side', '신한카드 Deep Dream', '4518-****-****-1102']];
  for (let i = 0; i < rows.length; i++) {
    const [ic, n, num] = rows[i];
    const r = box({ parent: c, dir: 'H', w: 'fill', h: 64, gap: 12, align: 'CENTER', borderB: i < rows.length - 1 ? C.box : undefined });
    const ib = box({ parent: r, dir: 'H', w: 40, h: 40, radius: 10, fill: C.soft, align: 'CENTER', justify: 'CENTER' });
    icon(ic, { parent: ib, size: 22 });
    const t = box({ parent: r, dir: 'V', w: 'fill', gap: 2 });
    await T(n, { parent: t, size: 15, weight: 'Medium' });
    await T(num, { parent: t, size: 13, color: C.sub });
    r.opacity = 0.45;
  }
  ids['WF-42'] = f.id;
  await note(0, 0, '42', '지갑 · 연결 만료', '"다시 연결" → 재연결 시 끊긴 기간 소급');
}
// WF-43 기간 외 결제 추가
{
  const f = await screen('43', '기간 외 결제 추가 (선택)', 0, 0, { time: '18:34' });
  await subHeader(f, '기간 외 결제 추가');
  const b = body(f, { gap: 16, pad: [16, 20, 20, 20] });
  await segmented(b, ['여정 전', '여정 후'], '여정 전', { h: 40 });
  const l = box({ parent: b, dir: 'V', w: 'fill', gap: 0, name: 'OutOfPeriod' });
  const items = [['10.20', '아고다 · 호텔 오리엔탈 익스프레스 난바', '₩486,000', true], ['11.02', '제주항공 ICN–KIX 4매', '₩1,032,400', true], ['11.10', 'KKday · 유니버설 스튜디오 입장권', '₩412,800', false], ['11.11', '인천공항 장기주차', '₩36,000', false]];
  for (const [dt, n, k, on] of items) {
    const r = box({ parent: l, dir: 'H', w: 'fill', pad: [12, 0, 12, 0], gap: 12, align: 'CENTER', borderB: C.box, name: 'Item/' + n });
    checkbox(r, on, 22);
    const t = box({ parent: r, dir: 'V', w: 'fill', gap: 2 });
    await T(n, { parent: t, size: 14, weight: 'Medium', w: 'fill' });
    await T(dt, { parent: t, size: 12, color: C.sub });
    await T(k, { parent: r, size: 14, weight: 'Bold' });
  }
  grower(b);
  await btn('2건 추가', b);
  ids['WF-43'] = f.id;
  await note(0, 0, '43', '기간 외 결제 추가', '고른 건은 미확정으로 들어와 공동 지정');
}
// WF-44 정산 · 나간 멤버
{
  const f = await screen('44', '정산 · 나간 멤버', 0, 0, { time: '10:05' });
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
  const rows = [['준용', true, '₩316,390', '₩213,300', '+₩103,090', '받을 돈'], ['민지', false, '₩186,960', '₩213,300', '−₩26,340', '보낼 돈'], ['태현', false, '₩191,200', '₩200,155', '−₩8,955', '보낼 돈'], ['수빈', false, '₩132,360', '₩200,155', '−₩67,795', '보낼 돈', true]];
  for (let i = 0; i < rows.length; i++) {
    const [n, me, paid, bur, net, lab, left] = rows[i];
    const r = box({ parent: mc, dir: 'H', w: 'fill', h: 66, gap: 10, align: 'CENTER', borderB: i < rows.length - 1 ? C.box : undefined, name: 'SettleRow/' + n });
    await avatar(n, r, 36, { faded: left });
    const t = box({ parent: r, dir: 'V', w: 'fill', gap: 2 });
    const l1 = box({ parent: t, dir: 'H', gap: 6, align: 'CENTER' });
    await T(me ? `${n} (나)` : n, { parent: l1, size: 15, weight: 'Bold', color: left ? C.sub : C.ink });
    if (left) await flagTag('나간 멤버', l1);
    await T(`결제 ${paid} · 부담 ${bur}`, { parent: t, size: 12, color: C.sub });
    const a = box({ parent: r, dir: 'V', align: 'MAX', gap: 0 });
    await T(net, { parent: a, size: 16, weight: net.startsWith('+') ? 'Black' : 'Bold', lh: 22 });
    await T(lab, { parent: a, size: 11, color: C.sub, lh: 14 });
    icon('forward', { parent: r, size: 14 });
  }
  await bottomNav(f, 'stat', { ended: true });
  ids['WF-44'] = f.id;
  await note(0, 0, '44', '정산 · 나간 멤버', '부담은 그대로 · 프사 흐리게 + "나간 멤버"');
}
// WF-45 상태 변형 모음
{
  const f = await screen('45', '상태 변형 모음', 0, 0);
  f.children[0].remove(); // 상태바 없음 (컴포넌트 상태 보드)
  const b = body(f, { gap: 10, pad: [24, 20, 20, 20] });
  await T('상태 변형', { parent: b, size: 20, weight: 'Bold' });
  async function lab(t) { spacer(b, 6); await T(t, { parent: b, size: 12, weight: 'Bold', color: C.sub }); }
  await lab('연결 만료 · 결제내역 상단 Callout');
  const co = box({ parent: b, dir: 'H', w: 'fill', h: 48, radius: 10, stroke: C.ink, pad: [0, 14, 0, 14], gap: 8, align: 'CENTER', name: 'Callout/연결 만료' });
  icon('high-priority', { parent: co, size: 18, dark: true });
  await T('토스 연결 만료', { parent: co, size: 14, weight: 'Bold', w: 'fill' });
  await T('다시 연결 ›', { parent: co, size: 13, weight: 'Bold' });
  await lab('기간 외 결제 진입 · 결제내역 맨 아래');
  const en = box({ parent: b, dir: 'H', w: 'fill', h: 48, radius: 10, fill: C.soft, pad: [0, 14, 0, 14], gap: 8, align: 'CENTER', name: 'Entry/기간 외' });
  icon('plus-math', { parent: en, size: 18, dark: true });
  await T('기간 외 결제 추가', { parent: en, size: 14, weight: 'Medium', w: 'fill' });
  icon('forward', { parent: en, size: 14 });
  await lab('멤버 6명 · 스택 최대 4 + "+N"');
  await payRow(b, { time: '15:00', name: '아베노 하루카스 300', payer: '태현', krw: '₩110,300', fx: '¥12,000', tag: 'shared', who: ['준용', '민지', '태현', '수빈', '지호', '하은'] });
  await lab('예산 초과 · 현황 카드');
  const bc = card(b, { gap: 8, pad: [14, 16, 14, 16], name: 'Card/예산 초과' });
  const b1 = box({ parent: bc, dir: 'H', w: 'fill', align: 'CENTER' });
  await T('공동 지출', { parent: b1, size: 14, weight: 'Medium', color: C.sub, w: 'fill' });
  await tag('초과 ₩84,500', b1, 'solid');
  const b2 = box({ parent: bc, dir: 'H', w: 'fill', gap: 6, align: 'MAX' });
  await T('₩1,284,500', { parent: b2, size: 20, weight: 'Bold', lh: 28 });
  await T('/ ₩1,200,000', { parent: b2, size: 14, color: C.sub, lh: 24 });
  bar(bc, 318, 1, { h: 10 });
  for (const [t, m] of [['그룹장 승계 · 토스트', '민지님이 새 그룹장이에요'], ['환율 기준 변경 · 토스트', '새 환율로 다시 계산했어요']]) {
    await lab(t);
    const tw = box({ parent: b, dir: 'H', w: 'fill', justify: 'CENTER' });
    const ts = box({ parent: tw, dir: 'H', pad: [12, 18, 12, 18], radius: 12, fill: C.ink, align: 'CENTER', gap: 8, name: 'Toast' });
    icon('checkmark', { parent: ts, size: 16 });
    await T(m, { parent: ts, size: 14, weight: 'Medium', color: '#FFFFFF' });
  }
  ids['WF-45'] = f.id;
  await note(0, 0, '45', '상태 변형 모음', 'Callout · 기간 외 진입 · +N · 예산 초과 · 토스트');
}
// 엣지케이스 규칙표 (J 섹션 둘째 줄, 6칸 폭)
{
  const J = await sub('J');
  for (const c of [...J.children]) if (c.name === '엣지케이스 규칙표') c.remove();
  const W = 6 * SW + 5 * GAP_X;
  const t = box({ name: '엣지케이스 규칙표', dir: 'V', w: W, pad: [28, 32, 32, 32], gap: 16, radius: 16, fill: '#FFFFFF', stroke: C.line });
  J.appendChild(t); const [x, y] = gpos(6); t.x = x; t.y = y;
  await T('엣지케이스 규칙표', { parent: t, size: 24, weight: 'Bold' });
  const tb = box({ parent: t, dir: 'V', w: 'fill', gap: 0, radius: 10, stroke: C.line, clip: true, name: 'Table' });
  const COLS = [520, 0, 420];
  async function trow(cells, head) {
    const r = box({ parent: tb, dir: 'H', w: 'fill', pad: [14, 20, 14, 20], gap: 24, align: 'CENTER', fill: head ? C.soft : undefined, borderB: C.box });
    for (let i = 0; i < 3; i++) await T(cells[i], { parent: r, size: head ? 14 : 15, weight: head || i === 0 ? 'Bold' : 'Regular', color: i === 2 && !head ? C.sub : C.ink, w: COLS[i] || 'fill' });
  }
  await trow(['상황', '처리', '화면'], true);
  const R = [
    ['부담 인원 중 멤버가 나감·강퇴', '그 사람 부담은 정산에 그대로 남김. 프사 흐리게 + "나간 멤버"', 'WF-44'],
    ['결제 취소·환불 인입', '원 결제와 묶어 상계(합계 = 순액). 부담 인원은 원 결제와 동일', 'WF-40 · WF-41'],
    ['중복 의심 (다른 멤버 · 같은 가맹점·시각·금액)', '"중복 의심" 표시만, 임의 삭제 안 함. 각 결제자가 개인 전환 또는 표시 해제', 'WF-40'],
    ['종료 시 미확정 남음', '종료 다이얼로그에 건수 표시 → 개인(비공개) 처리', 'WF-24'],
    ['여정 기간 밖 결제 (항공권·숙소)', '결제내역 맨 아래 "기간 외 결제 추가" → 선택 → 미확정으로 추가', 'WF-43 · WF-45'],
    ['계좌 연동 끊김·만료', '지갑 "다시 연결" + 결제내역 상단 Callout. 재연결 시 끊긴 기간 결제 소급', 'WF-42 · WF-45'],
    ['공동 → 개인 전환', '확인 후 다른 멤버 화면에서 사라짐, 정산 재계산', 'WF-31 ~ 34'],
    ['부담 인원 변경', '결제자만 가능. 인당 즉시 재계산, 다른 멤버에겐 "변경됨"', 'WF-34 · 36 · 37'],
    ['결제자가 아닌 멤버가 상세 열람', '읽기 전용. "변경 요청" 기능은 추후', 'WF-38'],
    ['여정 종료(정산 확정) 후', '모든 결제 변경 잠금', 'WF-39'],
    ['환율 기준 변경', '여정 전체 금액 재계산 + 토스트. 종료 후엔 변경 불가', 'WF-45'],
    ['그룹장이 나감', '가입 순 다음 멤버가 승계 + 토스트', 'WF-45'],
    ['원 단위 나머지', '나머지는 결제자가 부담 (₩26,290 ÷ 4 = ₩6,572 × 3 + 결제자 ₩6,574)', 'WF-37'],
    ['멤버 5명 이상', '프사 스택 최대 4개 + "+N"', 'WF-45'],
    ['카카오 프사 없음', '기본 유저 이미지(연한 원 + 사람 아이콘)', '전 화면 (태현·수빈)'],
    ['예산 초과', '바 가득 + "초과 ₩N" 태그 (푸시 알림은 범위 밖)', 'WF-45'],
  ];
  for (const r of R) await trow(r);
  tb.children[tb.children.length - 1].strokes = [];
  ids['rule_table'] = t.id;
  // J 섹션 높이를 내용에 맞춤
  let maxY = 0; for (const c of J.children) maxY = Math.max(maxY, c.y + c.height);
  J.resizeWithoutConstraints(SUB_W, maxY + SUB_PAD);
}
return ids;

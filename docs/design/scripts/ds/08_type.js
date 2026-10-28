const s1 = S1();
for (const c of [...s1.children]) if (c.name==='01 · 타이포그래피') c.remove();
const col = node(IDS.colors.colors);
const Y0 = col.y + col.height + 160;
const {wrap, body} = await block(s1, {name:'01 · 타이포그래피', x:120, y:Y0, w:2560, eyebrow:'TYPOGRAPHY', title:'타이포그래피', desc:'한글 본문은 Noto Sans KR, 금액·숫자는 Archivo. Pretendard가 없는 환경에서 가장 안정적인 한글 산세리프(7단계 굵기)와, 기본 숫자가 고정폭(tabular)이라 금액 자릿수가 세로로 맞는 라틴 그로테스크의 조합이다. 모든 스타일은 같은 이름의 Text style로 등록되어 있다.', gap:48});
// font cards
const fc = frame({name:'families', layout:'HORIZONTAL', gap:40, fill:'none', hug:'v', w:2560, parent:body});
async function famCard(fam, style, big, role, note, sample2) {
  const c = card(fc, {name:'family/'+fam, w:1260, gap:16}); grow(c);
  await eyebrow(role, c);
  const b = await text(big, {family:fam, style, size:88, letterSpacing:-2, color:'#14141E', parent:c}); b.fills=[await P('text/primary')];
  const s2 = await text(sample2, {family:fam, style:'Regular', size:22, color:'#5C5C69', parent:c, width:1160}); s2.fills=[await P('text/secondary')]; s2.lineHeight={unit:'PIXELS',value:34};
  await T(note, 'Body/S', 'text/tertiary', {parent:c, width:1160});
}
await famCard('Noto Sans KR', 'Bold', '여정 가나다 Aa', 'KOREAN · Noto Sans KR', '본문·제목·라벨 전부. Regular(본문) / Medium(강조 본문·태그) / Bold(제목·버튼). 자간은 크기가 클수록 더 좁힌다(32px −0.8 → 12px 0).', '함께 떠난 여행의 결제를 한 지갑에 모으고, 끝나면 정확하게 나눠 줍니다. 오사카 3박 4일 · 도쿄 2박 3일 · 다낭 4박 5일');
await famCard('Archivo', 'Bold', '₩1,284,000', 'NUMERALS · Archivo', '금액 전용(Amount/L·M·S). 기본 숫자가 고정폭이라 리스트에서 자릿수가 정렬된다. 통화 기호는 숫자 앞(₩ ¥ $ €), ‘원’ 같은 한글 단위는 Noto Sans KR 텍스트로 따로 붙인다.', '0123456789  ₩1,284,000  ¥12,800  $86.40  −₩32,100  +₩48,250');
// scale table
const tbl = card(body, {name:'type scale', w:2560, gap:0, pad:[24,48,24,48]});
const rows = Object.keys(TYPE);
for (let i=0;i<rows.length;i++) {
  const name = rows[i], d = TYPE[name];
  const r = frame({name:'row/'+name, layout:'HORIZONTAL', gap:40, pad:[22,0,22,0], fill:'none', hug:'v', w:2464, parent:tbl, align:'CENTER'});
  const meta = frame({name:'meta', layout:'VERTICAL', gap:4, fill:'none', hug:'v', w:360, parent:r});
  await T(name, 'Label/L', 'text/brand', {parent:meta});
  await T(`${d.f} ${d.s} · ${d.size}/${d.lh} · 자간 ${d.ls}`, 'Caption', 'text/tertiary', {parent:meta});
  const isAmt = name.startsWith('Amount');
  const sample = await T(isAmt ? '₩1,284,000   ¥128,000   −₩32,100' : '오사카 3박 4일 · ₩1,284,000', name, 'text/primary', {parent:r});
  const use = {
    'Display':'스플래시·정산 결과 큰 제목', 'Heading/H1':'화면 제목(여정 이름)', 'Heading/H2':'섹션 제목·시트 제목', 'Heading/H3':'카드 제목·리스트 그룹 제목',
    'Body/L':'긴 본문·입력값', 'Body/L Strong':'강조 본문·리스트 1행', 'Body/M':'기본 본문', 'Body/M Strong':'가맹점명·사람 이름', 'Body/S':'보조 설명', 'Body/S Strong':'보조 강조',
    'Caption':'시각·환산 기준·헬퍼 텍스트', 'Label/L':'버튼 L·M', 'Label/M':'버튼 S·탭·세그먼트', 'Label/S':'태그·배지·칩',
    'Amount/L':'총지출·내가 낼 금액(Stat)', 'Amount/M':'카드 금액·정산 순잔액', 'Amount/S':'결제 행 금액'
  }[name];
  grow(sample);
  await T(use, 'Body/S', 'text/secondary', {parent:r, width:320, align:'RIGHT'});
  if (i < rows.length-1) { const dv = rect({w:2464, h:1, parent:tbl, name:'divider'}); await fillV(dv,'border/default'); }
}
// tabular demo
const demo = frame({name:'tabular demo', layout:'HORIZONTAL', gap:40, fill:'none', hug:'v', w:2560, parent:body});
async function col2(title, fam, style, tok) {
  const c = card(demo, {name:'tab/'+fam, w:1260, gap:12}); grow(c);
  await T(title, 'Heading/H3', 'text/primary', {parent:c});
  for (const v of ['₩1,284,000','₩111,100','₩48,250','₩7,000']) { const t = await text(v, {family:fam, style, size:28, color:'#14141E', parent:c, width:400, align:'RIGHT'}); t.fills=[await P(tok)]; }
}
await col2('✓ Archivo — 고정폭 숫자: 자릿수가 세로로 맞는다', 'Archivo', 'SemiBold', 'text/primary');
await col2('✕ Inter 기본값 — 비례폭: 1이 좁아 줄이 흔들린다 (비교용)', 'Inter', 'Semi Bold', 'text/tertiary');
return {type: wrap.id, h: wrap.height, y: wrap.y};

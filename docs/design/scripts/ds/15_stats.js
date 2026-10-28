const body = node(IDS.c_buttons.body);
const out = {};
const es = {}; for (const s of await figma.getLocalEffectStylesAsync()) es[s.name]=s;
async function eff(n, name) { try { await n.setEffectStyleIdAsync(es[name].id); } catch(e) { n.effectStyleId = es[name].id; } }
const AVS = node(IDS.c_nav.Avatar.setId);
const av = (col, size) => AVS.children.find(v=>v.name===`Color=${col}, Size=${size}`).createInstance();
async function setInitial(inst, ch) { const t = inst.findOne(n=>n.name==='initial'); await font(t.fontName.family, t.fontName.style); t.characters = ch; }
async function setText(n, s) { await font(n.fontName.family, n.fontName.style); n.characters = s; }
{ const p = body.findOne(n=>n.name==='panel/PaymentRow · 결제 내역 행'); p.resize(1460, p.height); const st=p.findOne(n=>n.name==='stage'); st.resizeWithoutConstraints(1380, st.height); }
// ---------- StatCard
{
  const {p, stage} = await panel(body, 'StatCard', '결제·현황 탭 상단 요약. 총지출 / 예산 / 내가 낼 금액. Brand(보라 면)는 화면당 하나 — "내가 낼 금액"에만. L = 전체 너비 350, M = 2열(167).', 1000);
  const items=[]; let r=0;
  for (const [tn,brand] of [['Default',0],['Brand',1]]) { let k=0; for (const [sn,w,amt] of [['L',350,'Amount/L'],['M',167,'Amount/M']]) {
    const c = comp(`Type=${tn}, Size=${sn}`, {layout:'VERTICAL', gap:6, pad:20, w, hugMain:true}); c.counterAxisSizingMode='FIXED'; c.resize(w, c.height); c.counterAxisAlignItems='MIN';
    await bindRadius(c,'radius/xl'); await bindPad(c,'space/20','space/20','space/20','space/20');
    c.fills=[await P(brand?'bg/brand':'bg/surface')]; if (!brand) await eff(c,'Elevation/1');
    const lr = frame({name:'label row', layout:'HORIZONTAL', gap:6, fill:'none', hug:'both', parent:c, align:'CENTER'});
    const i = iconInst(brand?'wallet':'receipt', 18, lr, 'icon'); await iconColor(i, brand?'icon/inverse':'icon/subtle');
    await T(brand?'내가 낼 금액':'총지출', 'Body/S Strong', brand?'text/inverse':'text/secondary', {parent:lr, name:'label'});
    await T(brand?'₩48,250':'₩1,284,000', amt, brand?'text/inverse':'amount/default', {parent:c, name:'amount'});
    const sub = await T(brand?'정산 시 서준에게 보낼 예정':'공동 ₩1,026,000 · 내 개인 ₩258,000', 'Caption', brand?'text/inverse':'text/tertiary', {parent:c, name:'sub', width:w-40}); if (brand) sub.opacity=0.8;
    items.push({c, r, k}); k++; } r++; }
  const g = gridSet(items, stage, 'StatCard', {ox:80, oy:30, gx:24, gy:20, pad:20});
  g.set.fills=[await P('bg/canvas')];
  ['Size=L (350)','Size=M (167)'].forEach((s,i)=>axisLabel(stage, s, 80+g.cx[i], 0));
  await axisLabel(stage,'Default',66,30+g.ry[0]+40,{right:true}); await axisLabel(stage,'Brand',66,30+g.ry[1]+40,{right:true});
  // examples row
  const ex = frame({name:'example', layout:'HORIZONTAL', gap:16, pad:20, hug:'both', parent:stage, x:80, y:g.set.y+g.set.height+40, radius:16}); await fillV(ex,'bg/canvas');
  const m1 = g.set.children.find(v=>v.name==='Type=Default, Size=M').createInstance(); ex.appendChild(m1);
  const m2 = g.set.children.find(v=>v.name==='Type=Default, Size=M').createInstance(); ex.appendChild(m2);
  await setText(m2.findOne(n=>n.name==='label'), '예산'); await setText(m2.findOne(n=>n.name==='amount'), '₩1,500,000'); await setText(m2.findOne(n=>n.name==='sub'), '86% 사용 · ₩216,000 남음');
  m2.findOne(n=>n.name==='icon').swapComponent(node(IDS.icons.comp['pie-chart'])); await iconColor(m2.findOne(n=>n.name==='icon'),'icon/subtle');
  await setText(m1.findOne(n=>n.name==='sub'), '1인 평균 ₩321,000');
  await axisLabel(stage, '↑ 2열 예: 총지출 · 예산 (label/amount/sub 텍스트, icon 교체)', 80, ex.y+ex.height+8);
  fitStage(stage);
  out.StatCard = {setId:g.set.id, props:{Type:['Default','Brand'], Size:['L','M']}, defaultVariantId:g.set.defaultVariant.id, textLayers:['label','amount','sub'], iconLayer:'icon'};
}
// ---------- BudgetProgress
{
  const {p, stage} = await panel(body, 'BudgetProgress', '여정 예산 대비 사용률(공동 지출 기준). 80% 미만 보라, 80% 이상 주황(주의), 100% 초과 빨강 + "초과" 문구. 바 너비는 fill 레이어 width = 트랙 폭 × 비율로 조정.', 900);
  const D = {Normal:[0.55,'budget/fill','₩825,000 / ₩1,500,000','55% 사용','₩675,000 남음','text/secondary'], Caution:[0.86,'budget/caution','₩1,284,000 / ₩1,500,000','86% 사용','₩216,000 남음','expense/pending/fg'], Over:[1,'budget/over','₩1,612,000 / ₩1,500,000','107% 사용','₩112,000 초과','text/error']};
  const items=[]; let k=0;
  for (const [sn,[ratio,tok,head,pct,rem,remTok]] of Object.entries(D)) {
    const c = comp(`State=${sn}`, {layout:'VERTICAL', gap:10, pad:20, w:350, hugMain:true}); c.counterAxisSizingMode='FIXED'; c.resize(350, c.height); c.counterAxisAlignItems='MIN';
    await bindRadius(c,'radius/lg'); c.fills=[await P('bg/surface')]; await strokeV(c,'border/default',1,'INSIDE');
    const hr = frame({name:'head', layout:'HORIZONTAL', gap:8, fill:'none', hug:'v', w:310, parent:c, align:'CENTER'}); hr.layoutAlign='STRETCH';
    await T('예산', 'Body/S Strong', 'text/secondary', {parent:hr, name:'label'}); const sp = frame({name:'sp', fill:'none', w:4, h:4, parent:hr}); grow(sp);
    const ht = await text(head, {family:'Archivo', style:'SemiBold', size:14, color:'#14141E', parent:hr, name:'value'}); ht.fills=[await P('amount/default')];
    const tr = frame({name:'track', layout:'NONE', w:310, h:8, parent:c, radius:999}); tr.layoutAlign='STRETCH'; tr.fills=[await P('budget/track')]; tr.clipsContent=true;
    const fl = rect({w:Math.round(310*ratio), h:8, parent:tr, radius:999, name:'fill'}); fl.fills=[await P(tok)];
    const fr = frame({name:'foot', layout:'HORIZONTAL', gap:8, fill:'none', hug:'v', w:310, parent:c, align:'CENTER'}); fr.layoutAlign='STRETCH';
    if (sn==='Over') { const ai = iconInst('alert', 14, fr, 'icon'); await iconColor(ai,'text/error'); }
    await T(pct, 'Caption', sn==='Over'?'text/error':'text/tertiary', {parent:fr, name:'percent'}); const sp2 = frame({name:'sp', fill:'none', w:4, h:4, parent:fr}); grow(sp2);
    await T(rem, 'Label/S', remTok, {parent:fr, name:'remaining'});
    items.push({c, r:k, k:0}); k++; }
  const g = gridSet(items, stage, 'BudgetProgress', {ox:90, oy:0, gy:16, pad:20});
  g.set.fills=[await P('bg/canvas')];
  let ri=0; for (const s of Object.keys(D)) { await axisLabel(stage, s, 76, g.ry[ri]+44, {right:true}); ri++; }
  await axisLabel(stage, '텍스트: label · value · percent · remaining', 90, g.set.y+g.set.height+12);
  fitStage(stage);
  out.BudgetProgress = {setId:g.set.id, props:{State:Object.keys(D)}, defaultVariantId:g.set.defaultVariant.id, textLayers:['label','value','percent','remaining'], resizeLayer:'track > fill (width = 310 × 비율, 인스턴스 폭이 다르면 비례 계산)'};
}
// ---------- SettlementRow + TransferRow
{
  const {p, stage} = await panel(body, 'SettlementRow · TransferRow', '정산 요약(여정 종료 후). SettlementRow = 사람별 결제합 · 부담액 · 순잔액(+받을 / −보낼), 탭하면 그 사람의 결제 내역. TransferRow = 송금 권장안(실제 송금은 하지 않음, 금액 복사만).', 1000);
  const D = {Receive:['민지','Violet','민','결제 ₩482,000 · 부담 ₩321,000','+₩161,000','받을 돈','amount/receive'], Send:['서준','Sunset','서','결제 ₩273,000 · 부담 ₩321,250','−₩48,250','보낼 돈','amount/send'], Even:['하린','Green','하','결제 ₩321,000 · 부담 ₩321,000','₩0','정산 끝','text/tertiary']};
  const items=[]; let k=0;
  for (const [tn,[nm,col,ini,sub,net,lab,tok]] of Object.entries(D)) {
    const c = comp(`Net=${tn}`, {layout:'HORIZONTAL', gap:12, pad:[14,16,14,20], w:390, hugMain:false, hugCross:true}); c.resize(390,c.height);
    c.fills=[await P('bg/surface')];
    const a = av(col,'M'); c.appendChild(a); a.name='avatar'; await setInitial(a, ini);
    const mid = frame({name:'info', layout:'VERTICAL', gap:2, fill:'none', hug:'v', w:150, parent:c}); grow(mid);
    const nr = frame({name:'name row', layout:'HORIZONTAL', gap:6, fill:'none', hug:'both', parent:mid, align:'CENTER'});
    await T(nm, 'Body/M Strong', 'text/primary', {parent:nr, name:'name'});
    const me = frame({name:'me badge', layout:'HORIZONTAL', pad:[1,6,1,6], hug:'both', radius:4, parent:nr}); me.fills=[await P('bg/brand-subtle')]; await T('나', 'Label/S', 'text/brand', {parent:me, name:'me'}); me.visible = false;
    await T(sub, 'Caption', 'text/tertiary', {parent:mid, name:'breakdown'});
    const right = frame({name:'net', layout:'VERTICAL', gap:0, fill:'none', hug:'both', parent:c, align:'MAX'});
    await T(net, 'Amount/M', tok, {parent:right, name:'net amount', align:'RIGHT'});
    await T(lab, 'Caption', tok==='text/tertiary'?'text/tertiary':tok, {parent:right, name:'net label'});
    const ch = iconInst('chevron-right', 20, c, 'chevron'); await iconColor(ch,'icon/subtle');
    items.push({c, r:k, k:0}); k++; }
  const g = gridSet(items, stage, 'SettlementRow', {ox:80, oy:0, gy:12, pad:16});
  const kMe = g.set.addComponentProperty('Me', 'BOOLEAN', false); for (const v of g.set.children) v.findOne(n=>n.name==='me badge').componentPropertyReferences={visible:kMe};
  let ri=0; for (const s of Object.keys(D)) { await axisLabel(stage, s, 66, g.ry[ri]+28, {right:true}); ri++; }
  // TransferRow
  const tr = comp('TransferRow', {layout:'HORIZONTAL', gap:10, pad:[14,16,14,20], w:390, hugMain:false, hugCross:true}); stage.appendChild(tr); tr.resize(390, tr.height);
  tr.fills=[await P('bg/surface')]; await bindRadius(tr,'radius/lg'); await strokeV(tr,'border/default',1,'INSIDE');
  const a1 = av('Sunset','S'); tr.appendChild(a1); a1.name='from avatar'; await setInitial(a1,'서');
  const ar = iconInst('chevron-right', 16, tr, 'arrow'); await iconColor(ar,'icon/subtle');
  const a2 = av('Violet','S'); tr.appendChild(a2); a2.name='to avatar'; await setInitial(a2,'민');
  const tx = await T('서준 → 민지', 'Body/M Strong', 'text/primary', {parent:tr, name:'pair'}); grow(tx);
  await T('₩48,250', 'Amount/S', 'amount/default', {parent:tr, name:'amount'});
  const cp = node(IDS.c_buttons.IconButton.setId).children.find(v=>v.name==='Type=Ghost, Size=S, State=Default').createInstance(); tr.appendChild(cp); cp.name='copy'; cp.setProperties({[Object.keys(node(IDS.c_buttons.IconButton.setId).componentPropertyDefinitions)[0]]: IDS.icons.comp['copy']});
  tr.description = '송금 권장안 한 줄. from avatar → to avatar, pair 텍스트, amount, copy(금액 복사) 아이콘 버튼.';
  tr.x = 80; tr.y = g.set.y + g.set.height + 60;
  await axisLabel(stage, 'TransferRow — 송금 권장안', 80, tr.y - 22);
  await axisLabel(stage, '텍스트: name · breakdown · net amount · net label. Me 속성 = 이름 옆 "나" 배지. 순잔액 = 결제합 − 부담액.', 80, tr.y + tr.height + 14);
  fitStage(stage);
  out.SettlementRow = {setId:g.set.id, props:{Net:Object.keys(D)}, defaultVariantId:g.set.defaultVariant.id, textLayers:['name','breakdown','net amount','net label'], nested:{avatar:'Avatar (Size=M)'}, iconLayer:'chevron', propKeys:{Me:kMe}};
  out.TransferRow = {componentId:tr.id, textLayers:['pair','amount'], nested:{'from avatar':'Avatar S','to avatar':'Avatar S', copy:'IconButton Ghost S'}};
}
return out;

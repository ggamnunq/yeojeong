const body = node(IDS.c_buttons.body);
const out = {};
const AVS = node(IDS.c_nav.Avatar.setId), TAG = node(IDS.c_inputs.Tag.setId);
const av = (col, size) => AVS.children.find(v=>v.name===`Color=${col}, Size=${size}`).createInstance();
const tag = (t, s) => TAG.children.find(v=>v.name===`Type=${t}, Size=${s}`).createInstance();
async function setInitial(inst, ch) { const t = inst.findOne(n=>n.name==='initial'); await font(t.fontName.family, t.fontName.style); t.characters = ch; }
// fix ▾ glyph in header usage text
{ const u = body.findOne(n=>n.name==='panel/TopHeader').findOne(n=>n.name==='usage'); await font('Noto Sans KR','Regular'); u.characters = u.characters.replace('그룹명 + ▾(', '그룹명 + 아래 화살표('); }
// ---------- PaymentRow
{
  const {p, stage} = await panel(body, 'PaymentRow · 결제 내역 행', '결제 내역 리스트의 한 줄. 왼쪽 결제자 아바타, 가맹점명, 시각·결제자·부담 인원, 개인/공동/미확정 태그, 오른쪽 환산 금액(KRW, 굵게) + 원통화 금액. 미확정은 금액을 보조색으로 낮추고 "공동/개인 지정"을 유도.', 1340);
  const D = {Shared:['이치란 라멘 도톤보리점','12:40 · 민지 · 4명','₩28,400','¥3,200','Violet','민'], Personal:['돈키호테 난바점','14:05 · 나','₩41,300','¥4,650','Sunset','서'], Pending:['FamilyMart 난바역','15:12 · 하린','₩5,320','¥599','Green','하']};
  const items=[]; let k=0;
  for (const [tn,[mer,meta,krw,org,col,ini]] of Object.entries(D)) { for (const [r,st] of ['Default','Pressed'].entries()) {
    const c = comp(`Type=${tn}, State=${st}`, {layout:'HORIZONTAL', gap:12, pad:[14,20,14,20], w:390, hugMain:false, hugCross:true}); c.resize(390, c.height);
    await bindPad(c,'space/12','space/20','space/12','space/20'); c.paddingTop=14; c.paddingBottom=14;
    c.fills=[await P(st==='Pressed'?'bg/pressed':'bg/surface')];
    const a = av(col,'M'); c.appendChild(a); a.name='payer avatar'; await setInitial(a, ini);
    const mid = frame({name:'info', layout:'VERTICAL', gap:4, fill:'none', hug:'v', w:200, parent:c}); grow(mid);
    const m = await T(mer, 'Body/M Strong', 'text/primary', {parent:mid, name:'merchant'}); m.layoutAlign='STRETCH'; m.textAutoResize='TRUNCATE'; m.textTruncation='ENDING'; m.resize(200, 22);
    const r2 = frame({name:'meta row', layout:'HORIZONTAL', gap:6, fill:'none', hug:'both', parent:mid, align:'CENTER'});
    const tg = tag(tn,'S'); r2.appendChild(tg); tg.name='tag';
    await T(meta, 'Caption', 'text/tertiary', {parent:r2, name:'meta'});
    const right = frame({name:'amounts', layout:'VERTICAL', gap:2, fill:'none', hug:'both', parent:c, align:'MAX'});
    await T(krw, 'Amount/S', tn==='Pending'?'text/secondary':'amount/default', {parent:right, name:'amount', align:'RIGHT'});
    const o = await text(org, {family:'Archivo', style:'Medium', size:12, color:'#70707E', parent:right, name:'original amount'}); o.fills=[await P('text/tertiary')]; o.lineHeight={unit:'PIXELS',value:16};
    items.push({c, r, k}); } k++; }
  const g = gridSet(items, stage, 'PaymentRow', {ox:80, oy:30, gx:24, gy:16, pad:16});
  Object.keys(D).forEach((s,i)=>axisLabel(stage, s, 80+g.cx[i], 0));
  await axisLabel(stage,'Default',66,30+g.ry[0]+28,{right:true}); await axisLabel(stage,'Pressed',66,30+g.ry[1]+28,{right:true});
  await axisLabel(stage, '텍스트: merchant · meta(시각 · 결제자 · 부담 인원) · amount(KRW) · original amount(원통화). 결제자 색: payer avatar의 Color 교체 + initial. 태그는 Type 변형이 자동 지정.', 80, g.set.y+g.set.height+12);
  // DateHeader (single component)
  const dh = comp('DateHeader', {layout:'HORIZONTAL', gap:8, pad:[16,20,8,20], w:390, hugMain:false, hugCross:true}); stage.appendChild(dh); dh.resize(390, dh.height); dh.counterAxisAlignItems='CENTER';
  dh.fills=[await P('bg/canvas')];
  await T('10월 28일 (화)', 'Label/M', 'text/primary', {parent:dh, name:'date'});
  await T('2일차', 'Caption', 'text/brand', {parent:dh, name:'day'});
  const sp = frame({name:'spacer', fill:'none', w:10, h:10, parent:dh}); grow(sp);
  const tot = await text('₩184,200', {family:'Archivo', style:'Medium', size:13, color:'#5C5C69', parent:dh, name:'daily total'}); tot.fills=[await P('text/secondary')];
  dh.description = '날짜 구분 헤더(리스트/타임라인 공통). 오른쪽 = 그날 공동+내 개인 지출 합계(KRW).';
  dh.x = 80; dh.y = g.set.y + g.set.height + 70;
  await axisLabel(stage, 'DateHeader — 날짜 구분 (date · day · daily total)', 80, dh.y - 22);
  fitStage(stage);
  out.PaymentRow = {setId:g.set.id, props:{Type:Object.keys(D), State:['Default','Pressed']}, defaultVariantId:g.set.defaultVariant.id, textLayers:['merchant','meta','amount','original amount'], nested:{'payer avatar':'Avatar (Size=M)', tag:'Tag (Size=S)'}};
  out.DateHeader = {componentId:dh.id, textLayers:['date','day','daily total']};
}
// ---------- TimelineItem
{
  const {p, stage} = await panel(body, 'TimelineItem · 타임라인 노드', '결제 내역 타임라인 보기. 시각 · 레일(점+선) · 카드. 점 색 = 지출 구분(공동 보라 / 개인 회색 / 미확정 주황 점선 링). Now = 진행 중 여정의 현재 시각(노을색). Position=Last면 아래 선을 숨긴다.', 1000);
  const D = {Shared:['이치란 라멘 도톤보리점','₩28,400','¥3,200 · 민지 결제 · 4명','12:40'], Personal:['돈키호테 난바점','₩41,300','¥4,650 · 나만 보임','14:05'], Pending:['FamilyMart 난바역','₩5,320','¥599 · 하린 결제','15:12'], Now:['지금','','오사카성 공원 근처','15:40']};
  const items=[]; let k=0;
  for (const [tn,[mer,krw,meta,time]] of Object.entries(D)) { for (const [r,pos] of ['Middle','Last'].entries()) {
    const c = comp(`Type=${tn}, Position=${pos}`, {layout:'HORIZONTAL', gap:8, pad:[0,20,0,20], w:390, hugMain:false, hugCross:true, align:'MIN'}); c.resize(390, c.height);
    c.fills=[];
    const tc = frame({name:'time col', layout:'VERTICAL', fill:'none', w:40, hug:'v', pad:[14,0,0,0], parent:c, align:'MAX'});
    const tt = await text(time, {family:'Archivo', style:'Medium', size:12, color:'#70707E', parent:tc, name:'time'}); tt.fills=[await P(tn==='Now'?'amount/send':'text/tertiary')];
    const rail = frame({name:'rail', layout:'VERTICAL', gap:0, fill:'none', w:20, hug:'none', parent:c, align:'CENTER'}); rail.layoutAlign='STRETCH';
    const top = rect({w:2, h:14, parent:rail, name:'line top'}); await fillV(top,'border/strong');
    const dot = figma.createEllipse(); dot.resize(14,14); dot.name='dot'; rail.appendChild(dot);
    if (tn==='Shared') dot.fills=[await P('expense/shared/solid')];
    else if (tn==='Personal') dot.fills=[await P('expense/personal/solid')];
    else if (tn==='Pending') { dot.fills=[await P('bg/surface')]; await strokeV(dot,'expense/pending/border',2.5,'INSIDE'); dot.dashPattern=[3,2]; }
    else { dot.fills=[await P('brand/accent')]; await strokeV(dot,'sunset/100',4,'OUTSIDE'); }
    const bot = rect({w:2, h:10, parent:rail, name:'line bottom'}); await fillV(bot,'border/strong'); grow(bot); bot.visible = pos!=='Last';
    if (tn==='Now') { top.fills=[await P('brand/accent')]; }
    if (tn!=='Now') {
      const cd = frame({name:'card', layout:'VERTICAL', gap:6, pad:[12,14,12,14], hug:'v', w:200, parent:c, radius:16}); grow(cd); await fillV(cd,'bg/surface'); await strokeV(cd, tn==='Pending'?'expense/pending/border':'border/default', 1, 'INSIDE'); if (tn==='Pending') cd.dashPattern=[4,3];
      const row1 = frame({name:'row1', layout:'HORIZONTAL', gap:8, fill:'none', hug:'v', w:200, parent:cd, align:'CENTER'}); row1.layoutAlign='STRETCH';
      const m = await T(mer, 'Body/M Strong', 'text/primary', {parent:row1, name:'merchant'}); grow(m); m.textAutoResize='TRUNCATE'; m.textTruncation='ENDING';
      await T(krw, 'Amount/S', tn==='Pending'?'text/secondary':'amount/default', {parent:row1, name:'amount'});
      const row2 = frame({name:'row2', layout:'HORIZONTAL', gap:6, fill:'none', hug:'both', parent:cd, align:'CENTER'});
      const tg = tag(tn,'S'); row2.appendChild(tg); tg.name='tag';
      await T(meta, 'Caption', 'text/tertiary', {parent:row2, name:'meta'});
      const spc = frame({name:'gap', fill:'none', w:10, h:12, parent:cd}); spc.visible = false;
      c.paddingBottom = 12;
    } else {
      const nw = frame({name:'now', layout:'HORIZONTAL', gap:8, pad:[10,0,16,0], fill:'none', hug:'both', parent:c, align:'CENTER'});
      await T('지금', 'Label/M', 'amount/send', {parent:nw, name:'merchant'});
      await T(meta, 'Caption', 'text/tertiary', {parent:nw, name:'meta'});
    }
    items.push({c, r:k, k:r}); } k++; }
  const g = gridSet(items, stage, 'TimelineItem', {ox:80, oy:30, gx:24, gy:8, pad:16});
  g.set.fills=[await P('bg/canvas')];
  ['Position=Middle','Position=Last'].forEach((s,i)=>axisLabel(stage, s, 80+g.cx[i], 0));
  let ri=0; for (const tn of Object.keys(D)) { await axisLabel(stage, tn, 66, 30+g.ry[ri]+16, {right:true}); ri++; }
  await axisLabel(stage, '세로로 쌓아 쓴다(간격 0). 같은 날 마지막 노드만 Position=Last. 텍스트: time · merchant · amount · meta.', 80, g.set.y+g.set.height+12);
  fitStage(stage);
  out.TimelineItem = {setId:g.set.id, props:{Type:Object.keys(D), Position:['Middle','Last']}, defaultVariantId:g.set.defaultVariant.id, textLayers:['time','merchant','amount','meta'], nested:{tag:'Tag (Size=S)'}};
}
return out;

const body = node(IDS.c_buttons.body);
const out = {};
const es = {}; for (const s of await figma.getLocalEffectStylesAsync()) es[s.name]=s;
async function eff(n, name) { try { await n.setEffectStyleIdAsync(es[name].id); } catch(e) { n.effectStyleId = es[name].id; } }
const bk = IDS.c_buttons.Button.propKeys;
// ---- fixes: FILL buttons
const sheet = node(IDS.c_overlays.BottomSheet.componentId);
const cta = sheet.findOne(n=>n.name==='cta'); cta.layoutSizingHorizontal='FILL'; cta.setProperties({[bk.Label]:'저장하기'});
const content = sheet.findOne(n=>n.name==='content'); content.layoutSizingHorizontal='FILL';
const exInst = sheet.parent.findOne(n=>n.name==='example · dim + sheet').children.find(n=>n.type==='INSTANCE');
exInst.y = 560 - exInst.height;
const res = {exLabel: exInst.findOne(n=>n.name==='label').characters};
const es1 = node(IDS.c_overlays.EmptyState.setId);
for (const v of es1.children) { const a = v.findOne(n=>n.name==='actions'); if (a.children.length>1) for (const b of a.children) b.layoutSizingHorizontal='FILL'; }
// ---------- Divider
{
  const {p, stage} = await panel(body, 'Divider', '리스트 행 사이(Inset: 왼쪽 20 들여쓰기), 화면 폭 구분(Full), 섹션 사이 굵은 구분(Thick 8px, bg/subtle).', 640);
  const items=[]; let k=0;
  for (const [tn, h, inset, tok] of [['Full',1,0,'border/default'],['Inset',1,20,'border/default'],['Thick',8,0,'bg/subtle']]) {
    const c = comp(`Type=${tn}`, {layout:'HORIZONTAL', pad:[0,0,0,inset], w:390, h, hugMain:false}); c.counterAxisSizingMode='FIXED'; c.resize(390,h);
    const ln = rect({w:390-inset, h, parent:c, name:'line'}); ln.fills=[await P(tok)]; grow(ln); ln.layoutAlign='STRETCH';
    items.push({c, r:k, k:0}); k++; }
  const g = gridSet(items, stage, 'Divider', {ox:70, oy:0, gy:28, pad:24});
  let ri=0; for (const s of ['Full','Inset','Thick']) { await axisLabel(stage, s, 56, g.set.children[ri].y + g.set.children[ri].height/2 - 8, {right:true}); ri++; }
  fitStage(stage);
  out.Divider = {setId:g.set.id, props:{Type:['Full','Inset','Thick']}, defaultVariantId:g.set.defaultVariant.id};
}
// ---------- Checkbox
{
  const {p, stage} = await panel(body, 'Checkbox', '약관 동의(온보딩), 여러 항목 선택. 라벨 전체가 터치 영역(최소 44). [필수]/[선택] 표기는 라벨 앞에.', 760);
  const items=[]; let r=0;
  for (const st of ['Default','Disabled']) { let k=0; for (const on of ['Off','On']) {
    const c = comp(`Checked=${on}, State=${st}`, {layout:'HORIZONTAL', gap:10, pad:[10,0,10,0], hugMain:true, hugCross:true});
    const box = frame({name:'box', layout:'HORIZONTAL', justify:'CENTER', align:'CENTER', w:22, h:22, parent:c}); await bindRadius(box,'radius/xs');
    if (on==='On') { box.fills=[await P(st==='Disabled'?'bg/muted':'bg/brand')]; const i = iconInst('check', 16, box, 'check'); await iconColor(i, st==='Disabled'?'icon/disabled':'icon/inverse'); }
    else { box.fills=[await P(st==='Disabled'?'bg/subtle':'bg/surface')]; await strokeV(box, st==='Disabled'?'border/default':'border/strong', 1.5, 'INSIDE'); }
    await T('[필수] 서비스 이용약관 동의', 'Body/M', st==='Disabled'?'text/disabled':'text/primary', {parent:c, name:'label'});
    items.push({c, r, k}); k++; } r++; }
  const g = gridSet(items, stage, 'Checkbox', {ox:80, oy:30, gx:32, gy:4, pad:16});
  const kL = g.set.addComponentProperty('Label', 'TEXT', '[필수] 서비스 이용약관 동의'); for (const v of g.set.children) v.findOne(n=>n.name==='label').componentPropertyReferences={characters:kL};
  ['Checked=Off','Checked=On'].forEach((s,i)=>axisLabel(stage, s, 80+g.cx[i], 0));
  await axisLabel(stage,'Default',66,30+g.ry[0]+12,{right:true}); await axisLabel(stage,'Disabled',66,30+g.ry[1]+12,{right:true});
  fitStage(stage);
  out.Checkbox = {setId:g.set.id, props:{Checked:['Off','On'], State:['Default','Disabled']}, defaultVariantId:g.set.defaultVariant.id, textLayer:'label', propKeys:{Label:kL}};
}
// ---------- Toggle
{
  const {p, stage} = await panel(body, 'Toggle', '즉시 반영되는 켜기/끄기. 결제 상세의 "공동 지출로 공개", 알림 설정 등. 켬 = 보라 트랙.', 640);
  const items=[]; let r=0;
  for (const st of ['Default','Disabled']) { let k=0; for (const on of ['Off','On']) {
    const c = comp(`Value=${on}, State=${st}`, {layout:'HORIZONTAL', pad:3, w:48, h:28, hugMain:false, justify: on==='On'?'MAX':'MIN'}); c.counterAxisSizingMode='FIXED'; c.resize(48,28);
    await bindRadius(c,'radius/full');
    c.fills=[await P(on==='On' ? (st==='Disabled'?'primary/200':'bg/brand') : (st==='Disabled'?'bg/muted':'neutral/300'))];
    const kn = figma.createEllipse(); kn.resize(22,22); kn.name='knob'; c.appendChild(kn); kn.fills=[await P('bg/surface')]; await eff(kn,'Elevation/1');
    items.push({c, r, k}); k++; } r++; }
  const g = gridSet(items, stage, 'Toggle', {ox:80, oy:30, gx:40, gy:16, pad:20});
  ['Value=Off','Value=On'].forEach((s,i)=>axisLabel(stage, s, 80+g.cx[i], 0));
  await axisLabel(stage,'Default',66,30+g.ry[0]+6,{right:true}); await axisLabel(stage,'Disabled',66,30+g.ry[1]+6,{right:true});
  fitStage(stage);
  out.Toggle = {setId:g.set.id, props:{Value:['Off','On'], State:['Default','Disabled']}, defaultVariantId:g.set.defaultVariant.id};
}
out._res = res;
return out;

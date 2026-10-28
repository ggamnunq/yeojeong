const out = {};
async function setText(n, s) { await font(n.fontName.family, n.fontName.style); n.characters = s; }
// ---------- Tag Pending
const TAG = node(IDS.c_inputs.Tag.setId);
for (const [sz, h, px, fs] of [['M',20,7,12],['S',18,6,11]]) {
  const v = TAG.children.find(x=>x.name===`Type=Pending, Size=${sz}`);
  v.fills=[await P('expense/pending/bg')]; v.strokes=[]; v.dashPattern=[];
  v.findOne(n=>n.name==='icon').visible = false;
  v.paddingLeft = px; v.paddingRight = px; v.resize(v.width, h);
  const t = v.findOne(n=>n.name==='label'); await setText(t, '미확정'); t.fills=[await P('expense/pending/fg')]; t.fontSize = fs; t.lineHeight={unit:'PIXELS', value:h-4};
}
// re-center Tag grid rows
for (const v of TAG.children) { const row = v.name.includes('Size=M') ? 0 : 1; v.y = 24 + row*(26+20) + (26 - v.height)/2; }
// ---------- PaymentRow Pending: tag to end of meta row
const PR = node(IDS.c_list.PaymentRow.setId);
for (const v of PR.children.filter(v=>v.name.startsWith('Type=Pending'))) {
  const mr = v.findOne(n=>n.name==='meta row'); const tg = mr.findOne(n=>n.name==='tag'); mr.appendChild(tg);
  await setText(mr.findOne(n=>n.name==='meta'), '15:12 · 하린 결제');
  const a = v.findOne(n=>n.name==='amount'); a.fills=[await P('text/secondary')];
}
// ---------- TimelineItem Pending
const TL = node(IDS.c_list.TimelineItem.setId);
for (const v of TL.children.filter(v=>v.name.startsWith('Type=Pending'))) {
  const r2 = v.findOne(n=>n.name==='row2'); r2.appendChild(r2.findOne(n=>n.name==='tag'));
  const cd = v.findOne(n=>n.name==='card'); cd.strokes=[await P('border/default')]; cd.dashPattern=[]; cd.strokeWeight=1;
  const dot = v.findOne(n=>n.name==='dot'); dot.fills=[await P('bg/surface')]; dot.strokes=[await P('neutral/400')]; dot.dashPattern=[]; dot.strokeWeight=2;
  await setText(v.findOne(n=>n.name==='meta'), '¥599 · 하린 결제');
}
// ---------- Callout Pending
const CO = node(IDS.c_patch.Callout.setId); const cp = CO.children.find(v=>v.name==='Tone=Pending');
cp.fills=[await P('bg/canvas')]; cp.strokes=[await P('expense/pending/border')]; cp.dashPattern=[]; cp.strokeWeight=1;
cp.findOne(n=>n.name==='icon').visible = false;
let pdot = cp.findOne(n=>n.name==='dot');
if (!pdot) { pdot = figma.createEllipse(); pdot.name='dot'; pdot.resize(8,8); cp.insertChild(cp.children.indexOf(cp.findOne(n=>n.name==='icon'))+1, pdot); }
pdot.fills=[await P('expense/pending/dot')];
// ---------- SheetContent: pending tag at end of detail line
const SC = node(IDS.c_v12.SheetContent.componentId);
const sum = SC.findOne(n=>n.name==='summary'); sum.clipsContent=false; SC.clipsContent=false;
let drow = SC.findOne(n=>n.name==='detail row');
if (!drow) { const det = SC.findOne(n=>n.name==='detail'); drow = frame({name:'detail row', layout:'HORIZONTAL', gap:6, fill:'none', hug:'both', align:'CENTER'}); sum.insertChild(sum.children.indexOf(det), drow); drow.appendChild(det);
  const tg = TAG.children.find(x=>x.name==='Type=Pending, Size=S').createInstance(); drow.appendChild(tg); tg.name='pending tag'; }
let kP = Object.keys(SC.componentPropertyDefinitions).find(k=>k.startsWith('Pending#')); if (!kP) kP = SC.addComponentProperty('Pending','BOOLEAN',false);
drow.findOne(n=>n.name==='pending tag').componentPropertyReferences={visible:kP};
out.SheetContentPendingKey = kP;
// ---------- Amount font: Archivo -> IBM Plex Sans KR
const FONTMAP = {'Bold':'Bold','SemiBold':'SemiBold','Medium':'Medium','Regular':'Regular'};
for (const st of ['Bold','SemiBold','Medium','Regular']) await font('IBM Plex Sans KR', st);
const styles = await figma.getLocalTextStylesAsync(); const changedStyles = [];
for (const s of styles.filter(s=>s.name.startsWith('Amount/'))) { const old = s.fontName.style; s.fontName = {family:'IBM Plex Sans KR', style: FONTMAP[old] || 'SemiBold'}; s.description = `IBM Plex Sans KR ${s.fontName.style} ${s.fontSize}/${s.lineHeight.value} · ${s.letterSpacing.value}px (v1.3: Archivo → Plex KR, ₩ 획·한글 혼합 대응)`; changedStyles.push(s.name); }
out.styles = changedStyles;
// unlinked Archivo text inside components in S2 (amount-like) -> Plex KR
let unlinked = 0;
const inComp = n => { let p = n.parent; while (p) { if (p.type==='COMPONENT' || p.type==='COMPONENT_SET') return true; if (p.type==='INSTANCE') return false; p = p.parent; } return false; };
for (const t of S2().findAll(n=>n.type==='TEXT')) {
  if (t.fontName === figma.mixed) continue; if (t.fontName.family !== 'Archivo') continue; if (!inComp(t)) continue; if (t.textStyleId && t.textStyleId !== '') continue;
  const stl = FONTMAP[t.fontName.style] || 'Medium'; await font('Archivo', t.fontName.style); t.fontName = {family:'IBM Plex Sans KR', style: stl}; unlinked++; }
out.unlinkedArchivoToPlex = unlinked;
// ---------- remove dash patterns in S1 + S2
const border = await P('border/default'); let dashN = 0; const kinds = {};
for (let pass=0; pass<3; pass++) { let changed=0;
  for (const sec of [S1(), S2()]) { const ids = sec.findAll(n=>'dashPattern' in n && n.dashPattern && n.dashPattern.length>0).map(n=>n.id);
    for (const id of ids) { try { const n = figma.getNodeById(id); if (!n || !n.dashPattern || !n.dashPattern.length) continue;
      n.dashPattern = []; n.strokes = [border]; n.strokeWeight = 1; changed++; kinds[n.type] = (kinds[n.type]||0)+1; } catch(e) {} } }
  dashN += changed; if (!changed) break; }
out.dashRemoved = dashN; out.dashKinds = kinds;
return out;

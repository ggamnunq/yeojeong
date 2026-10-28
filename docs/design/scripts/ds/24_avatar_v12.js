const out = {};
// ---- tokens
{ const col = (await figma.variables.getLocalVariableCollectionsAsync()).find(c=>c.name==='여정/Color'); const m = col.modes[0].modeId; const vs = await allVars();
  for (const r of TOK.roles.filter(r=>r.name.startsWith('feedback/error/'))) { let v = vs[r.name]; if (!v) v = figma.variables.createVariable(r.name, col, 'COLOR');
    v.setValueForMode(m, figma.variables.createVariableAlias(vs[r.ref])); v.description = r.desc+' → '+r.ref+' · '+r.hex; vs[r.name]=v;
    const ps = (await figma.getLocalPaintStylesAsync()).find(s=>s.name==='여정/'+r.name) || figma.createPaintStyle(); ps.name='여정/'+r.name; ps.paints=[figma.variables.setBoundVariableForPaint({type:'SOLID',color:rgb(r.hex)},'color',v)]; ps.description=v.description; } }
// ---- Default image (Foundations)
const fbody = node(IDS.icons.foundations).findOne(n=>n.name==='body');
let row = fbody.findOne(n=>n.name==='row/profile'); if (row) row.remove();
row = frame({name:'row/profile', layout:'HORIZONTAL', gap:40, fill:'none', hug:'v', w:5160, align:'MIN'}); fbody.insertChild(fbody.children.indexOf(fbody.findOne(n=>n.name==='row/icons')), row);
const pc = card(row, {name:'Default profile image', w:5160, gap:24});
await eyebrow('AVATAR · DEFAULT PROFILE IMAGE', pc);
await T('기본 프로필 이미지', 'Heading/H1', 'text/primary', {parent:pc});
await T('카카오 프로필 사진이 없는 사용자에게 들어가는 「여정」 자체 이미지. 이니셜 아바타와 달리 "사진 자리"를 채우는 그림이다. primary/50 바탕 + primary/300 머리 + primary/200 어깨의 단순한 실루엣. 기본은 Violet, 사용자가 원하면 Sunset으로 바꿀 수 있다(색 변형은 이 두 가지만).', 'Body/M', 'text/secondary', {parent:pc, width:3000});
const prow = frame({name:'content', layout:'HORIZONTAL', gap:64, fill:'none', hug:'both', parent:pc, align:'MIN'});
const dstage = frame({name:'stage', w:2200, h:1120, fill:'none', parent:prow}); dstage.clipsContent=false;
const dvars = [];
for (const [cn, bg, head, body] of [['Violet','primary/50','primary/300','primary/200'],['Sunset','sunset/50','sunset/300','sunset/100']]) {
  const c = figma.createComponent(); c.name = `Color=${cn}`; c.resize(1024,1024); c.clipsContent = true; c.fills=[await P(bg)];
  const b = figma.createEllipse(); b.name='shoulders'; c.appendChild(b); b.resize(760,600); b.x=132; b.y=660; b.fills=[await P(body)];
  const h = figma.createEllipse(); h.name='head'; c.appendChild(h); h.resize(350,350); h.x=337; h.y=232; h.fills=[await P(head)];
  for (const n of [b,h]) n.constraints={horizontal:'SCALE',vertical:'SCALE'};
  dstage.appendChild(c); dvars.push(c);
}
const dset = figma.combineAsVariants(dvars, dstage); dset.name='Avatar/DefaultImage';
dvars[0].x = 40; dvars[0].y = 40; dvars[1].x = 40+1024+64; dvars[1].y = 40; dset.resizeWithoutConstraints(40*2+1024*2+64, 1024+80);
dset.fills=[solid('#FFFFFF')]; dset.strokes=[solid('#9747FF')]; dset.dashPattern=[6,4]; dset.cornerRadius=12;
dset.description = '서비스 기본 프로필 이미지 1024 원본. Avatar Source=Default 변형이 이 컴포넌트를 원형으로 잘라 쓴다.';
dstage.resizeWithoutConstraints(dset.width, dset.height);
out.DefaultImage = {setId:dset.id, variants:Object.fromEntries(dset.children.map(v=>[v.name,v.id]))};
// ---- Avatar extension
const A = node(IDS.c_nav.Avatar.setId);
const SZ = {XS:20, S:28, M:36, L:48, XL:64};
async function overlays(v, s) {
  for (const n of ['left overlay','me ring','ring']) { const o = v.findOne(x=>x.name===n && x.parent===v); if (o) o.remove(); }
  const lo = figma.createFrame(); lo.name='left overlay'; lo.fills=[]; lo.resize(s,s); lo.clipsContent=false; v.appendChild(lo); lo.layoutPositioning='ABSOLUTE'; lo.x=0; lo.y=0; lo.constraints={horizontal:'SCALE',vertical:'SCALE'};
  const de = figma.createEllipse(); de.name='desaturate'; lo.appendChild(de); de.resize(s,s); de.fills=[solid('#808080')]; de.blendMode='SATURATION'; de.constraints={horizontal:'SCALE',vertical:'SCALE'};
  const fa = figma.createEllipse(); fa.name='fade 60%'; lo.appendChild(fa); fa.resize(s,s); fa.fills=[await P('bg/surface', 0.6)]; fa.constraints={horizontal:'SCALE',vertical:'SCALE'};
  lo.visible = false;
  const me = figma.createEllipse(); me.name='me ring'; v.appendChild(me); me.layoutPositioning='ABSOLUTE'; me.resize(s,s); me.x=0; me.y=0; me.fills=[]; await strokeV(me,'border/focus',2,'INSIDE'); me.constraints={horizontal:'SCALE',vertical:'SCALE'}; me.visible=false;
  const rg = figma.createEllipse(); rg.name='ring'; v.appendChild(rg); rg.layoutPositioning='ABSOLUTE'; rg.resize(s,s); rg.x=0; rg.y=0; rg.fills=[]; await strokeV(rg,'bg/surface', s>=48?2:1.5,'OUTSIDE'); rg.constraints={horizontal:'SCALE',vertical:'SCALE'}; rg.visible=false;
}
const existing = [...A.children];
for (const v of existing) {
  if (!v.name.includes('Source=')) v.name = v.name + ', Source=Initial';
  v.strokes = []; v.clipsContent = false;
  const s = SZ[v.name.match(/Size=(\w+)/)[1]];
  await overlays(v, s);
}
const find = n => A.children.find(v=>v.name===n);
// XL initial
for (const cn of ['Violet','Sunset','Green','Blue','Amber','Gray']) {
  if (find(`Color=${cn}, Size=XL, Source=Initial`)) continue;
  const src = find(`Color=${cn}, Size=L, Source=Initial`); const v = src.clone(); A.appendChild(v); v.name = `Color=${cn}, Size=XL, Source=Initial`;
  v.resize(64,64); const t = v.findOne(n=>n.name==='initial'); await font(t.fontName.family, t.fontName.style); t.fontSize = 24; t.lineHeight={unit:'PIXELS',value:29};
  await overlays(v, 64);
}
// Photo + Default
for (const [sn, s] of Object.entries(SZ)) {
  if (!find(`Color=Gray, Size=${sn}, Source=Photo`)) {
    const v = find(`Color=Gray, Size=${sn}, Source=Initial`).clone(); A.appendChild(v); v.name = `Color=Gray, Size=${sn}, Source=Photo`;
    v.findOne(n=>n.name==='initial').remove(); v.fills=[await P('neutral/200')];
    const ph = figma.createEllipse(); ph.name='photo'; v.insertChild(0, ph); ph.layoutPositioning='ABSOLUTE'; ph.resize(s,s); ph.x=0; ph.y=0; ph.constraints={horizontal:'SCALE',vertical:'SCALE'};
    ph.fills=[{type:'IMAGE', scaleMode:'FILL', imageHash: figma.createImage(b64ToBytes(PHOTOS.a)).hash}];
  }
  for (const cn of ['Violet','Sunset']) {
    if (find(`Color=${cn}, Size=${sn}, Source=Default`)) continue;
    const v = find(`Color=${cn}, Size=${sn}, Source=Initial`).clone(); A.appendChild(v); v.name = `Color=${cn}, Size=${sn}, Source=Default`;
    v.findOne(n=>n.name==='initial').remove(); v.fills=[await P(cn==='Violet'?'primary/50':'sunset/50')];
    const fr = figma.createFrame(); fr.name='image'; fr.resize(s,s); fr.cornerRadius=999; fr.clipsContent=true; fr.fills=[]; v.insertChild(0, fr); fr.layoutPositioning='ABSOLUTE'; fr.x=0; fr.y=0; fr.constraints={horizontal:'SCALE',vertical:'SCALE'};
    const di = dset.children.find(x=>x.name===`Color=${cn}`).createInstance(); fr.appendChild(di); di.rescale(s/1024); di.x=0; di.y=0; di.constraints={horizontal:'SCALE',vertical:'SCALE'}; di.name='default image';
  }
}
// booleans
let kR = propKey(A,'Ring'), kM = propKey(A,'Me'), kLf = propKey(A,'Left');
if (!kR) kR = A.addComponentProperty('Ring','BOOLEAN',false);
if (!kM) kM = A.addComponentProperty('Me','BOOLEAN',false);
if (!kLf) kLf = A.addComponentProperty('Left','BOOLEAN',false);
for (const v of A.children) { v.findOne(n=>n.name==='ring' && n.parent===v).componentPropertyReferences={visible:kR}; v.findOne(n=>n.name==='me ring' && n.parent===v).componentPropertyReferences={visible:kM}; v.findOne(n=>n.name==='left overlay' && n.parent===v).componentPropertyReferences={visible:kLf}; }
// layout grid
const rows = [['Violet','Initial'],['Sunset','Initial'],['Green','Initial'],['Blue','Initial'],['Amber','Initial'],['Gray','Initial'],['Gray','Photo'],['Violet','Default'],['Sunset','Default']];
const cols = ['XS','S','M','L','XL']; const pad=24, cw=64, gx=28, rh=64, gy=16;
rows.forEach(([cn,src],r)=>cols.forEach((sn,k)=>{ const v = find(`Color=${cn}, Size=${sn}, Source=${src}`); const s=SZ[sn]; v.x = pad + k*(cw+gx) + (cw-s)/2; v.y = pad + r*(rh+gy) + (rh-s)/2; }));
A.resizeWithoutConstraints(pad*2 + cols.length*cw + (cols.length-1)*gx, pad*2 + rows.length*rh + (rows.length-1)*gy);
// stage labels
const stage = A.parent;
for (const t of stage.children.filter(n=>n.type==='TEXT' && (['L','M','S','XS','XL','Violet','Sunset','Green','Blue','Amber','Gray'].includes(n.characters) || n.characters.startsWith('Initial ·') || n.characters.startsWith('Photo') || n.characters.startsWith('Default ·') || n.characters.startsWith('Source=')))) t.remove();
A.x = 130; A.y = 30;
for (let k=0;k<cols.length;k++) await axisLabel(stage, cols[k]+' '+SZ[cols[k]], A.x + pad + k*(cw+gx), 6);
for (let r=0;r<rows.length;r++) await axisLabel(stage, `${rows[r][1]} · ${rows[r][0]}`, A.x - 12, A.y + pad + r*(rh+gy) + rh/2 - 8, {right:true});
out.Avatar = {setId:A.id, count:A.children.length, defaultVariant:A.defaultVariant.name, props:Object.fromEntries(Object.entries(A.componentPropertyDefinitions).map(([k,d])=>[k,d.variantOptions||d.type]))};
// usage text
const u = stage.parent.findOne(n=>n.name==='usage'); await font('Noto Sans KR','Regular');
u.characters = '그룹원 한 명. Source: Photo = 카카오 프로필 사진(샘플은 플레이스홀더, 실제 프사로 교체), Default = 「여정」 기본 이미지(사진 없을 때), Initial = 이니셜(이미지 로딩 실패·텍스트 목록 폴백). Ring = 흰 테두리(스택용), Me = 나(보라 테두리 2), Left = 나간 멤버(회색 + 40%).';
return out;

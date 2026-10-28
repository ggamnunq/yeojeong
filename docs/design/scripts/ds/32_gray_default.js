const out = {};
const g0 = figma.getNodeById('24:29748'); if (g0) g0.remove();
// ---- tokens: expense/pending re-alias + dot
{ const col = (await figma.variables.getLocalVariableCollectionsAsync()).find(c=>c.name==='여정/Color'); const m = col.modes[0].modeId; const vs = await allVars();
  for (const r of TOK.roles.filter(r=>r.name.startsWith('expense/pending/'))) { let v = vs[r.name]; if (!v) v = figma.variables.createVariable(r.name, col, 'COLOR');
    v.setValueForMode(m, figma.variables.createVariableAlias(vs[r.ref])); v.description = r.desc+' → '+r.ref+' · '+r.hex; vs[r.name]=v;
    const ps = (await figma.getLocalPaintStylesAsync()).find(s=>s.name==='여정/'+r.name) || figma.createPaintStyle(); ps.name='여정/'+r.name; ps.paints=[figma.variables.setBoundVariableForPaint({type:'SOLID',color:rgb(r.hex)},'color',v)]; ps.description=v.description; out['var:'+r.name]=v.id; } }
// ---- DefaultImage Gray
const DS = node(IDS.c_v12.AvatarDefaultImage.setId);
let gv = DS.children.find(v=>v.name==='Color=Gray');
if (!gv) { gv = DS.children.find(v=>v.name==='Color=Violet').clone(); DS.appendChild(gv); gv.name='Color=Gray'; }
gv.fills=[await P('neutral/100')]; gv.findOne(n=>n.name==='head').fills=[await P('neutral/400')]; gv.findOne(n=>n.name==='shoulders').fills=[await P('neutral/300')];
DS.insertChild(0, gv);
const order = ['Color=Gray','Color=Violet','Color=Sunset']; order.forEach((n,i)=>{ const v = DS.children.find(x=>x.name===n); v.x = 40 + i*(1024+64); v.y = 40; });
DS.resizeWithoutConstraints(40*2 + 1024*3 + 64*2, 1024+80); DS.parent.resizeWithoutConstraints(DS.width, DS.height);
DS.description = '서비스 기본 프로필 이미지 1024 원본. 기본 = Color=Gray(회색 바탕 + 회색 실루엣). Violet·Sunset은 레거시(쓰지 않음, 기존 인스턴스 보호용).';
out.DefaultImage = {setId:DS.id, gray:gv.id, defaultVariant:DS.defaultVariant.name};
// ---- Avatar Default Gray variants
const A = node(IDS.c_nav.Avatar.setId); const SZ = {XS:20,S:28,M:36,L:48,XL:64};
const find = n => A.children.find(v=>v.name===n);
for (const [sn,s] of Object.entries(SZ)) {
  let v = find(`Color=Gray, Size=${sn}, Source=Default`);
  if (!v) { v = find(`Color=Violet, Size=${sn}, Source=Default`).clone(); A.appendChild(v); v.name = `Color=Gray, Size=${sn}, Source=Default`; }
  v.fills=[await P('neutral/100')]; v.findOne(n=>n.name==='default image').swapComponent(gv);
}
const rows = [['Violet','Initial'],['Sunset','Initial'],['Green','Initial'],['Blue','Initial'],['Amber','Initial'],['Gray','Initial'],['Gray','Photo'],['Gray','Default'],['Violet','Default'],['Sunset','Default']];
const cols = ['XS','S','M','L','XL']; const pad=24, cw=64, gx=28, rh=64, gy=16;
rows.forEach(([cn,src],r)=>cols.forEach((sn,k)=>{ const v = find(`Color=${cn}, Size=${sn}, Source=${src}`); const s=SZ[sn]; v.x = pad + k*(cw+gx) + (cw-s)/2; v.y = pad + r*(rh+gy) + (rh-s)/2; }));
A.resizeWithoutConstraints(pad*2 + cols.length*cw + (cols.length-1)*gx, pad*2 + rows.length*rh + (rows.length-1)*gy);
const st = A.parent;
for (const t of st.children.filter(n=>n.type==='TEXT' && /^(Initial|Photo|Default) · /.test(n.characters))) t.remove();
for (let r=0;r<rows.length;r++) { const legacy = rows[r][1]==='Default' && rows[r][0]!=='Gray'; await axisLabel(st, `${rows[r][1]} · ${rows[r][0]}${legacy?' (레거시)':''}`, A.x - 12, A.y + pad + r*(rh+gy) + rh/2 - 8, {right:true}); }
// move stack below
const S = node(IDS.c_nav.AvatarStack.setId); const dy = (A.y + A.height + 80) - S.y;
if (dy > 0) for (const n of st.children.filter(n=>n.y >= S.y - 60 && n.id !== A.id)) n.y += dy;
fitStage(st);
// ---- photos: replace old hashes
const oldA = figma.createImage(b64ToBytes(PHOTOS_OLD.a)).hash, oldB = figma.createImage(b64ToBytes(PHOTOS_OLD.b)).hash;
const newA = figma.createImage(b64ToBytes(PHOTOS.a)).hash, newB = figma.createImage(b64ToBytes(PHOTOS.b)).hash;
let photoN = 0;
for (const nd of S2().findAll(n=>'fills' in n && Array.isArray(n.fills) && n.fills.some(f=>f.type==='IMAGE' && (f.imageHash===oldA || f.imageHash===oldB)))) {
  nd.fills = nd.fills.map(f => f.type==='IMAGE' && f.imageHash===oldA ? Object.assign({}, f, {imageHash:newA}) : f.type==='IMAGE' && f.imageHash===oldB ? Object.assign({}, f, {imageHash:newB}) : f); photoN++; }
out.photoNodes = photoN;
// ---- samples: Default Violet/Sunset avatar instances -> Gray (within S2 only)
let swapN = 0;
for (let pass=0; pass<6; pass++) { let changed = 0;
  const ids = S2().findAll(n=>n.type==='INSTANCE').map(n=>n.id);
  for (const id of ids) { try { const i = figma.getNodeById(id); if (!i) continue; const mc = i.mainComponent; if (!mc || !mc.parent || mc.parent.id !== A.id) continue;
    if (/Source=Default/.test(mc.name) && !/Color=Gray/.test(mc.name)) { i.setProperties({Color:'Gray'}); changed++; } } catch(e) {} }
  swapN += changed; if (!changed) break; }
out.defaultSwaps = swapN;
// ---- Foundations card text
const pc = node(IDS.icons.foundations).findOne(n=>n.name==='Default profile image');
const desc = pc.children.find(n=>n.type==='TEXT' && n.characters.startsWith('카카오 프로필 사진이 없는'));
await font('Noto Sans KR','Regular'); desc.characters = '카카오 프로필 사진이 없는 사용자에게 들어가는 「여정」 기본 이미지. 이니셜 아바타와 달리 "사진 자리"를 채우는 그림이다. v1.3: 회색 바탕(neutral/100) + 회색 실루엣(머리 neutral/400 · 어깨 neutral/300)으로 브랜드색 없이 차분하게. 기본 = Color=Gray. Violet·Sunset은 레거시(쓰지 않음, 기존 인스턴스 보호용으로만 남김).';
const step = pc.findAll(n=>n.type==='TEXT' && n.characters.startsWith('Source=Default'))[0]; if (step) step.characters = 'Source=Default · Color=Gray';
return out;

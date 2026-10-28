const out = {};
const t0 = figma.getNodeById('24:16392'); if (t0) t0.remove();
const A = node(IDS.c_nav.Avatar.setId);
const kR = propKey(A,'Ring');
const imgB = figma.createImage(b64ToBytes(PHOTOS.b)).hash;
const AV = (n) => A.children.find(v=>v.name===n);
const SAMPLE = [['준용','Gray','Photo','a'],['민지','Gray','Photo','b'],['태현','Violet','Default',null],['수빈','Sunset','Default',null]];
async function setAvatar(inst, i, size, ring=true) {
  const [nm, col, src, ph] = SAMPLE[i];
  inst.setProperties({Color:col, Size:size, Source:src, [kR]:ring});
  if (ph==='b') { const p = inst.findOne(n=>n.name==='photo'); p.fills=[{type:'IMAGE', scaleMode:'FILL', imageHash:imgB}]; }
  inst.name = 'avatar · ' + nm;
}
// ---------- AvatarStack
const S = node(IDS.c_nav.AvatarStack.setId);
const kO = propKey(S,'Overflow');
const SIZEMAP = {XS:['XS',20,-6,9], S:['S',28,-6,11], M:['M',36,-8,12]};
for (const v of S.children) if (!v.name.startsWith('Count=')) v.name = 'Count=5+, ' + v.name;
async function overflowChip(parent, s, fs) {
  const more = frame({name:'overflow', layout:'HORIZONTAL', justify:'CENTER', align:'CENTER', w:s, h:s, radius:999, parent}); more.fills=[await P('bg/muted')]; await strokeV(more,'bg/surface',1.5,'OUTSIDE');
  const t = await T('+2', 'Label/S', 'text/secondary', {parent:more, name:'count'}); t.fontSize = fs; t.lineHeight={unit:'PIXELS', value:Math.round(fs*1.3)};
  return more;
}
for (const [sz,[asz,s,gap,fs]] of Object.entries(SIZEMAP)) for (const cnt of ['2','3','4','5+']) {
  let v = S.children.find(x=>x.name===`Count=${cnt}, Size=${sz}`);
  if (!v) { v = comp(`Count=${cnt}, Size=${sz}`, {layout:'HORIZONTAL', gap, hugMain:true, hugCross:true}); S.appendChild(v); v.itemReverseZIndex = true; v.counterAxisAlignItems='CENTER';
    const n = cnt==='5+'?4:+cnt;
    for (let i=0;i<n;i++) { const a = AV(`Color=Violet, Size=${asz}, Source=Initial`).createInstance(); v.appendChild(a); await setAvatar(a, i, asz); }
    if (cnt==='5+') await overflowChip(v, s, fs);
  } else {
    // existing 5+ (M,S): convert sample avatars, ring on
    v.itemSpacing = gap;
    const avs = v.children.filter(c=>c.type==='INSTANCE');
    for (let i=0;i<avs.length;i++) await setAvatar(avs[i], i, asz);
    const ov = v.findOne(n=>n.name==='overflow'); if (ov) { ov.strokeWeight = 1.5; }
  }
  const ov = v.findOne(n=>n.name==='overflow'); if (ov && kO) ov.componentPropertyReferences = {visible:kO};
}
// grid
const pad=20, gx=32, gy=20; const cols=['2','3','4','5+'], rowsz=['XS','S','M'];
const colW = cols.map(c=>Math.max(...rowsz.map(r=>S.children.find(x=>x.name===`Count=${c}, Size=${r}`).width)));
const rowH = rowsz.map(r=>SIZEMAP[r][1]+4);
let cx=[pad]; for (let k=1;k<cols.length;k++) cx[k]=cx[k-1]+colW[k-1]+gx; let ry=[pad]; for (let r=1;r<rowsz.length;r++) ry[r]=ry[r-1]+rowH[r-1]+gy;
rowsz.forEach((r,ri)=>cols.forEach((c,ci)=>{ const v=S.children.find(x=>x.name===`Count=${c}, Size=${r}`); v.x=cx[ci]; v.y=ry[ri]+(rowH[ri]-v.height)/2; }));
S.resizeWithoutConstraints(cx[3]+colW[3]+pad, ry[2]+rowH[2]+pad);
const stage = S.parent; const A2 = A;
S.x = 130; S.y = A2.y + A2.height + 80;
for (const t of stage.children.filter(n=>n.type==='TEXT' && (n.characters.startsWith('AvatarStack') || n.characters.startsWith('Count=') || ['XS · 20','S · 28','M · 36'].includes(n.characters)))) t.remove();
await axisLabel(stage, 'AvatarStack — 공동 결제의 부담 인원 · 여정 참여자 요약. 최대 4명 + "+N", 흰 테두리(Ring), 겹침 −6(XS·S) / −8(M). 샘플: 준용·민지 = 사진, 태현·수빈 = 기본 이미지', 0, S.y - 50);
for (let k=0;k<4;k++) await axisLabel(stage, 'Count='+cols[k], S.x+cx[k], S.y-24);
for (let r=0;r<3;r++) await axisLabel(stage, rowsz[r]+' · '+SIZEMAP[rowsz[r]][1], S.x-12, S.y+ry[r]+rowH[r]/2-8, {right:true});
fitStage(stage);
out.AvatarStack = {setId:S.id, defaultVariant:S.defaultVariant.name, props:Object.fromEntries(Object.entries(S.componentPropertyDefinitions).map(([k,d])=>[k,d.variantOptions||d.type])), variants:Object.fromEntries(S.children.map(v=>[v.name,v.id]))};
// ---------- AvatarToggle (Input area)
const col4 = node(IDS.c_buttons.body).findOne(n=>n.name==='group/액션 · 입력 컨트롤').findOne(n=>n.name==='columns').children[3];
const oldP = col4.findOne(n=>n.name==='panel/AvatarToggle'); if (oldP) oldP.remove();
const {p, stage:st} = await panel(col4, 'AvatarToggle', '부담 인원 선택(결제 상세 시트·"일부 인원만 참여한 지출"). 프사 + 이름, 탭해서 켜고 끈다. 선택 = 체크 배지 + 선명, 미선택 = 40% 흐림 + 이름 보조색. 여러 명 선택 가능.', 760);
col4.insertChild(col4.children.indexOf(col4.findOne(n=>n.name==='panel/Input'))+1, p);
const items=[];
for (const [k, on] of [[0,'On'],[1,'Off']]) {
  const c = comp(`Selected=${on}`, {layout:'VERTICAL', gap:6, w:56, hugMain:true}); c.counterAxisSizingMode='FIXED'; c.resize(56, c.height); c.counterAxisAlignItems='CENTER';
  const wrap = frame({name:'avatar wrap', w:48, h:48, fill:'none', parent:c}); wrap.clipsContent=false;
  const a = AV('Color=Gray, Size=L, Source=Photo').createInstance(); wrap.appendChild(a); a.x=0; a.y=0; a.name='avatar'; if (on==='Off') a.opacity = 0.4;
  const b = frame({name:'check badge', layout:'HORIZONTAL', justify:'CENTER', align:'CENTER', w:20, h:20, radius:999, parent:wrap, x:31, y:31}); b.fills=[await P('bg/brand')]; await strokeV(b,'bg/surface',2,'OUTSIDE');
  const ic = iconInst('check', 14, b, 'icon'); await iconColor(ic,'icon/inverse'); b.visible = on==='On';
  await T('준용', 'Label/S', on==='On'?'text/primary':'text/tertiary', {parent:c, name:'name'});
  items.push({c, r:0, k}); }
const g = gridSet(items, st, 'AvatarToggle', {ox:0, oy:30, gx:32, pad:20});
const kN = g.set.addComponentProperty('Name','TEXT','준용'); for (const v of g.set.children) v.findOne(n=>n.name==='name').componentPropertyReferences={characters:kN};
['Selected=On','Selected=Off'].forEach((s,i)=>axisLabel(st, s, g.cx[i], 0));
const ex = frame({name:'example', layout:'HORIZONTAL', gap:16, pad:16, hug:'both', parent:st, x:0, y:g.set.y+g.set.height+40, radius:16}); await fillV(ex,'bg/canvas');
for (let i=0;i<4;i++) { const on = i!==2; const ins = g.set.children[on?0:1].createInstance(); ex.appendChild(ins); ins.setProperties({[kN]:SAMPLE[i][0]});
  const a = ins.findOne(n=>n.name==='avatar'); await setAvatar(a, i, 'L', false); a.name='avatar'; }
await axisLabel(st, '↑ 부담 인원 3명 선택(태현 제외). 프사는 avatar(중첩 Avatar)의 Source/Color로, 사진은 photo 레이어 image fill로 교체.', 0, ex.y+ex.height+8);
fitStage(st);
out.AvatarToggle = {setId:g.set.id, props:{Selected:['On','Off']}, defaultVariantId:g.set.defaultVariant.id, variants:Object.fromEntries(g.set.children.map(v=>[v.name,v.id])), textLayer:'name', nested:{avatar:'Avatar (Size=L)'}, propKeys:{Name:kN}};
return out;

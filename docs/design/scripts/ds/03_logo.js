const s1 = S1();
for (const c of [...s1.children]) if (c.name.startsWith('01 · 로고')) c.remove();
function subpaths(d){ return d.split(/(?=M)/).map(s=>s.trim()).filter(Boolean); }
function bbox(s){ const n=s.match(/-?\d+(\.\d+)?/g).map(Number); let xs=[],ys=[]; for(let i=0;i+1<n.length;i+=2){xs.push(n[i]);ys.push(n[i+1]);} return [Math.min(...xs),Math.min(...ys),Math.max(...xs),Math.max(...ys)]; }
const SIZE=100, LS=-7;
// area
const area = frame({name:'01 · 로고 변형', layout:'NONE', fill:'none', w:2560, h:1600, parent:s1, x:120, y:1180});
// --- master outline
async function outline(parent, size, ls) {
  const tx = await text('여정', {family:'Gothic A1', style:'Black', size, letterSpacing:ls, color:'#5B4CF5', parent});
  const ox = tx.x, oy = tx.y;
  const v = figma.flatten([tx], parent);
  const H = v.height, keep=[], bat=[], startRing=[];
  v.vectorPaths.forEach((p,pi)=>{ for (const s of subpaths(p.data)) { const b=bbox(s); if (pi===1 && b[1]>H*0.5) bat.push(s); else { keep.push(s); if (pi===0 && b[0] < H*0.05) startRing.push(s); } } });
  const ring = v.clone(); parent.appendChild(ring);
  v.vectorPaths=[{windingRule:'NONZERO', data:keep.join(' ')}];
  ring.vectorPaths=[{windingRule:'NONZERO', data:bat.join(' ')}];
  v.name='wordmark'; ring.name='destination ㅇ';
  return {v, ring, startRing, bat, H};
}
const out = {};
async function logoComp(name, mainColor, ringColor, x, y) {
  const c = figma.createComponent(); c.name = name; c.fills = []; area.appendChild(c);
  const {v, ring} = await outline(c, SIZE, LS);
  const minx = Math.min(v.x, ring.x), miny = Math.min(v.y, ring.y);
  v.x -= minx; v.y -= miny; ring.x -= minx; ring.y -= miny;
  c.resizeWithoutConstraints(Math.ceil(Math.max(v.x+v.width, ring.x+ring.width)), Math.ceil(Math.max(v.y+v.height, ring.y+ring.height)));
  v.fills=[await P(mainColor)]; ring.fills=[await P(ringColor)];
  for (const n of [v, ring]) n.constraints = {horizontal:'SCALE', vertical:'SCALE'};
  c.x = x; c.y = y; c.clipsContent = false;
  c.description = '「여정」 워드마크 (외곽선 벡터). 크기 조절은 인스턴스를 비율 고정으로 rescale. 받침 ㅇ = 도착점(노을색).';
  out[name] = c.id; return c;
}
const pr = await logoComp('Logo/Primary', 'primary/500', 'brand/accent', 0, 0);
const iv = await logoComp('Logo/Inverse', 'text/inverse', 'brand/accent', 300, 0);
const mo = await logoComp('Logo/Mono', 'neutral/900', 'neutral/900', 600, 0);
out.size = [pr.width, pr.height];
// --- editable text versions (frames, not components)
async function editable(name, mainHex, mainTok, ringTok, bg) {
  const f = frame({name, w:400, h:200, fill: bg || 'none', parent: area, x: 900, y: 0});
  const tx = await text('여정', {family:'Gothic A1', style:'Black', size:SIZE, letterSpacing:LS, color:mainHex, parent:f, name:'wordmark (editable text)'});
  tx.fills=[await P(mainTok)];
  // derive overlay ring from a temporary outline of a clone
  const tmp = tx.clone(); f.appendChild(tmp);
  const fl = figma.flatten([tmp], f);
  const H = fl.height, bat=[];
  fl.vectorPaths.forEach((p,pi)=>{ for (const s of subpaths(p.data)) if (pi===1 && bbox(s)[1]>H*0.5) bat.push(s); });
  fl.vectorPaths=[{windingRule:'NONZERO', data:bat.join(' ')}];
  fl.name='destination ㅇ (overlay)'; fl.fills=[await P(ringTok)]; fl.strokes=[await P(ringTok)]; fl.strokeWeight=0.75;
  f.resizeWithoutConstraints(Math.ceil(tx.width), Math.ceil(tx.height));
  return f;
}
const e1 = await editable('Logo/Primary · 편집용 텍스트', '#5B4CF5', 'primary/500', 'brand/accent');
const e2 = await editable('Logo/Inverse · 편집용 텍스트', '#FFFFFF', 'text/inverse', 'brand/accent');
const e3 = await editable('Logo/Mono · 편집용 텍스트', '#14141E', 'neutral/900', 'neutral/900');
out.editable = [e1.id, e2.id, e3.id];
// --- App icon
const ai = figma.createComponent(); ai.name='Logo/AppIcon'; area.appendChild(ai); ai.resizeWithoutConstraints(1024,1024);
ai.cornerRadius = 229; ai.cornerSmoothing = 0.6; ai.clipsContent = true; await fillV(ai,'primary/500');
{
  const tmpf = frame({w:10,h:10,fill:'none',parent:area});
  const BIG = 540;
  const tx = await text('여정', {family:'Gothic A1', style:'Black', size:BIG, letterSpacing:-38, color:'#FFFFFF', parent:tmpf});
  const v = figma.flatten([tx], tmpf);
  const H = v.height; const start=[], bat=[];
  v.vectorPaths.forEach((p,pi)=>{ for (const s of subpaths(p.data)) { const b=bbox(s); if (pi===1 && b[1]>H*0.5) bat.push(s); if (pi===0 && b[0] < 5) start.push(s); } });
  const r1 = v.clone(); ai.appendChild(r1); r1.vectorPaths=[{windingRule:'NONZERO', data:start.join(' ')}]; r1.name='start ㅇ'; r1.fills=[await P('text/inverse')];
  const r2 = v.clone(); ai.appendChild(r2); r2.vectorPaths=[{windingRule:'NONZERO', data:bat.join(' ')}]; r2.name='destination ㅇ'; r2.fills=[await P('brand/accent')];
  tmpf.remove();
  out.ringSizes = [r1.width, r1.height, r2.width, r2.height];
  const W1=r1.width,H1=r1.height,W2=r2.width,H2=r2.height;
  // layout: start ring upper-left, destination lower-right, total box centered
  const dx = 150, gapY = 70;
  const totalW = Math.max(W1, dx + W2 + 20) , totalH = H1 + gapY + H2;
  const ox = (1024 - (dx + W2 + 40)) / 2 - 10, oy = (1024 - totalH) / 2;
  r1.x = ox; r1.y = oy; r2.x = ox + dx + 40; r2.y = oy + H1 + gapY;
  const p = figma.createVector(); ai.appendChild(p); p.name='route';
  const sx = r1.x + W1 + 34, sy = r1.y + H1*0.42, ex = r2.x + W2*0.5, ey = r2.y - 46;
  p.vectorPaths=[{windingRule:'NONE', data:`M ${sx} ${sy} C ${sx+130} ${sy+10} ${ex+40} ${sy+120} ${ex} ${ey}`}];
  p.fills=[]; p.strokes=[await P('text/inverse', 0.7)]; p.strokeWeight=32; p.strokeCap='ROUND'; p.dashPattern=[0.01, 62];
  for (const n of [r1,r2,p]) n.constraints={horizontal:'SCALE', vertical:'SCALE'};
}
ai.description = '앱 아이콘 1024×1024 (corner 229, smoothing 60%). 축약 마크 = 여의 ㅇ(출발, 흰색) → 점선 경로 → 정의 받침 ㅇ(도착, 노을색).';
ai.x = 0; ai.y = 300;
out['Logo/AppIcon'] = ai.id;
return out;

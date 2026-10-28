const s1 = S1();
const area = s1.findOne(n=>n.name==='01 · 로고 변형' && n.parent===s1);
const L = IDS.logo;
function subpaths(d){ return d.split(/(?=M)/).map(s=>s.trim()).filter(Boolean); }
function bbox(s){ const n=s.match(/-?\d+(\.\d+)?/g).map(Number); let xs=[],ys=[]; for(let i=0;i+1<n.length;i+=2){xs.push(n[i]);ys.push(n[i+1]);} return [Math.min(...xs),Math.min(...ys),Math.max(...xs),Math.max(...ys)]; }
// ---- fix app icon start ring (outer + inner contour)
const ai = node(L['Logo/AppIcon']);
{
  const r1 = ai.findOne(n=>n.name==='start ㅇ'); const x0=r1.x, y0=r1.y, w0=r1.width;
  const tmpf = frame({w:10,h:10,fill:'none',parent:area});
  const tx = await text('여정', {family:'Gothic A1', style:'Black', size:540, letterSpacing:-38, color:'#FFFFFF', parent:tmpf});
  const v = figma.flatten([tx], tmpf);
  const subs = subpaths(v.vectorPaths[0].data).map(s=>({s,b:bbox(s)}));
  const outer = subs.find(o=>o.b[0]<5);
  const ring = subs.filter(o=>o.b[0]>=outer.b[0]-1 && o.b[2]<=outer.b[2]+1 && o.b[1]>=outer.b[1]-1 && o.b[3]<=outer.b[3]+1);
  r1.vectorPaths=[{windingRule:'NONZERO', data: ring.map(o=>o.s).join(' ')}];
  r1.x = x0; r1.y = y0; tmpf.remove();
}
for (const c of [...area.children]) if (!Object.values(L).flat().includes(c.id)) c.remove();
area.layoutMode='NONE';
// ---- block head
const head = frame({name:'head', layout:'VERTICAL', gap:8, fill:'none', hug:'both', parent:area, x:0, y:0});
await eyebrow('LOGO', head);
await T('로고', 'Display', 'text/primary', {parent:head});
await T('「여정」의 두 ㅇ — 첫 글자의 ㅇ은 출발점, 마지막 받침 ㅇ은 노을빛 도착점. Gothic A1 Black을 기반으로 자간을 -7%로 조여 한 덩어리로 읽히게 했다. 라틴 보조 표기(yeojeong)는 로고에 넣지 않는다: 한글 두 글자가 가장 강한 식별자이고, 로마자 표기는 발음이 직관적이지 않다.', 'Body/L', 'text/secondary', {parent:head, width:1500});
async function pcard(name, x, y, w, h, bgTok, label, labelTok='text/secondary') {
  const c = frame({name, w, h, parent:area, x, y, radius:24}); await fillV(c, bgTok);
  if (bgTok==='bg/surface') await strokeV(c,'border/default',1,'INSIDE');
  const lt = await T(label, 'Label/M', labelTok, {parent:c}); lt.x = 32; lt.y = 28;
  return c;
}
const Y1 = 220, CW = 826, CH = 380;
const cards = [['Logo/Primary', 'bg/surface', 'Logo/Primary · 기본 (흰 배경)', 'text/secondary'], ['Logo/Inverse', 'bg/brand', 'Logo/Inverse · 반전 (프라이머리 배경)', 'text/inverse'], ['Logo/Mono', 'bg/subtle', 'Logo/Mono · 단색 (흑백 인쇄·도장)', 'text/secondary']];
for (let i=0;i<3;i++) {
  const [k,bg,lab,lt] = cards[i];
  const c = await pcard('card/'+k, i*(CW+41), Y1, CW, CH, bg, lab, lt);
  const comp = node(L[k]); c.appendChild(comp);
  comp.x = Math.round((CW-comp.width)/2); comp.y = Math.round((CH-comp.height)/2)+10;
  const cap = await T('컴포넌트 · 외곽선 벡터 (179×96)', 'Caption', i===1?'text/inverse':'text/tertiary', {parent:c}); cap.x=32; cap.y=CH-44;
}
// ---- lockup components (variants)
const Y2 = Y1 + CH + 40;
const lockCard = await pcard('card/Logo/Lockup', 0, Y2, 1240, 420, 'bg/surface', 'Logo/Lockup · 태그라인 결합형');
const lh = figma.createComponent(); lh.name='Layout=Horizontal'; lh.layoutMode='HORIZONTAL'; lh.itemSpacing=24; lh.counterAxisAlignItems='CENTER'; lh.primaryAxisSizingMode='AUTO'; lh.counterAxisSizingMode='AUTO'; lh.fills=[];
{ const i = node(L['Logo/Primary']).createInstance(); lh.appendChild(i); i.rescale(0.75); i.name='logo';
  const d = rect({w:2,h:56,parent:lh,name:'divider'}); await fillV(d,'border/strong');
  const tg = await T('함께 쓰고, 정확히 나누는\n여행 공동 지갑', 'Body/L Strong', 'text/secondary', {parent:lh, name:'tagline'}); tg.fontSize=20; tg.lineHeight={unit:'PIXELS',value:28}; }
const lv = figma.createComponent(); lv.name='Layout=Vertical'; lv.layoutMode='VERTICAL'; lv.itemSpacing=16; lv.counterAxisAlignItems='CENTER'; lv.primaryAxisSizingMode='AUTO'; lv.counterAxisSizingMode='AUTO'; lv.fills=[];
{ const i = node(L['Logo/Primary']).createInstance(); lv.appendChild(i); i.name='logo';
  await T('함께 쓰고, 정확히 나누는 여행 공동 지갑', 'Body/M Strong', 'text/secondary', {parent:lv, name:'tagline'}); }
lockCard.appendChild(lh); lockCard.appendChild(lv);
const lset = figma.combineAsVariants([lh, lv], lockCard); lset.name='Logo/Lockup';
lset.layoutMode='HORIZONTAL'; lset.itemSpacing=96; lset.counterAxisAlignItems='CENTER'; lset.primaryAxisSizingMode='AUTO'; lset.counterAxisSizingMode='AUTO'; lset.paddingLeft=lset.paddingRight=lset.paddingTop=lset.paddingBottom=24; lset.fills=[];
lset.x = Math.round((1240 - lset.width)/2); lset.y = Math.round((420 - lset.height)/2)+10;
lset.description = '태그라인 결합형. Horizontal = 웹 헤더·문서, Vertical = 스플래시·온보딩.';
// ---- editable text card
const edCard = await pcard('card/Logo/Editable', 1281, Y2, 1279, 420, 'bg/surface', '편집용 원본 · 라이브 텍스트 (Gothic A1 Black 100 / 자간 -7) + 받침 ㅇ 오버레이');
const eds = L.editable.map(id=>node(id));
const bgs = [null, 'bg/brand', null];
for (let i=0;i<3;i++) {
  const holder = frame({name:'holder', w:360, h:240, parent:edCard, radius:16, x: 32 + i*(360+40) , y: 110}); await fillV(holder, bgs[i] || 'bg/canvas');
  holder.appendChild(eds[i]); eds[i].x = Math.round((360-eds[i].width)/2); eds[i].y = Math.round((240-eds[i].height)/2);
}
const ecap = await T('폰트·자간을 바꿔 실험할 때만 사용. 실제 화면에는 위 외곽선 벡터 컴포넌트를 인스턴스로 쓴다.', 'Caption', 'text/tertiary', {parent:edCard}); ecap.x = 32; ecap.y = 370;
// ---- app icon card
const Y3 = Y2 + 420 + 40;
const aiCard = await pcard('card/Logo/AppIcon', 0, Y3, 1240, 1420, 'bg/surface', 'Logo/AppIcon · 1024×1024 · 모서리 229 (스무딩 60%)');
aiCard.appendChild(ai); ai.x = 108; ai.y = 96;
const prev = frame({name:'previews', layout:'HORIZONTAL', gap:40, align:'MAX', fill:'none', hug:'both', parent:aiCard, x:108, y:1170});
for (const sz of [180, 120, 87, 60, 40]) {
  const col = frame({name:'p'+sz, layout:'VERTICAL', gap:10, align:'CENTER', fill:'none', hug:'both', parent:prev});
  const inst = ai.createInstance(); col.appendChild(inst); inst.rescale(sz/1024);
  await T(sz+'px', 'Caption', 'text/tertiary', {parent:col});
}
const aicap = await T('축약 마크: 여의 ㅇ(출발·흰색) → 점선 경로 → 정의 받침 ㅇ(도착·노을색). 워드마크가 들어가기 좁은 곳(앱 아이콘·파비콘·프로필)에 쓴다.', 'Body/S', 'text/secondary', {parent:aiCard, width:1024}); aicap.x=108; aicap.y=1360;
// ---- clear space card
const csCard = await pcard('card/Logo/ClearSpace', 1281, Y3, 1279, 700, 'bg/surface', '여백(Clear space) — X = 받침 ㅇ의 높이');
{
  const k = 2.4; const inst = node(L['Logo/Primary']).createInstance(); inst.rescale(k);
  const X = Math.round(39.4 * k);
  const W = inst.width, H = inst.height;
  const ox = Math.round((1279 - W)/2), oy = Math.round((700 - H)/2) + 20;
  const zone = rect({w: W + 2*X, h: H + 2*X, parent: csCard, x: ox - X, y: oy - X, name:'clear-zone'}); await fillV(zone,'primary/50'); zone.strokes=[await P('primary/300')]; zone.dashPattern=[8,6]; zone.strokeWeight=2;
  const inner = rect({w: W, h: H, parent: csCard, x: ox, y: oy, name:'logo-box', fill:'none'}); inner.strokes=[await P('primary/300')]; inner.strokeWeight=1; inner.dashPattern=[4,4];
  csCard.appendChild(inst); inst.x = ox; inst.y = oy;
  // X markers
  async function marker(x, y, w, h, label) { const m = rect({w, h, parent: csCard, x, y, name:'X'}); await fillV(m,'brand/accent', 0.35); const t = await T(label, 'Label/S', 'amount/send', {parent: csCard}); t.x = x + w/2 - t.width/2; t.y = y + h/2 - t.height/2; }
  await marker(ox - X, oy + H/2 - 14, X, 28, 'X');
  await marker(ox + W, oy + H/2 - 14, X, 28, 'X');
  await marker(ox + W/2 - 20, oy - X, 40, X, 'X');
  await marker(ox + W/2 - 20, oy + H, 40, X, 'X');
  const note = await T('로고 사방으로 최소 X만큼 비운다. 이 영역 안에는 텍스트·아이콘·다른 로고를 두지 않는다.', 'Body/S', 'text/secondary', {parent: csCard, width: 1100}); note.x = 32; note.y = 640;
}
// ---- min size card
const msCard = await pcard('card/Logo/MinSize', 1281, Y3 + 740, 1279, 680, 'bg/surface', '최소 크기');
{
  const row = frame({name:'wordmark sizes', layout:'HORIZONTAL', gap:56, align:'MAX', fill:'none', hug:'both', parent:msCard, x:32, y:110});
  for (const h of [64, 40, 28, 20]) {
    const col = frame({name:'h'+h, layout:'VERTICAL', gap:12, fill:'none', hug:'both', parent:row});
    const i = node(L['Logo/Primary']).createInstance(); col.appendChild(i); i.rescale(h/96);
    await T(h===20 ? '20px · 최소' : h+'px', 'Caption', h===20 ? 'amount/send' : 'text/tertiary', {parent:col});
  }
  const row2 = frame({name:'mark sizes', layout:'HORIZONTAL', gap:56, align:'MAX', fill:'none', hug:'both', parent:msCard, x:32, y:330});
  for (const sz of [64, 40, 24]) {
    const col = frame({name:'m'+sz, layout:'VERTICAL', gap:12, fill:'none', hug:'both', parent:row2});
    const i = ai.createInstance(); col.appendChild(i); i.rescale(sz/1024);
    await T(sz===24 ? '24px · 최소' : sz+'px', 'Caption', sz===24 ? 'amount/send' : 'text/tertiary', {parent:col});
  }
  const note = await T('워드마크: 화면 높이 20px / 인쇄 6mm 이상. 이보다 작으면 받침 ㅇ의 구멍이 뭉개지므로 축약 마크(앱 아이콘)를 쓴다.\n축약 마크: 24px 이상. 파비콘(16px)은 점선 경로를 빼고 두 ㅇ만 남긴 별도 그래픽으로 제작한다.', 'Body/S', 'text/secondary', {parent: msCard, width: 1200}); note.x = 32; note.y = 520;
}
area.resizeWithoutConstraints(2560, Y3 + 1420);
return {lockupSet: lset.id, lockupH: lh.id, lockupV: lv.id, areaH: area.height};

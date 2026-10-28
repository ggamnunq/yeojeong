const s2 = S2();
const fw = node(IDS.icons.foundations);
const body = fw.findOne(n=>n.name==='body');
const R = n => body.findOne(x=>x.name===n);
for (const n of ['row/color','row/type-space-radius','row/elevation-layout']) for (const c of [...R(n).children]) c.remove();
async function head(c, eb, title, desc, w) { await eyebrow(eb, c); await T(title, 'Heading/H1', 'text/primary', {parent:c}); if (desc) await T(desc, 'Body/M', 'text/secondary', {parent:c, width:w}); }
// ---- color variables
{
  const c = card(R('row/color'), {name:'Color variables', w:5160, gap:28});
  await head(c, 'VARIABLES · 여정/Color (mode: Light)', '컬러 변수', '원색 스케일(primary/neutral/sunset/semantic) → 역할 토큰(alias). 컴포넌트는 역할 토큰에만 바인딩한다. Paint style도 「여정/이름」으로 동일하게 존재.', 3000);
  const pal = frame({name:'palette', layout:'HORIZONTAL', gap:40, fill:'none', hug:'both', parent:c}); pal.layoutWrap='WRAP'; pal.counterAxisSpacing=24; pal.resize(5064, 10); pal.primaryAxisSizingMode='FIXED';
  for (const [g, sc] of Object.entries(TOK.palette)) {
    const col = frame({name:g, layout:'VERTICAL', gap:8, fill:'none', hug:'both', parent:pal});
    await T(g, 'Label/M', 'text/primary', {parent:col});
    const strip = frame({name:'strip', layout:'HORIZONTAL', gap:0, fill:'none', hug:'both', parent:col, radius:10, clip:true});
    for (const [k, hex] of Object.entries(sc)) {
      const sw = frame({name:g+'/'+k, layout:'VERTICAL', w:64, h:64, pad:6, justify:'MAX', parent:strip}); await fillV(sw, g+'/'+k);
      await T(k, 'Label/S', crHex(hex,'#FFFFFF')>=3?'text/inverse':'text/primary', {parent:sw});
    }
  }
  const grid = frame({name:'roles', layout:'HORIZONTAL', gap:8, fill:'none', hug:'v', w:5064, parent:c}); grid.layoutWrap='WRAP'; grid.counterAxisSpacing=8;
  for (const r of TOK.roles) {
    const it = frame({name:r.name, layout:'HORIZONTAL', gap:10, pad:[8,10,8,8], w:246, hug:'v', align:'CENTER', radius:10, parent:grid}); await fillV(it,'bg/canvas');
    const sw = frame({name:'sw', w:28, h:28, radius:8, parent:it}); await fillV(sw, r.name); await strokeV(sw,'border/default',1,'INSIDE');
    const tx = frame({name:'t', layout:'VERTICAL', gap:0, fill:'none', hug:'both', parent:it});
    await T(r.name, 'Label/S', 'text/primary', {parent:tx});
    const hx = await text(r.hex + (r.alpha!=null?' @'+Math.round(r.alpha*100)+'%':''), {family:'Archivo', style:'Medium', size:11, color:'#70707E', parent:tx}); hx.fills=[await P('text/tertiary')];
  }
}
// ---- type
{
  const c = card(R('row/type-space-radius'), {name:'Type styles', w:2540, gap:16});
  await head(c, 'TEXT STYLES', '타입 스케일', 'Noto Sans KR(한글) + Archivo(금액). 줄간격은 px 고정.', 2400);
  for (const [name, d] of Object.entries(TYPE)) {
    const r = frame({name:'t/'+name, layout:'HORIZONTAL', gap:24, fill:'none', hug:'v', w:2444, parent:c, align:'CENTER'});
    const m = frame({name:'m', layout:'VERTICAL', gap:0, fill:'none', hug:'v', w:300, parent:r});
    await T(name, 'Label/M', 'text/brand', {parent:m}); await T(`${d.s} ${d.size}/${d.lh} · ${d.ls}`, 'Caption', 'text/tertiary', {parent:m});
    await T(name.startsWith('Amount') ? '₩1,284,000' : '오사카 3박 4일 · ₩1,284,000', name, 'text/primary', {parent:r});
  }
}
// ---- spacing
{
  const c = card(R('row/type-space-radius'), {name:'Spacing', w:1270, gap:14});
  await head(c, 'VARIABLES · 여정/Size › space', '간격 (4px 기반)', '여백·gap은 이 값만. 화면 좌우 여백 20, 카드 안쪽 16~20, 섹션 사이 24~32.', 1170);
  for (const [k, v] of Object.entries(TOK.size.space)) {
    if (v===0) continue;
    const r = frame({name:'space/'+k, layout:'HORIZONTAL', gap:16, fill:'none', hug:'both', parent:c, align:'CENTER'});
    const lb = await T('space/'+k, 'Label/M', 'text/primary', {parent:r}); lb.textAutoResize='NONE'; lb.resize(120, 20);
    const bar = rect({w:Math.max(v,2)*8, h:24, parent:r, radius:4}); await fillV(bar,'primary/300');
    await T(v+'px', 'Caption', 'text/tertiary', {parent:r});
  }
  const note = await T('막대 길이 = 값 × 8 (시각화 배율)', 'Caption', 'text/tertiary', {parent:c});
}
// ---- radius
{
  const c = card(R('row/type-space-radius'), {name:'Radius', w:1270, gap:20});
  await head(c, 'VARIABLES · 여정/Size › radius', '라운드', '', 1170);
  const g = frame({name:'g', layout:'HORIZONTAL', gap:24, fill:'none', hug:'v', w:1174, parent:c}); g.layoutWrap='WRAP'; g.counterAxisSpacing=24;
  const use = {xs:'체크박스·작은 배지', sm:'칩·태그·아바타 링', md:'버튼·입력창', lg:'카드·리스트 그룹', xl:'통계 카드·다이얼로그', '2xl':'바텀시트 상단', full:'pill·아바타·세그먼트'};
  for (const [k, v] of Object.entries(TOK.size.radius)) {
    const col = frame({name:'radius/'+k, layout:'VERTICAL', gap:8, fill:'none', hug:'v', w:150, parent:c===null?null:g});
    const b = frame({name:'box', w:112, h:112, parent:col}); await fillV(b,'primary/50'); await strokeV(b,'primary/300',2,'INSIDE'); await bindRadius(b,'radius/'+k);
    await T('radius/'+k+' · '+(v===999?'999':v), 'Label/M', 'text/primary', {parent:col});
    await T(use[k], 'Caption', 'text/tertiary', {parent:col, width:150});
  }
}
// ---- elevation
{
  const c = card(R('row/elevation-layout'), {name:'Elevation', w:2540, gap:24});
  await head(c, 'EFFECT STYLES', '그림자 (Elevation)', '그림자는 3단계만. 평면 리스트는 그림자 대신 border/default 1px.', 2400);
  const g = frame({name:'g', layout:'HORIZONTAL', gap:40, pad:[24,24,40,24], hug:'v', w:2444, parent:c, radius:20}); await fillV(g,'bg/canvas');
  const es = {}; for (const s of await figma.getLocalEffectStylesAsync()) es[s.name]=s;
  for (const [name, desc] of [['Elevation/1','카드·리스트 그룹'],['Elevation/2','드롭다운·토스트·FAB'],['Elevation/3','바텀시트·다이얼로그'],['Focus/Ring','입력·버튼 포커스']]) {
    const b = frame({name, layout:'VERTICAL', gap:6, pad:24, w:560, h:200, radius:16, parent:g, justify:'MAX'}); await fillV(b,'bg/surface');
    try { await b.setEffectStyleIdAsync(es[name].id); } catch(e) { b.effectStyleId = es[name].id; }
    if (name==='Focus/Ring') await strokeV(b,'border/focus',1.5,'INSIDE');
    await T(name, 'Label/L', 'text/primary', {parent:b}); await T(desc + ' · ' + es[name].description.split('—')[1], 'Caption', 'text/tertiary', {parent:b, width:512});
  }
}
// ---- layout
{
  const c = card(R('row/elevation-layout'), {name:'Layout', w:2580, gap:24});
  await head(c, 'VARIABLES · 여정/Size › layout', '레이아웃', '기준 프레임 390×844 (모바일 웹). 좌우 거터 20, 상단 헤더 56, 하단 내비 64(+ 안전영역), 터치 영역 최소 44.', 2480);
  const g = frame({name:'diagram', layout:'HORIZONTAL', gap:48, fill:'none', hug:'both', parent:c, align:'MIN'});
  const scr = frame({name:'screen 390', w:390, h:520, radius:24, parent:g, clip:true}); await fillV(scr,'bg/canvas'); await strokeV(scr,'border/strong',1,'INSIDE');
  const hd = rect({w:390, h:56, parent:scr, x:0, y:0, name:'header 56'}); await fillV(hd,'primary/100');
  const nv = rect({w:390, h:64, parent:scr, x:0, y:456, name:'nav 64'}); await fillV(nv,'primary/100');
  const gl = rect({w:20, h:400, parent:scr, x:0, y:56, name:'gutter L'}); await fillV(gl,'sunset/100');
  const gr = rect({w:20, h:400, parent:scr, x:370, y:56, name:'gutter R'}); await fillV(gr,'sunset/100');
  const cd = rect({w:350, h:120, parent:scr, x:20, y:80, radius:16, name:'card'}); await fillV(cd,'bg/surface');
  const cd2 = rect({w:350, h:200, parent:scr, x:20, y:216, radius:16, name:'card'}); await fillV(cd2,'bg/surface');
  const lb = async (t, x, y) => { const n = await T(t, 'Label/S', 'text/brand', {parent:scr}); n.x=x; n.y=y; };
  await lb('header 56', 150, 18); await lb('nav 64 + safe area', 130, 478); 
  const leg = frame({name:'legend', layout:'VERTICAL', gap:12, fill:'none', hug:'both', parent:g});
  for (const [k,v] of Object.entries(TOK.size.layout)) { const r = frame({name:k, layout:'HORIZONTAL', gap:12, fill:'none', hug:'both', parent:leg}); const a = await T('layout/'+k, 'Label/M', 'text/primary', {parent:r}); a.textAutoResize='NONE'; a.resize(220,20); await T(v+'px', 'Body/M', 'text/secondary', {parent:r}); }
  await T('주황 = 거터(20) · 보라 = 헤더/내비', 'Caption', 'text/tertiary', {parent:leg});
}
return {ok:true, h: fw.height};

const s2 = S2();
for (const c of [...s2.children]) if (c.name==='02 · Components') c.remove();
const fw = node(IDS.icons.foundations);
const {wrap, body} = await block(s2, {name:'02 · Components', x:120, y:fw.y+fw.height+160, w:5160, eyebrow:'COMPONENTS', title:'Components', desc:'모든 컴포넌트는 figma.createComponent + combineAsVariants, 오토레이아웃, 색은 역할 토큰 변수에 바인딩. 보라 점선 박스가 컴포넌트 세트다. 노드 ID와 속성은 ds/components.json 참고.', bodyLayout:'HORIZONTAL', wrap:true, gap:40});
const out = {};
// ---------- Button
{
  const {p, stage} = await panel(body, 'Button', '화면의 주요 행동. 한 화면에 Primary는 하나(하단 CTA L). 보조 행동은 Secondary, 텍스트형 링크는 Ghost, 삭제·나가기·강퇴는 Danger. 아이콘은 `Leading icon` 토글 + `Icon` 교체.', 1150);
  const TY = { Primary:{bg:'bg/brand', bgP:'bg/brand-pressed', fg:'text/inverse'}, Secondary:{bg:'bg/surface', bgP:'bg/pressed', fg:'text/primary', st:'border/strong'}, Ghost:{bg:null, bgP:'bg/brand-subtle', fg:'text/brand'}, Danger:{bg:'bg/danger', bgP:'bg/danger-pressed', fg:'text/inverse'} };
  const SZ = { L:{h:56, px:'space/20', pxv:20, r:'radius/md', ts:'Label/L', ic:20, gap:8}, M:{h:48, px:'space/16', pxv:16, r:'radius/md', ts:'Label/L', ic:20, gap:6}, S:{h:36, px:'space/12', pxv:12, r:'radius/sm', ts:'Label/M', ic:16, gap:4} };
  const ST = ['Default','Pressed','Disabled'];
  const items = []; let r = 0;
  for (const [tn, t] of Object.entries(TY)) for (const [sn, s] of Object.entries(SZ)) { ST.forEach(async ()=>{}); 
    for (let k=0;k<3;k++) { const st = ST[k];
      const c = comp(`Type=${tn}, Size=${sn}, State=${st}`, {layout:'HORIZONTAL', gap:s.gap, pad:[0,s.pxv,0,s.pxv], justify:'CENTER', h:s.h});
      c.counterAxisSizingMode='FIXED'; c.resize(c.width, s.h);
      await bindPad(c, null, s.px, null, s.px); await bindRadius(c, s.r);
      let bg = st==='Pressed' ? t.bgP : t.bg, fg = t.fg, stroke = t.st;
      if (st==='Disabled') { bg = tn==='Ghost' ? null : (tn==='Secondary' ? 'bg/subtle' : 'bg/muted'); fg = 'text/disabled'; stroke = tn==='Secondary' ? 'border/default' : null; }
      c.fills = bg ? [await P(bg)] : [];
      if (stroke) await strokeV(c, stroke, 1, 'INSIDE');
      const ic = iconInst('plus', s.ic, c, 'icon'); await iconColor(ic, fg.replace('text/','icon/').replace('icon/primary','icon/default').replace('icon/disabled','icon/disabled')); ic.visible = false;
      await T('여정 시작하기', s.ts, fg, {parent:c, name:'label'});
      items.push({c, r, k});
    }
    r++;
  }
  const g = gridSet(items, stage, 'Button', {ox:150, oy:30, gy:16, gx:32});
  const set = g.set;
  const kL = set.addComponentProperty('Label', 'TEXT', '여정 시작하기');
  const kI = set.addComponentProperty('Leading icon', 'BOOLEAN', false);
  const kS = set.addComponentProperty('Icon', 'INSTANCE_SWAP', IDS.icons.comp['plus']);
  for (const v of set.children) { v.findOne(n=>n.name==='label').componentPropertyReferences = {characters:kL}; v.findOne(n=>n.name==='icon').componentPropertyReferences = {visible:kI, mainComponent:kS}; }
  ['Default','Pressed','Disabled'].forEach((s,k)=>axisLabel(stage, s, 150 + g.cx[k], 0));
  let ri = 0; for (const tn of Object.keys(TY)) for (const sn of Object.keys(SZ)) { await axisLabel(stage, tn+' · '+sn, 136, 30 + g.ry[ri] + g.rowH[ri]/2 - 8, {right:true}); ri++; }
  // examples
  const ex = frame({name:'examples', layout:'VERTICAL', gap:12, fill:'none', hug:'both', parent:stage, x:0, y:set.y+set.height+40});
  await T('사용 예 — 아이콘 옵션 · 전체 너비', 'Label/M', 'text/secondary', {parent:ex});
  const exr = frame({name:'row', layout:'HORIZONTAL', gap:12, fill:'none', hug:'both', parent:ex, align:'CENTER'});
  const def = set.children.find(v=>v.name==='Type=Primary, Size=M, State=Default');
  const a = def.createInstance(); exr.appendChild(a); a.setProperties({[kI]:true, [kL]:'결제 추가'});
  const b = set.children.find(v=>v.name==='Type=Secondary, Size=M, State=Default').createInstance(); exr.appendChild(b); b.setProperties({[kI]:true, [kL]:'초대코드 복사', [kS]:IDS.icons.comp['copy']});
  const c2 = set.children.find(v=>v.name==='Type=Ghost, Size=S, State=Default').createInstance(); exr.appendChild(c2); c2.setProperties({[kL]:'전체 보기'});
  const full = set.children.find(v=>v.name==='Type=Primary, Size=L, State=Default').createInstance(); ex.appendChild(full); full.layoutAlign='INHERIT'; full.primaryAxisSizingMode='FIXED'; full.resize(350, 56); full.setProperties({[kL]:'여정 시작'});
  await T('↑ 하단 CTA: 인스턴스 너비를 컨테이너에 맞춰 늘린다(350 = 390 − 거터 20×2)', 'Caption', 'text/tertiary', {parent:ex});
  fitStage(stage);
  out.Button = {setId:set.id, props:{Type:Object.keys(TY), Size:Object.keys(SZ), State:ST}, defaultVariantId:set.defaultVariant.id, textLayer:'label', iconLayer:'icon', propKeys:{Label:kL, 'Leading icon':kI, Icon:kS}};
}
// ---------- IconButton
{
  const {p, stage} = await panel(body, 'IconButton', '아이콘만 있는 버튼. 헤더의 지갑·마이, 시트 닫기, 복사 등. Ghost가 기본, Filled는 떠 있는 추가 버튼, Outline은 카드 안 보조 행동. 접근성 라벨은 개발 시 aria-label로.', 950);
  const TY = { Ghost:{bg:null, bgP:'bg/pressed', ic:'icon/default'}, Outline:{bg:'bg/surface', bgP:'bg/pressed', ic:'icon/default', st:'border/default'}, Filled:{bg:'bg/brand', bgP:'bg/brand-pressed', ic:'icon/inverse'} };
  const SZ = { L:{s:48, ic:24}, M:{s:40, ic:24}, S:{s:32, ic:20} };
  const ST = ['Default','Pressed','Disabled']; const items=[]; let r=0;
  for (const [tn,t] of Object.entries(TY)) for (const [sn,s] of Object.entries(SZ)) { for (let k=0;k<3;k++) { const st=ST[k];
    const c = comp(`Type=${tn}, Size=${sn}, State=${st}`, {layout:'HORIZONTAL', justify:'CENTER', w:s.s, h:s.s, hugMain:false}); c.counterAxisSizingMode='FIXED'; c.resize(s.s,s.s);
    await bindRadius(c,'radius/full');
    let bg = st==='Pressed'?t.bgP:t.bg, ic=t.ic, stroke=t.st;
    if (st==='Disabled') { bg = tn==='Filled'?'bg/muted':(tn==='Outline'?'bg/subtle':null); ic='icon/disabled'; }
    c.fills = bg?[await P(bg)]:[]; if (stroke) await strokeV(c, stroke, 1, 'INSIDE');
    const i = iconInst('wallet', s.ic, c, 'icon'); await iconColor(i, ic);
    items.push({c, r, k}); } r++; }
  const g = gridSet(items, stage, 'IconButton', {ox:130, oy:30, gy:16, gx:40, colW:48, vcenter:true});
  const kS = g.set.addComponentProperty('Icon', 'INSTANCE_SWAP', IDS.icons.comp['wallet']);
  for (const v of g.set.children) v.findOne(n=>n.name==='icon').componentPropertyReferences = {mainComponent:kS};
  ST.forEach((s,k)=>axisLabel(stage, s, 130+g.cx[k], 0));
  let ri=0; for (const tn of Object.keys(TY)) for (const sn of Object.keys(SZ)) { await axisLabel(stage, tn+' · '+sn, 116, 30+g.ry[ri]+g.rowH[ri]/2-8, {right:true}); ri++; }
  fitStage(stage);
  out.IconButton = {setId:g.set.id, props:{Type:Object.keys(TY), Size:Object.keys(SZ), State:ST}, defaultVariantId:g.set.defaultVariant.id, iconLayer:'icon', propKeys:{Icon:kS}};
}
// ---------- Kakao login
{
  const {p, stage} = await panel(body, 'KakaoLoginButton', '로그인 화면 전용(소셜 로그인 1개). 카카오 디자인 가이드 준수: 배경 #FEE500, 라벨 #000000 85%, 모서리 12, 심볼 + "카카오 로그인". 브랜드 외부 색이라 토큰이 아닌 고정 HEX.', 900);
  const items=[]; const SZ={L:56, M:48}; let r=0;
  for (const [sn,h] of Object.entries(SZ)) { ['Default','Pressed'].forEach(()=>{});
    for (let k=0;k<2;k++) { const st=['Default','Pressed'][k];
      const c = comp(`Size=${sn}, State=${st}`, {layout:'HORIZONTAL', gap:8, justify:'CENTER', w:350, h, hugMain:false, radius:12}); c.counterAxisSizingMode='FIXED'; c.resize(350,h);
      c.fills=[solid(st==='Pressed'?'#EDD500':'#FEE500')];
      const sym = node(IDS.icons.comp.kakao).createInstance(); c.appendChild(sym); sym.resize(sn==='L'?24:20, sn==='L'?24:20); sym.name='symbol';
      const t = await T('카카오 로그인', sn==='L'?'Body/L Strong':'Body/M Strong', 'text/primary', {parent:c, name:'label'}); t.fills=[solid('#000000', 0.85)];
      items.push({c, r, k}); } r++; }
  const g = gridSet(items, stage, 'KakaoLoginButton', {ox:60, oy:30, gy:16, gx:24});
  const kL = g.set.addComponentProperty('Label', 'TEXT', '카카오 로그인');
  for (const v of g.set.children) v.findOne(n=>n.name==='label').componentPropertyReferences={characters:kL};
  ['Default','Pressed'].forEach((s,k)=>axisLabel(stage, s, 60+g.cx[k], 0));
  for (let i=0;i<2;i++) await axisLabel(stage, ['L','M'][i], 46, 30+g.ry[i]+g.rowH[i]/2-8, {right:true});
  const note = await T('너비는 화면 폭에 맞춰 늘려 쓴다(기본 350). 심볼은 Icons8 kakaotalk 컬러 PNG.', 'Caption', 'text/tertiary', {parent:stage}); note.x=60; note.y=g.set.y+g.set.height+16;
  fitStage(stage);
  out.KakaoLoginButton = {setId:g.set.id, props:{Size:['L','M'], State:['Default','Pressed']}, defaultVariantId:g.set.defaultVariant.id, textLayer:'label', iconLayer:'symbol', propKeys:{Label:kL}};
}
out.componentsWrap = wrap.id; out.body = body.id;
return out;

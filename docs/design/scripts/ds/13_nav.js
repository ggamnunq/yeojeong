const body = node(IDS.c_buttons.body);
const out = {};
const es = {}; for (const s of await figma.getLocalEffectStylesAsync()) es[s.name]=s;
async function eff(n, name) { try { await n.setEffectStyleIdAsync(es[name].id); } catch(e) { n.effectStyleId = es[name].id; } }
// fix segmented panel width
{ const p = body.findOne(n=>n.name==='panel/SegmentedControl'); p.resize(1340, p.height); const st = p.findOne(n=>n.name==='stage'); st.resizeWithoutConstraints(1260, st.height); p.findOne(n=>n.name==='usage').resize(1260, 20); p.findOne(n=>n.name==='usage').textAutoResize='HEIGHT'; }
// ---------- Avatar
const AV = {Violet:['primary/100','primary/700'], Sunset:['sunset/100','sunset/700'], Green:['success/50','success/700'], Blue:['info/50','info/700'], Amber:['warning/50','warning/700'], Gray:['neutral/200','neutral/700']};
{
  const {p, stage} = await panel(body, 'Avatar', '그룹원 표시(이니셜 1자). 결제자·정산 행·부담 인원. 그룹원마다 들어온 순서대로 Color 1→6을 고정 배정(색은 사람 구분용, 의미 없음). 텍스트 레이어 initial.', 1000);
  const SZ = {L:[48,'Label/L',18], M:[36,'Label/M',14], S:[28,'Label/S',12], XS:[20,'Label/S',10]}; const items=[]; let r=0;
  for (const [cn,[bg,fg]] of Object.entries(AV)) { let k=0; for (const [sn,[s,ts,fs]] of Object.entries(SZ)) {
    const c = comp(`Color=${cn}, Size=${sn}`, {layout:'HORIZONTAL', justify:'CENTER', w:s, h:s, hugMain:false, radius:999}); c.counterAxisSizingMode='FIXED'; c.resize(s,s);
    c.fills=[await P(bg)]; await strokeV(c,'bg/surface', sn==='XS'?1.5:2, 'OUTSIDE');
    const t = await T('민', ts, fg, {parent:c, name:'initial'}); t.fontSize=fs; t.lineHeight={unit:'PIXELS', value:Math.round(fs*1.2)};
    items.push({c, r, k}); k++; } r++; }
  const g = gridSet(items, stage, 'Avatar', {ox:70, oy:30, gx:28, gy:16, vcenter:true, colW:48});
  Object.keys(SZ).forEach((s,i)=>axisLabel(stage, s, 70+g.cx[i], 0));
  let ri=0; for (const cn of Object.keys(AV)) { await axisLabel(stage, cn, 56, 30+g.ry[ri]+g.rowH[ri]/2-8, {right:true}); ri++; }
  out.Avatar = {setId:g.set.id, props:{Color:Object.keys(AV), Size:Object.keys(SZ)}, defaultVariantId:g.set.defaultVariant.id, textLayer:'initial'};
  // AvatarStack
  const items2=[]; const names=[['민','Violet'],['서','Sunset'],['하','Green'],['도','Blue']];
  for (const [k,[sn,gap,cs]] of [[0,['M',-8,36]],[1,['S',-6,28]]]) {
    const c = comp(`Size=${sn}`, {layout:'HORIZONTAL', gap, hugMain:true, hugCross:true}); c.itemReverseZIndex = true;
    for (const [ini,col] of names) { const v = g.set.children.find(x=>x.name===`Color=${col}, Size=${sn}`).createInstance(); c.appendChild(v); v.name='avatar'; const t=v.findOne(n=>n.name==='initial'); await font('Noto Sans KR', sn==='M'?'Bold':'Medium'); t.characters=ini; }
    const more = frame({name:'overflow', layout:'HORIZONTAL', justify:'CENTER', align:'CENTER', w:cs, h:cs, radius:999, parent:c}); more.fills=[await P('bg/muted')]; await strokeV(more,'bg/surface',2,'OUTSIDE');
    const mt = await T('+2', 'Label/S', 'text/secondary', {parent:more, name:'count'}); if (sn==='S') mt.fontSize=11;
    items2.push({c, r:0, k}); }
  const g2 = gridSet(items2, stage, 'AvatarStack', {ox:70, oy:g.set.y+g.set.height+70, gx:40, vcenter:true});
  const kO = g2.set.addComponentProperty('Overflow', 'BOOLEAN', true); for (const v of g2.set.children) v.findOne(n=>n.name==='overflow').componentPropertyReferences={visible:kO};
  await axisLabel(stage, 'AvatarStack — 여정 카드·헤더의 참여자 요약 (4명 + 초과 수). 겹침 −8, 앞사람이 위.', 70, g2.set.y-24);
  fitStage(stage);
  out.AvatarStack = {setId:g2.set.id, props:{Size:['M','S']}, defaultVariantId:g2.set.defaultVariant.id, textLayers:{initial:'avatar > initial', count:'overflow > count'}, propKeys:{Overflow:kO}};
}
// ---------- TopHeader
{
  const {p, stage} = await panel(body, 'TopHeader', '모든 여정 화면 상단 56px. Group = 지금 보고 있는 그룹명 + ▾(탭하면 그룹 목록 드롭다운) + 오른쪽 지갑·마이. Back = 상세/지갑/마이페이지. Logo = 소속 여정이 없을 때.', 1340);
  const ib = node(IDS.c_buttons.IconButton.setId);
  const ghostM = ib.children.find(v=>v.name==='Type=Ghost, Size=M, State=Default');
  const kSwap = Object.keys(ib.componentPropertyDefinitions)[0];
  const items=[]; let k=0;
  for (const tn of ['Group','Back','Logo']) {
    const c = comp(`Type=${tn}`, {layout:'HORIZONTAL', gap:4, pad:[0,8,0,tn==='Back'?4:20], w:390, h:56, hugMain:false}); c.counterAxisSizingMode='FIXED'; c.resize(390,56);
    c.fills=[await P('bg/surface')]; c.strokes=[await P('border/default')]; c.strokeTopWeight=0; c.strokeLeftWeight=0; c.strokeRightWeight=0; c.strokeBottomWeight=1; c.strokeAlign='INSIDE';
    if (tn==='Group') {
      const sw = frame({name:'group switcher', layout:'HORIZONTAL', gap:4, fill:'none', hug:'both', parent:c, align:'CENTER'});
      await T('오사카 우정여행', 'Heading/H3', 'text/primary', {parent:sw, name:'group name'});
      const ch = iconInst('chevron-down', 20, sw, 'chevron'); await iconColor(ch, 'icon/default');
      const bd = node(IDS.c_inputs.Badge.setId).children.find(v=>v.name==='Status=Active, Size=S').createInstance(); sw.appendChild(bd); bd.name='status badge';
    } else if (tn==='Back') {
      const b = ghostM.createInstance(); c.appendChild(b); b.name='back'; b.setProperties({[kSwap]: IDS.icons.comp['chevron-left']});
      await T('결제 상세', 'Heading/H3', 'text/primary', {parent:c, name:'title'});
    } else {
      const lg = node(IDS.logo['Logo/Primary']).createInstance(); c.appendChild(lg); lg.rescale(28/96); lg.name='logo';
    }
    const sp = frame({name:'spacer', fill:'none', w:10, h:10, parent:c}); grow(sp);
    if (tn!=='Back') {
      const w = ghostM.createInstance(); c.appendChild(w); w.name='wallet'; w.setProperties({[kSwap]: IDS.icons.comp['wallet']});
      const u = ghostM.createInstance(); c.appendChild(u); u.name='my'; u.setProperties({[kSwap]: IDS.icons.comp['user']});
    } else { const m = ghostM.createInstance(); c.appendChild(m); m.name='action'; m.setProperties({[kSwap]: IDS.icons.comp['more']}); }
    items.push({c, r:0, k}); k++; }
  const g = gridSet(items, stage, 'TopHeader', {ox:0, oy:30, gx:24});
  const kB = g.set.addComponentProperty('Status badge', 'BOOLEAN', false);
  g.set.children.find(v=>v.name==='Type=Group').findOne(n=>n.name==='status badge').componentPropertyReferences={visible:kB};
  ['Group','Back','Logo'].forEach((s,i)=>axisLabel(stage, 'Type='+s, g.cx[i], 0));
  await axisLabel(stage, '텍스트: group name / title. 오른쪽 버튼은 IconButton(Ghost·M) 인스턴스(wallet, my, action). Status badge 속성으로 그룹명 옆 상태 배지 표시.', 0, g.set.y+g.set.height+12);
  fitStage(stage);
  out.TopHeader = {setId:g.set.id, props:{Type:['Group','Back','Logo']}, defaultVariantId:g.set.defaultVariant.id, textLayers:{group:'group name', back:'title'}, iconLayers:['chevron','back','wallet','my','action'], propKeys:{'Status badge':kB}};
}
// ---------- NavItem + BottomNav
{
  const {p, stage} = await panel(body, 'BottomNav · NavItem', '현재 보고 있는 여정 안에서의 이동(하단 64px + 안전영역). 기본 2탭: 결제·현황 / 여정 정보. 3탭은 여정 종료 후 「정산」 탭을 끼우는 확장안. 활성 = 보라 아이콘·글자.', 900);
  const items=[];
  for (const [k,st] of ['Active','Inactive'].entries()) {
    const c = comp(`State=${st}`, {layout:'VERTICAL', gap:2, justify:'CENTER', w:120, h:64, hugMain:false}); c.counterAxisSizingMode='FIXED'; c.resize(120,64); c.counterAxisAlignItems='CENTER';
    const i = iconInst('receipt', 24, c, 'icon'); await iconColor(i, st==='Active'?'icon/brand':'icon/subtle');
    await T('결제·현황', 'Label/S', st==='Active'?'text/brand':'text/tertiary', {parent:c, name:'label'});
    items.push({c, r:0, k}); }
  const g = gridSet(items, stage, 'NavItem', {ox:0, oy:30, gx:24});
  const kL = g.set.addComponentProperty('Label','TEXT','결제·현황'); const kI = g.set.addComponentProperty('Icon','INSTANCE_SWAP', IDS.icons.comp['receipt']);
  for (const v of g.set.children) { v.findOne(n=>n.name==='label').componentPropertyReferences={characters:kL}; v.findOne(n=>n.name==='icon').componentPropertyReferences={mainComponent:kI}; }
  ['Active','Inactive'].forEach((s,i)=>axisLabel(stage, 'NavItem · '+s, g.cx[i], 0));
  const act = g.set.children[0], ina = g.set.children[1];
  const tabs = {2:[['결제·현황','receipt'],['여정 정보','map']], 3:[['결제·현황','receipt'],['정산','coins'],['여정 정보','map']]};
  const items2=[]; let r=0;
  for (const n of [2,3]) { for (let s=0;s<n;s++) {
    const c = comp(`Tabs=${n}, Active=${['First','Second','Third'][s]}`, {layout:'HORIZONTAL', gap:0, pad:[0,16,0,16], w:390, h:64, hugMain:false}); c.counterAxisSizingMode='FIXED'; c.resize(390,64);
    c.fills=[await P('bg/surface')]; c.strokes=[await P('border/default')]; c.strokeTopWeight=1; c.strokeBottomWeight=0; c.strokeLeftWeight=0; c.strokeRightWeight=0; c.strokeAlign='INSIDE';
    for (let i=0;i<n;i++) { const it = (i===s?act:ina).createInstance(); c.appendChild(it); grow(it); it.name='tab '+(i+1); it.setProperties({[kL]:tabs[n][i][0], [kI]:IDS.icons.comp[tabs[n][i][1]]}); }
    items2.push({c, r, k:s}); } r++; }
  const g2 = gridSet(items2, stage, 'BottomNav', {ox:0, oy:g.set.y+g.set.height+60, gx:24, gy:16});
  await axisLabel(stage, 'BottomNav — Tabs × Active (tab 1·2·3 = NavItem 인스턴스)', 0, g2.set.y-24);
  // 3 columns too wide? place in 2 cols: move third
  const third = g2.set.children.find(v=>v.name==='Tabs=3, Active=Third'); if (third) { third.x = g2.cx[0]; third.y = g2.ry[1] + g2.rowH[1] + 16; g2.set.resizeWithoutConstraints(g2.cx[1]+390+24, third.y + 64 + 24); }
  fitStage(stage);
  out.NavItem = {setId:g.set.id, props:{State:['Active','Inactive']}, defaultVariantId:g.set.defaultVariant.id, textLayer:'label', iconLayer:'icon', propKeys:{Label:kL, Icon:kI}};
  out.BottomNav = {setId:g2.set.id, props:{Tabs:['2','3'], Active:['First','Second','Third(Tabs=3만)']}, defaultVariantId:g2.set.defaultVariant.id, tabLayers:['tab 1','tab 2','tab 3'], note:'안전영역(env(safe-area-inset-bottom))은 화면 쪽에서 아래에 bg/surface로 덧붙인다'};
}
return out;

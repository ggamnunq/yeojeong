const out = {};
const es = {}; for (const s of await figma.getLocalEffectStylesAsync()) es[s.name]=s;
// ---------- 0. feedback tokens (variables + paint styles)
{
  const col = (await figma.variables.getLocalVariableCollectionsAsync()).find(c=>c.name==='여정/Color');
  const m = col.modes[0].modeId; const vs = await allVars(); out.vars = {};
  for (const r of TOK.roles.filter(r=>r.name.startsWith('feedback/'))) {
    let v = vs[r.name]; if (!v) v = figma.variables.createVariable(r.name, col, 'COLOR');
    v.setValueForMode(m, figma.variables.createVariableAlias(vs[r.ref])); v.description = r.desc+' → '+r.ref+' · '+r.hex; vs[r.name]=v; out.vars[r.name]=v.id;
    const ps = (await figma.getLocalPaintStylesAsync()).find(s=>s.name==='여정/'+r.name) || figma.createPaintStyle(); ps.name='여정/'+r.name;
    ps.paints=[figma.variables.setBoundVariableForPaint({type:'SOLID',color:rgb(r.hex)},'color',v)]; ps.description=v.description;
  }
}
// ---------- 1. Icon/menu
{
  const grid = S2().findOne(n=>n.name==='Icons').findOne(n=>n.name==='grid');
  let existing = grid.findOne(n=>n.type==='COMPONENT' && n.name==='Icon/menu');
  if (!existing) {
    const cell = frame({name:'cell/menu', layout:'VERTICAL', gap:10, pad:[20,8,14,8], w:113, hug:'v', align:'CENTER', radius:12, parent:grid}); await fillV(cell,'bg/canvas');
    const kakaoCell = grid.findOne(n=>n.name==='cell/kakao'); grid.insertChild(grid.children.indexOf(kakaoCell), cell);
    const c = figma.createComponent(); c.name='Icon/menu'; c.resize(24,24); c.fills=[]; c.clipsContent=true; cell.appendChild(c);
    const mk = imageNode(ICONS['menu'], {w:24, parent:c, name:'mask'}); mk.isMask=true; mk.constraints={horizontal:'SCALE',vertical:'SCALE'};
    const cl = rect({w:24,h:24,parent:c,name:'color'}); await fillV(cl,'icon/default'); cl.constraints={horizontal:'SCALE',vertical:'SCALE'};
    c.description='Icons8 fluency-systems-regular. 색 변경: 인스턴스의 `color` 레이어 fill을 토큰 변수로 교체.';
    await T('menu', 'Caption', 'text/secondary', {parent:cell});
    existing = c;
  }
  out.iconMenu = existing.id;
}
// ---------- 2. TopHeader: Menu boolean on Type=Group
const IB = node(IDS.c_buttons.IconButton.setId); const ibk = Object.keys(IB.componentPropertyDefinitions)[0];
const ghostM = IB.children.find(v=>v.name==='Type=Ghost, Size=M, State=Default');
{
  const set = node(IDS.c_nav.TopHeader.setId);
  const g = set.children.find(v=>v.name==='Type=Group');
  let mb = g.findOne(n=>n.name==='menu');
  if (!mb) { mb = ghostM.createInstance(); g.insertChild(0, mb); mb.name='menu'; mb.setProperties({[ibk]: out.iconMenu}); }
  g.paddingLeft = 8;
  let kM = propKey(set, 'Menu'); if (!kM) kM = set.addComponentProperty('Menu', 'BOOLEAN', true);
  mb.componentPropertyReferences = {visible:kM};
  const u = set.parent.parent.findOne(n=>n.name==='usage'); await font('Noto Sans KR','Regular');
  u.characters = '모든 여정 화면 상단 56px. Group = 왼쪽 ≡(그룹 구성원 드로어, Menu 속성) + 지금 보고 있는 그룹명 + 아래 화살표(탭하면 그룹 목록 드롭다운) + 오른쪽 지갑·마이. Back = 상세/지갑/마이페이지. Logo = 소속 여정이 없을 때.';
  const note = set.parent.children.find(n=>n.type==='TEXT' && n.characters.startsWith('텍스트: group name'));
  if (note) note.characters = '텍스트: group name / title. 버튼은 IconButton(Ghost·M) 인스턴스: menu(왼쪽 ≡, Menu 속성 기본 true), wallet, my, action. Status badge 속성 = 그룹명 옆 상태 배지.';
  out.TopHeader = {setId:set.id, groupVariant:g.id, menuLayer:mb.id, propKeys:{Menu:kM, 'Status badge':propKey(set,'Status badge')}};
}
// ---------- 3. BottomNav: 3 tabs default + Phase
{
  const set = node(IDS.c_nav.BottomNav.setId);
  const kL = IDS.c_nav.NavItem.propKeys.Label, kI = IDS.c_nav.NavItem.propKeys.Icon;
  for (const v of set.children) if (!v.name.includes('Phase=')) v.name = v.name + ', Phase=Ongoing';
  const ON = {First:0, Second:1, Third:2};
  const L3 = [['결제내역','receipt'],['현황','pie-chart'],['여정 정보','info']];
  const L3E = [['결제내역','receipt'],['정산','coins'],['여정 정보','info']];
  const ong3 = set.children.filter(v=>v.name.startsWith('Tabs=3') && v.name.includes('Phase=Ongoing'));
  for (const v of ong3) for (let i=0;i<3;i++) v.findOne(n=>n.name==='tab '+(i+1)).setProperties({[kL]:L3[i][0], [kI]:IDS.icons.comp[L3[i][1]]});
  const ended = {};
  for (const v of ong3) {
    const a = v.name.match(/Active=(\w+)/)[1];
    let e = set.children.find(x=>x.name===`Tabs=3, Active=${a}, Phase=Ended`);
    if (!e) { e = v.clone(); set.appendChild(e); e.name = `Tabs=3, Active=${a}, Phase=Ended`; }
    for (let i=0;i<3;i++) e.findOne(n=>n.name==='tab '+(i+1)).setProperties({[kL]:L3E[i][0], [kI]:IDS.icons.comp[L3E[i][1]]});
    ended[a] = e;
  }
  // order & layout: row0 Tabs=3 Ongoing, row1 Tabs=3 Ended, row2 Tabs=2 Ongoing
  const pick = n => set.children.find(x=>x.name===n);
  const rows = [['First','Second','Third'].map(a=>pick(`Tabs=3, Active=${a}, Phase=Ongoing`)), ['First','Second','Third'].map(a=>pick(`Tabs=3, Active=${a}, Phase=Ended`)), ['First','Second'].map(a=>pick(`Tabs=2, Active=${a}, Phase=Ongoing`))];
  const ordered = rows.flat(); ordered.slice().reverse().forEach(v=>set.insertChild(0, v));
  const pad = 24, gx = 24, gy = 16;
  rows.forEach((r,ri)=>r.forEach((v,ci)=>{ v.x = pad + ci*(390+gx); v.y = pad + ri*(64+gy); }));
  set.resizeWithoutConstraints(pad*2 + 3*390 + 2*gx, pad*2 + 3*64 + 2*gy);
  // panel / stage
  const stage = set.parent, panelF = stage.parent;
  panelF.resize(1340, panelF.height); stage.resizeWithoutConstraints(1260, stage.height);
  const u = panelF.findOne(n=>n.name==='usage'); u.resize(1260, u.height); await font('Noto Sans KR','Regular');
  u.characters = '현재 보고 있는 여정 안에서의 이동(하단 64px + 안전영역). 기본 3탭: 결제내역 / 현황 / 여정 정보. Phase=Ended(여정 종료 후)면 가운데 탭이 「정산」. Active로 활성 탭 선택. Tabs=2(결제·현황 / 여정 정보)는 이전 안, 새 화면에는 쓰지 않는다.';
  for (const t of stage.children.filter(n=>n.type==='TEXT' && (n.characters.startsWith('BottomNav —') || n.characters.startsWith('Tabs=') || n.characters.startsWith('Phase=')))) t.remove();
  const lb = await axisLabel(stage, 'BottomNav — 행: Tabs=3·Phase=Ongoing(기본) / Tabs=3·Phase=Ended / Tabs=2(레거시) · 열: Active=First|Second|Third', set.x, set.y - 22);
  set.x = 0; lb.x = 0;
  fitStage(stage);
  out.BottomNav = {setId:set.id, defaultVariant:set.defaultVariant.name, defaultVariantId:set.defaultVariant.id, ended: Object.fromEntries(Object.entries(ended).map(([k,v])=>[k,v.id])), props: Object.fromEntries(Object.entries(set.componentPropertyDefinitions).map(([k,d])=>[k,d.variantOptions||d.type]))};
}
// ---------- 4. BottomSheet: hug content + safe area padding
{
  const sheet = node(IDS.c_overlays.BottomSheet.componentId);
  const slot = node(IDS.c_overlays.SlotPlaceholder.componentId);
  slot.primaryAxisSizingMode = 'AUTO'; slot.paddingTop = 48; slot.paddingBottom = 48;
  const ct = sheet.findOne(n=>n.name==='content'); ct.layoutSizingVertical = 'HUG';
  sheet.paddingBottom = 24 + 34;
  const exf = sheet.parent.findOne(n=>n.name==='example · dim + sheet'); const ex = exf.children.find(n=>n.type==='INSTANCE'); ex.y = exf.height - ex.height;
  const u = sheet.parent.parent.findOne(n=>n.name==='usage'); await font('Noto Sans KR','Regular');
  u.characters = '그룹 드롭다운 목록, 결제 상세(공동/개인 지정·부담 인원), 초대코드 공유. 상단 손잡이 + 제목 + 닫기, 가운데 `Content` 슬롯(인스턴스 교체, 높이는 내용에 맞춰 hug), 하단 CTA, 아래 안전영역 패딩 34(총 58). 뒤에는 bg/dim(48%) 딤.';
  out.BottomSheet = {componentId:sheet.id, paddingBottom:sheet.paddingBottom, slotHeight:slot.height, sheetHeight:sheet.height};
}
// ---------- 5. Callout
{
  const grp = node(IDS.c_buttons.body).findOne(n=>n.name==='group/오버레이 · 피드백');
  const cols = grp.findOne(n=>n.name==='columns');
  const old = cols.findOne(n=>n.name==='panel/Callout'); if (old) old.remove();
  const colF = frame({name:'column', layout:'VERTICAL', gap:40, fill:'none', hug:'both', parent:cols});
  const {p, stage} = await panel(colF, 'Callout', '화면 상단 한 줄 배너. 탭하면 해당 목록/시트로 이동. Pending = 미확정 결제 확인 유도(주황 점선, "확인 필요 2건"), Info = 안내(지갑 동기화 등), Warning = 주의(예산 80% 이상 등). 부모 오토레이아웃 안에서 가로 채움(FILL).', 900);
  const D = {Pending:['expense/pending','alert',true], Info:['feedback/info','info',false], Warning:['feedback/warning','alert',false]};
  const items=[]; let k=0;
  for (const [tn,[tk,ic,dashed]] of Object.entries(D)) {
    const c = comp(`Tone=${tn}`, {layout:'HORIZONTAL', gap:8, pad:[14,14,14,16], w:350, hugMain:false, hugCross:true}); c.resize(350, c.height);
    await bindRadius(c,'radius/md'); await bindPad(c,null,null,null,'space/16');
    c.fills=[await P(tk+'/bg')]; await strokeV(c, tk+'/border', 1, 'INSIDE'); if (dashed) c.dashPattern=[4,3];
    const i = iconInst(ic, 20, c, 'icon'); await iconColor(i, tk+'/fg');
    const t = await T('확인 필요 2건', 'Body/M Strong', 'text/primary', {parent:c, name:'label'}); t.layoutSizingHorizontal='FILL';
    const ch = iconInst('chevron-right', 20, c, 'chevron'); await iconColor(ch,'icon/subtle');
    items.push({c, r:k, k:0}); k++; }
  const g = gridSet(items, stage, 'Callout', {ox:90, oy:0, gy:12, pad:20});
  const kL = g.set.addComponentProperty('Label','TEXT','확인 필요 2건');
  const kC = g.set.addComponentProperty('Chevron','BOOLEAN',true);
  const kI = g.set.addComponentProperty('Icon','INSTANCE_SWAP', IDS.icons.comp['alert']);
  for (const v of g.set.children) { v.findOne(n=>n.name==='label').componentPropertyReferences={characters:kL}; v.findOne(n=>n.name==='chevron').componentPropertyReferences={visible:kC}; v.findOne(n=>n.name==='icon').componentPropertyReferences={mainComponent:kI}; }
  const infoV = g.set.children.find(v=>v.name==='Tone=Info'); const ii = infoV.findOne(n=>n.name==='icon'); if (ii.mainComponent.id !== IDS.icons.comp['info']) ii.swapComponent(node(IDS.icons.comp['info']));
  let ri=0; for (const s of Object.keys(D)) { await axisLabel(stage, s, 76, g.set.children[ri].y+14, {right:true}); ri++; }
  const ex = frame({name:'example', layout:'VERTICAL', gap:8, pad:20, w:430, hug:'v', parent:stage, x:90, y:g.set.y+g.set.height+40, radius:16}); await fillV(ex,'bg/canvas');
  const i1 = g.set.children[1].createInstance(); ex.appendChild(i1); i1.layoutSizingHorizontal='FILL'; i1.setProperties({[kL]:'지갑 동기화 10분 전 · 새 결제 3건'});
  const i2 = g.set.children[2].createInstance(); ex.appendChild(i2); i2.layoutSizingHorizontal='FILL'; i2.setProperties({[kL]:'예산의 86%를 썼어요', [kI]:IDS.icons.comp['pie-chart']});
  await axisLabel(stage, '↑ 예: Info / Warning(아이콘 교체). 텍스트는 Label 속성, 아이콘은 Icon 속성, 오른쪽 화살표는 Chevron 속성.', 90, ex.y+ex.height+8);
  fitStage(stage);
  out.Callout = {setId:g.set.id, props:{Tone:Object.keys(D)}, defaultVariantId:g.set.defaultVariant.id, variants:Object.fromEntries(g.set.children.map(v=>[v.name,v.id])), textLayer:'label', iconLayers:['icon','chevron'], propKeys:{Label:kL, Chevron:kC, Icon:kI}, panel:p.id};
}
// refit
const s2 = S2(); let maxY=0; for (const c of s2.children) maxY=Math.max(maxY,c.y+c.height); s2.resizeWithoutConstraints(5400, maxY+120);
return out;

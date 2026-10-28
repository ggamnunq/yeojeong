const body = node(IDS.c_buttons.body);
const out = {};
const es = {}; for (const s of await figma.getLocalEffectStylesAsync()) es[s.name]=s;
async function eff(n, name) { try { await n.setEffectStyleIdAsync(es[name].id); } catch(e) { n.effectStyleId = es[name].id; } }
async function setText(n, s) { await font(n.fontName.family, n.fontName.style); n.characters = s; }
const BTN = node(IDS.c_buttons.Button.setId); const bk = IDS.c_buttons.Button.propKeys;
const btn = (name, label) => { const i = BTN.children.find(v=>v.name===name).createInstance(); i.setProperties({[bk.Label]:label}); return i; };
const IB = node(IDS.c_buttons.IconButton.setId); const ibk = Object.keys(IB.componentPropertyDefinitions)[0];
// ---- fix SettlementRow breakdown -> two lines
{
  const set = node(IDS.c_stats.SettlementRow.setId);
  for (const v of set.children) {
    const b = v.findOne(n=>n.name==='breakdown'); const [paid, share] = b.characters.split(' · ');
    await setText(b, paid); b.name='paid';
    const s2 = await T(share, 'Caption', 'text/tertiary', {name:'share'}); b.parent.insertChild(b.parent.children.indexOf(b)+1, s2);
  }
  set.resizeWithoutConstraints(set.width, set.height); // children heights changed; re-stack
  let y = 16; for (const v of set.children) { v.y = y; y += v.height + 12; } set.resizeWithoutConstraints(set.width, y + 4);
  const st = set.parent; const lbls = st.children.filter(n=>n.type==='TEXT' && ['Receive','Send','Even'].includes(n.characters));
  lbls.forEach((l,i)=>{ l.y = set.children[i].y + set.children[i].height/2 - 8; });
  const tr = node(IDS.c_stats.TransferRow.componentId); const trl = st.children.find(n=>n.type==='TEXT' && n.characters.startsWith('TransferRow'));
  tr.y = set.y + set.height + 60; trl.y = tr.y - 22; const nt = st.children.find(n=>n.type==='TEXT' && n.characters.startsWith('텍스트: name')); await setText(nt, '텍스트: name · paid(결제합) · share(부담액) · net amount · net label. Me 속성 = 이름 옆 "나" 배지. 순잔액 = 결제합 − 부담액.'); nt.y = tr.y + tr.height + 14;
  fitStage(st);
  IDS.c_stats.SettlementRow.textLayers = ['name','paid','share','net amount','net label'];
  out.SettlementRow = IDS.c_stats.SettlementRow;
}
// ---------- ListItem (generic cell)
{
  const {p, stage} = await panel(body, 'ListItem', '범용 행. 여정 정보(기간·장소·예산·초대코드), 그룹 드롭다운 목록, 마이페이지 메뉴(로그아웃), 지갑 연결 계좌. Navigation(›) / Value(오른쪽 값) / Selected(✓ 현재 그룹) / Destructive(빨강).', 1000);
  const D = {Navigation:['여정 기간','','chevron-right'], Value:['예산','₩1,500,000',''], Selected:['오사카 우정여행','','check'], Destructive:['로그아웃','','']};
  const items=[]; let k=0;
  for (const [tn,[title,val,trail]] of Object.entries(D)) {
    const c = comp(`Type=${tn}`, {layout:'HORIZONTAL', gap:12, pad:[14,20,14,20], w:390, hugMain:false, hugCross:true}); c.resize(390,c.height); c.minHeight = 56;
    c.fills=[await P('bg/surface')];
    const li = iconInst(tn==='Destructive'?'logout':tn==='Selected'?'airplane':tn==='Value'?'coins':'calendar', 20, c, 'leading icon'); await iconColor(li, tn==='Destructive'?'text/error':'icon/default');
    const tx = frame({name:'text', layout:'VERTICAL', gap:2, fill:'none', hug:'v', w:200, parent:c}); grow(tx);
    await T(title, 'Body/M', tn==='Destructive'?'text/error':'text/primary', {parent:tx, name:'title'});
    const sub = await T(tn==='Navigation'?'10.27 (월) – 10.30 (목) · 3박 4일':tn==='Selected'?'진행 중 · 4명':'', 'Caption', 'text/tertiary', {parent:tx, name:'subtitle'}); sub.visible = tn==='Navigation'||tn==='Selected';
    if (val) { const v = await text(val, {family:'Archivo', style:'SemiBold', size:15, color:'#14141E', parent:c, name:'value'}); v.fills=[await P('text/primary')]; }
    if (trail) { const t = iconInst(trail, 20, c, 'trailing icon'); await iconColor(t, tn==='Selected'?'icon/brand':'icon/subtle'); }
    items.push({c, r:k, k:0}); k++; }
  const g = gridSet(items, stage, 'ListItem', {ox:110, oy:0, gy:0, pad:0});
  g.set.cornerRadius = 16; g.set.clipsContent = true;
  const kS = g.set.addComponentProperty('Subtitle', 'BOOLEAN', true); const kL = g.set.addComponentProperty('Leading icon', 'BOOLEAN', true);
  for (const v of g.set.children) { v.findOne(n=>n.name==='subtitle').componentPropertyReferences={visible:kS}; v.findOne(n=>n.name==='leading icon').componentPropertyReferences={visible:kL}; }
  // dividers between rows inside variant? keep with Divider component below
  let ri=0; for (const s of Object.keys(D)) { await axisLabel(stage, s, 96, g.set.children[ri].y + g.set.children[ri].height/2 - 8, {right:true}); ri++; }
  await axisLabel(stage, '텍스트: title · subtitle · value. 아이콘: leading icon / trailing icon (색은 color 레이어). 목록 사이에는 Divider(Inset).', 110, g.set.y+g.set.height+12);
  fitStage(stage);
  out.ListItem = {setId:g.set.id, props:{Type:Object.keys(D)}, defaultVariantId:g.set.defaultVariant.id, textLayers:['title','subtitle','value'], iconLayers:['leading icon','trailing icon'], propKeys:{Subtitle:kS, 'Leading icon':kL}};
}
// ---------- Slot + BottomSheet
{
  const {p, stage} = await panel(body, 'BottomSheet', '그룹 드롭다운 목록, 결제 상세(공동/개인 지정·부담 인원), 초대코드 공유. 상단 손잡이 + 제목 + 닫기, 가운데 `Content` 슬롯(인스턴스 교체), 하단 CTA. 뒤에는 bg/dim(48%) 딤.', 1000);
  const slot = comp('Slot/Placeholder', {layout:'VERTICAL', justify:'CENTER', align:'CENTER', w:350, h:160, hugMain:false, radius:12}); slot.counterAxisSizingMode='FIXED'; slot.resize(350,160);
  slot.fills=[await P('primary/50')]; await strokeV(slot,'primary/300',1.5,'INSIDE'); slot.dashPattern=[6,4];
  await T('Content 슬롯 — 컴포넌트로 만든 내용을 Instance swap', 'Caption', 'text/brand', {parent:slot, name:'hint'});
  stage.appendChild(slot); slot.x = 560; slot.y = 30;
  slot.description = 'BottomSheet의 Content 슬롯 기본값. 실제 내용은 별도 컴포넌트로 만들어 Content 속성으로 교체하거나, 인스턴스를 detach해서 채운다.';
  const c = comp('BottomSheet', {layout:'VERTICAL', gap:16, pad:[8,20,24,20], w:390, hugMain:true}); c.counterAxisSizingMode='FIXED'; c.resize(390, c.height); c.counterAxisAlignItems='CENTER';
  c.fills=[await P('bg/surface')]; c.topLeftRadius = 24; c.topRightRadius = 24; await bindN(c,'topLeftRadius','radius/2xl'); await bindN(c,'topRightRadius','radius/2xl'); await eff(c,'Elevation/3');
  const handle = rect({w:36, h:4, radius:2, parent:c, name:'handle'}); await fillV(handle,'neutral/300');
  const hd = frame({name:'header', layout:'HORIZONTAL', gap:8, fill:'none', hug:'v', w:350, parent:c, align:'CENTER'}); hd.layoutAlign='STRETCH';
  const tt = await T('결제 상세', 'Heading/H3', 'text/primary', {parent:hd, name:'title'}); grow(tt);
  const cl = IB.children.find(v=>v.name==='Type=Ghost, Size=M, State=Default').createInstance(); hd.appendChild(cl); cl.name='close'; cl.setProperties({[ibk]: IDS.icons.comp['close']});
  const ct = slot.createInstance(); c.appendChild(ct); ct.name='content'; ct.layoutAlign='STRETCH';
  const ft = btn('Type=Primary, Size=L, State=Default', '저장하기'); c.appendChild(ft); ft.name='cta'; ft.layoutAlign='STRETCH';
  stage.appendChild(c); c.x = 0; c.y = 30;
  const kC = c.addComponentProperty('Content', 'INSTANCE_SWAP', slot.id); ct.componentPropertyReferences={mainComponent:kC};
  const kT = c.addComponentProperty('Title', 'TEXT', '결제 상세'); tt.componentPropertyReferences={characters:kT};
  const kF = c.addComponentProperty('CTA', 'BOOLEAN', true); ft.componentPropertyReferences={visible:kF};
  const kX = c.addComponentProperty('Close', 'BOOLEAN', true); cl.componentPropertyReferences={visible:kX};
  c.description = '바텀시트 컨테이너. 너비 390(화면 폭), 상단 라운드 24, Elevation/3. Content 속성으로 내용 교체.';
  await axisLabel(stage, 'BottomSheet (component)', 0, 6); await axisLabel(stage, 'Slot/Placeholder (component)', 560, 6);
  // example with dim
  const exf = frame({name:'example · dim + sheet', w:390, h:560, parent:stage, x:560, y:240, radius:24, clip:true}); await fillV(exf,'bg/canvas');
  const fake = await T('오사카 우정여행', 'Heading/H2', 'text/primary', {parent:exf}); fake.x=20; fake.y=24;
  const dim = rect({w:390, h:560, parent:exf, name:'dim'}); dim.fills=[await P('bg/dim')];
  const si = c.createInstance(); exf.appendChild(si); si.y = 560 - si.height; si.x = 0;
  await axisLabel(stage, '↑ 사용 예: 화면 위 bg/dim + 시트를 하단에 붙임', 560, 810);
  fitStage(stage);
  out.BottomSheet = {componentId:c.id, textLayer:'title (속성 Title)', slotLayer:'content', propKeys:{Content:kC, Title:kT, CTA:kF, Close:kX}, nested:{close:'IconButton Ghost M', cta:'Button Primary L'}};
  out.SlotPlaceholder = {componentId:slot.id};
}
// ---------- Dialog
{
  const {p, stage} = await panel(body, 'Dialog', '되돌리기 어려운 결정 확인. 여정 시작/종료, 그룹 나가기·삭제(시작 전만), 그룹원 강퇴. 버튼은 [취소][확인] 순, 파괴적이면 확인 버튼이 Danger.', 900);
  const items=[]; let k=0;
  for (const [tn, title, desc, ok, okType] of [['Default','여정을 종료할까요?','종료하면 결제 내역 수집이 멈추고 정산 요약으로 넘어가요. 종료 후에는 다시 시작할 수 없어요.','종료하기','Primary'],['Danger','그룹을 삭제할까요?','여정이 시작되기 전에만 삭제할 수 있어요. 초대된 그룹원 모두에게서 사라져요.','삭제하기','Danger']]) {
    const c = comp(`Type=${tn}`, {layout:'VERTICAL', gap:8, pad:[28,24,20,24], w:320, hugMain:true}); c.counterAxisSizingMode='FIXED'; c.resize(320,c.height); c.counterAxisAlignItems='MIN';
    c.fills=[await P('bg/surface')]; await bindRadius(c,'radius/xl'); await eff(c,'Elevation/3');
    await T(title, 'Heading/H3', 'text/primary', {parent:c, name:'title', width:272});
    await T(desc, 'Body/S', 'text/secondary', {parent:c, name:'message', width:272});
    const sp = frame({name:'sp', fill:'none', w:10, h:12, parent:c});
    const br = frame({name:'actions', layout:'HORIZONTAL', gap:8, fill:'none', hug:'v', w:272, parent:c}); br.layoutAlign='STRETCH';
    const b1 = btn('Type=Secondary, Size=M, State=Default','취소'); br.appendChild(b1); grow(b1); b1.name='cancel';
    const b2 = btn(`Type=${okType}, Size=M, State=Default`, ok); br.appendChild(b2); grow(b2); b2.name='confirm';
    items.push({c, r:0, k}); k++; }
  const g = gridSet(items, stage, 'Dialog', {ox:0, oy:30, gx:32, pad:24});
  g.set.fills=[await P('bg/dim')];
  ['Default','Danger'].forEach((s,i)=>axisLabel(stage, 'Type='+s, g.cx[i], 0));
  await axisLabel(stage, '텍스트: title · message. 버튼: cancel / confirm (Button 인스턴스 → Label 속성으로 문구 변경). 세트 배경은 딤 미리보기용.', 0, g.set.y+g.set.height+12);
  fitStage(stage);
  out.Dialog = {setId:g.set.id, props:{Type:['Default','Danger']}, defaultVariantId:g.set.defaultVariant.id, textLayers:['title','message'], nested:{cancel:'Button Secondary M', confirm:'Button Primary|Danger M'}};
}
// ---------- Toast
{
  const {p, stage} = await panel(body, 'Toast', '짧은 결과 알림(2~3초). 초대코드 복사, 공동 지출로 지정, 저장 실패. 화면 하단 내비 위 16px에 띄운다. 액션은 하나까지(실행 취소).', 900);
  const D = {Success:['check-circle','success/500','초대코드를 복사했어요'], Info:['info','primary/300','공동 지출로 바꿨어요'], Error:['alert','error/500','저장하지 못했어요. 다시 시도해 주세요']};
  const items=[]; let k=0;
  for (const [tn,[ic,ict,msg]] of Object.entries(D)) {
    const c = comp(`Type=${tn}`, {layout:'HORIZONTAL', gap:10, pad:[14,16,14,16], w:350, hugMain:false, hugCross:true}); c.resize(350,c.height);
    c.fills=[await P('bg/inverse')]; await bindRadius(c,'radius/md'); await eff(c,'Elevation/2');
    const i = iconInst(ic, 20, c, 'icon'); await iconColor(i, ict);
    const t = await T(msg, 'Body/S Strong', 'text/inverse', {parent:c, name:'message'}); grow(t);
    const a = await T('실행 취소', 'Label/M', 'primary/300', {parent:c, name:'action'}); a.visible = tn==='Info';
    items.push({c, r:k, k:0}); k++; }
  const g = gridSet(items, stage, 'Toast', {ox:80, oy:0, gy:12, pad:16});
  const kA = g.set.addComponentProperty('Action', 'BOOLEAN', false); for (const v of g.set.children) v.findOne(n=>n.name==='action').componentPropertyReferences={visible:kA};
  let ri=0; for (const s of Object.keys(D)) { await axisLabel(stage, s, 66, g.set.children[ri].y+16, {right:true}); ri++; }
  await axisLabel(stage, '텍스트: message · action. Action 속성으로 "실행 취소" 표시.', 80, g.set.y+g.set.height+12);
  fitStage(stage);
  out.Toast = {setId:g.set.id, props:{Type:Object.keys(D)}, defaultVariantId:g.set.defaultVariant.id, textLayers:['message','action'], iconLayer:'icon', propKeys:{Action:kA}};
}
// ---------- EmptyState
{
  const {p, stage} = await panel(body, 'EmptyState', '빈 화면. NoTrip = 소속된 여정이 없을 때(여정 만들기/초대코드로 참여), NoPayments = 진행 중인데 결제가 아직 없을 때. 일러스트는 Icons8 Fluency 컬러 PNG.', 900);
  const D = {NoTrip:['suitcase','아직 참여한 여정이 없어요','친구에게 받은 초대코드로 참여하거나\n새 여정을 만들어 보세요.',[['Type=Primary, Size=M, State=Default','여정 만들기'],['Type=Secondary, Size=M, State=Default','초대코드로 참여']]], NoPayments:['receipt','아직 결제 내역이 없어요','여정 중 연결한 카드로 결제하면\n자동으로 여기에 모여요.',[['Type=Ghost, Size=S, State=Default','지갑 연결 확인']]]};
  const items=[]; let k=0;
  for (const [tn,[ill,title,desc,btns]] of Object.entries(D)) {
    const c = comp(`Type=${tn}`, {layout:'VERTICAL', gap:8, pad:[32,20,32,20], w:350, hugMain:true}); c.counterAxisSizingMode='FIXED'; c.resize(350,c.height); c.counterAxisAlignItems='CENTER';
    c.fills=[];
    imageNode(ILLU[ill], {w:96, parent:c, name:'illustration'});
    const sp = frame({name:'sp', fill:'none', w:10, h:8, parent:c});
    await T(title, 'Heading/H3', 'text/primary', {parent:c, name:'title', align:'CENTER'});
    await T(desc, 'Body/S', 'text/secondary', {parent:c, name:'message', align:'CENTER'});
    const sp2 = frame({name:'sp', fill:'none', w:10, h:12, parent:c});
    const br = frame({name:'actions', layout:'VERTICAL', gap:8, fill:'none', hug:'v', w:240, parent:c, align:'CENTER'});
    for (const [vn, lab] of btns) { const b = btn(vn, lab); br.appendChild(b); if (btns.length>1) { b.layoutAlign='STRETCH'; } }
    items.push({c, r:0, k}); k++; }
  const g = gridSet(items, stage, 'EmptyState', {ox:0, oy:30, gx:24, pad:16});
  g.set.fills=[await P('bg/canvas')];
  ['Type=NoTrip','Type=NoPayments'].forEach((s,i)=>axisLabel(stage, s, g.cx[i], 0));
  fitStage(stage);
  out.EmptyState = {setId:g.set.id, props:{Type:['NoTrip','NoPayments']}, defaultVariantId:g.set.defaultVariant.id, textLayers:['title','message'], imageLayer:'illustration', nested:{actions:'Button 인스턴스들'}};
}
return out;

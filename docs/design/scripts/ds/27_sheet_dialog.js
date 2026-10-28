const out = {};
const A = node(IDS.c_nav.Avatar.setId); const kR = propKey(A,'Ring'), kMe = propKey(A,'Me');
const imgB = figma.createImage(b64ToBytes(PHOTOS.b)).hash;
async function setText(n, s) { await font(n.fontName.family, n.fontName.style); n.characters = s; }
const SAMPLE = [['준용','Gray','Photo','a'],['민지','Gray','Photo','b'],['태현','Violet','Default',null],['수빈','Sunset','Default',null]];
async function setAvatar(inst, i, size, ring) { const [nm,col,src,ph] = SAMPLE[i]; const pr = {Color:col, Size:size, Source:src}; if (ring!==undefined) pr[kR]=ring; inst.setProperties(pr); if (ph==='b') inst.findOne(n=>n.name==='photo').fills=[{type:'IMAGE',scaleMode:'FILL',imageHash:imgB}]; }
// ---------- SheetContent/PaymentDetail
const sheet = node(IDS.c_overlays.BottomSheet.componentId); const st = sheet.parent;
for (const n of ['SheetContent/PaymentDetail','example · payment detail sheet']) { const o = st.findOne(x=>x.name===n); if (o) o.remove(); }
for (const t of st.children.filter(n=>n.type==='TEXT' && (n.characters.startsWith('SheetContent') || n.characters.startsWith('↑ 결제 상세')))) t.remove();
const baseY = Math.max(...st.children.map(c=>c.y+c.height)) + 60;
const sc = comp('SheetContent/PaymentDetail', {layout:'VERTICAL', gap:16, w:350, hugMain:true}); st.appendChild(sc); sc.counterAxisSizingMode='FIXED'; sc.resize(350, sc.height); sc.counterAxisAlignItems='MIN'; sc.x = 0; sc.y = baseY;
sc.fills=[await P('bg/surface')];
const sum = frame({name:'summary', layout:'VERTICAL', gap:2, fill:'none', hug:'v', w:350, parent:sc}); sum.layoutSizingHorizontal='FILL';
await T('이치란 라멘 도톤보리점', 'Body/M Strong', 'text/secondary', {parent:sum, name:'merchant'});
await T('₩28,400', 'Amount/L', 'amount/default', {parent:sum, name:'amount'});
await T('¥3,200 · 100엔 = 887.5원 · 10.28 12:40 · 민지 결제', 'Caption', 'text/tertiary', {parent:sum, name:'detail'});
const SEG = node(IDS.c_inputs.SegmentedControl.setId); const sg = SEG.children.find(v=>v.name==='Count=2, Selected=Second').createInstance(); sc.appendChild(sg); sg.name='expense type'; sg.layoutSizingHorizontal='FILL';
await setText(sg.findOne(n=>n.name==='label 1'), '개인'); await setText(sg.findOne(n=>n.name==='label 2'), '공동');
const ph = frame({name:'participants header', layout:'HORIZONTAL', gap:8, fill:'none', hug:'v', w:350, parent:sc, align:'CENTER'}); ph.layoutSizingHorizontal='FILL';
await T('부담 인원 3명', 'Body/S Strong', 'text/primary', {parent:ph, name:'participants title'}); const sp = frame({name:'sp', fill:'none', w:4, h:4, parent:ph}); grow(sp);
await T('1인 ₩9,467', 'Body/S', 'text/secondary', {parent:ph, name:'per person'});
const AT = node(IDS.c_stack12.AvatarToggle.setId); const kN = IDS.c_stack12.AvatarToggle.propKeys.Name;
const pr = frame({name:'participants', layout:'HORIZONTAL', gap:20, fill:'none', hug:'both', parent:sc});
for (let i=0;i<4;i++) { const on = i!==2; const t = AT.children.find(v=>v.name===`Selected=${on?'On':'Off'}`).createInstance(); pr.appendChild(t); t.setProperties({[kN]:SAMPLE[i][0]}); t.name='toggle · '+SAMPLE[i][0]; await setAvatar(t.findOne(n=>n.name==='avatar'), i, 'L', false); }
sc.description = 'BottomSheet Content 슬롯용 결제 상세 내용: 금액 요약 · 개인/공동 전환 · 부담 인원(AvatarToggle) 선택. Content 속성으로 교체해 쓴다.';
await axisLabel(st, 'SheetContent/PaymentDetail (component) — Content 슬롯용', 0, baseY - 22);
const exf = frame({name:'example · payment detail sheet', w:390, h:640, parent:st, x:560, y:baseY, radius:24, clip:true}); await fillV(exf,'bg/canvas');
const dim = rect({w:390,h:640,parent:exf,name:'dim'}); dim.fills=[await P('bg/dim')];
const si = sheet.createInstance(); exf.appendChild(si);
const SP = sheet.componentPropertyDefinitions; const sk = p => Object.keys(SP).find(k=>k.startsWith(p+'#'));
si.setProperties({[sk('Content')]: sc.id, [sk('Title')]: '결제 상세'});
si.findOne(n=>n.name==='cta').setProperties({[IDS.c_buttons.Button.propKeys.Label]:'저장하기'});
si.x = 0; si.y = 640 - si.height;
await axisLabel(st, '↑ 결제 상세 시트: Content = SheetContent/PaymentDetail (공동 → 부담 인원 프사 선택)', 560, baseY + 650);
fitStage(st);
out.SheetContent = {componentId:sc.id, textLayers:['merchant','amount','detail','participants title','per person'], nested:{'expense type':'SegmentedControl Count=2', 'toggle · 이름':'AvatarToggle ×4'}};
// ---------- Dialog SharedToPersonal
const DLG = node(IDS.c_overlays.Dialog.setId);
let dv = DLG.children.find(v=>v.name==='Type=SharedToPersonal');
if (!dv) { dv = DLG.children.find(v=>v.name==='Type=Default').clone(); DLG.appendChild(dv); dv.name='Type=SharedToPersonal'; }
await setText(dv.findOne(n=>n.name==='title'), '공동에서 뺄까요?');
await setText(dv.findOne(n=>n.name==='message'), '다른 멤버의 정산에서도 빠져요. 이 결제는 나만 볼 수 있게 돼요.');
dv.findOne(n=>n.name==='confirm').setProperties({[IDS.c_buttons.Button.propKeys.Label]:'개인으로 변경'});
{ const vs = ['Type=Default','Type=Danger','Type=SharedToPersonal'].map(n=>DLG.children.find(v=>v.name===n)); let x = 24; for (const v of vs) { v.x = x; v.y = 24; x += v.width + 32; }
  DLG.resizeWithoutConstraints(x - 32 + 24, Math.max(...vs.map(v=>v.height)) + 48);
  const dst = DLG.parent, pn = dst.parent; pn.resize(1180, pn.height); dst.resizeWithoutConstraints(1100, dst.height); const u = pn.findOne(n=>n.name==='usage'); u.resize(1100, u.height);
  for (const t of dst.children.filter(n=>n.type==='TEXT' && n.characters.startsWith('Type='))) t.remove();
  for (const v of vs) await axisLabel(dst, v.name, DLG.x + v.x, 0);
  const nt = dst.children.find(n=>n.type==='TEXT' && n.characters.startsWith('텍스트: title')); if (nt) nt.y = DLG.y + DLG.height + 12;
  await setText(u, '되돌리기 어려운 결정 확인. 여정 시작/종료, 그룹 나가기·삭제(시작 전만), 강퇴, 공동 → 개인 전환(SharedToPersonal). 버튼은 [취소][확인] 순, 파괴적이면 확인 버튼이 Danger.');
  fitStage(dst); }
out.Dialog = {setId:DLG.id, variants:Object.fromEntries(DLG.children.map(v=>[v.name,v.id]))};
// ---------- Callout Disconnected
const CO = node(IDS.c_patch.Callout.setId);
let cv = CO.children.find(v=>v.name==='Tone=Disconnected');
const before = CO.children.map(v=>v.findOne(n=>n.name==='label').characters);
if (!cv) { cv = CO.children.find(v=>v.name==='Tone=Info').clone(); CO.appendChild(cv); cv.name='Tone=Disconnected'; }
cv.fills=[await P('feedback/error/bg')]; cv.strokes=[await P('feedback/error/border')]; cv.strokeWeight=1; cv.dashPattern=[];
const ci = cv.findOne(n=>n.name==='icon'); ci.swapComponent(node(IDS.icons.comp['link'])); await iconColor(ci,'feedback/error/fg');
const lb = cv.findOne(n=>n.name==='label'); lb.componentPropertyReferences = {}; await setText(lb, '토스 연결이 끊겼어요');
let act = cv.findOne(n=>n.name==='action');
if (!act) { act = await T('다시 연결', 'Label/M', 'text/brand', {name:'action'}); cv.insertChild(cv.children.indexOf(cv.findOne(n=>n.name==='chevron')), act); }
const after = CO.children.map(v=>v.name+': '+v.findOne(n=>n.name==='label').characters);
{ const vs = ['Pending','Info','Warning','Disconnected'].map(t=>CO.children.find(v=>v.name==='Tone='+t)); let y = 20; for (const v of vs) { v.x = 20; v.y = y; y += v.height + 12; }
  CO.resizeWithoutConstraints(390, y - 12 + 20);
  const cst = CO.parent; for (const t of cst.children.filter(n=>n.type==='TEXT' && ['Pending','Info','Warning','Disconnected'].includes(n.characters))) t.remove();
  for (const v of vs) await axisLabel(cst, v.name.replace('Tone=',''), CO.x - 14, CO.y + v.y + 14, {right:true});
  const ex = cst.findOne(n=>n.name==='example'); const exl = cst.children.find(n=>n.type==='TEXT' && n.characters.startsWith('↑ 예')); ex.y = CO.y + CO.height + 40; exl.y = ex.y + ex.height + 8;
  const u = cst.parent.findOne(n=>n.name==='usage'); await setText(u, '화면 상단 한 줄 배너(탭 → 해당 목록/시트). Pending = 미확정 결제 확인 유도("확인 필요 2건"), Info = 안내(지갑 동기화), Warning = 주의(예산 80%↑), Disconnected = 연동 끊김("토스 연결이 끊겼어요 › 다시 연결", label은 속성 대신 레이어 직접 수정). 부모 안에서 FILL.');
  fitStage(cst); }
out.Callout = {setId:CO.id, before, after, variants:Object.fromEntries(CO.children.map(v=>[v.name,v.id]))};
// ---------- SettlementRow examples
const SR = node(IDS.c_stats.SettlementRow.setId); const sst = SR.parent;
const oe = sst.findOne(n=>n.name==='example v1.2'); if (oe) oe.remove();
for (const t of sst.children.filter(n=>n.type==='TEXT' && n.characters.startsWith('↑ 프사'))) t.remove();
const by = Math.max(...sst.children.map(c=>c.y+c.height)) + 40;
const ex = frame({name:'example v1.2', layout:'VERTICAL', gap:0, hug:'both', parent:sst, x:80, y:by, radius:16, clip:true}); ex.fills=[await P('bg/surface')]; await strokeV(ex,'border/default',1,'INSIDE');
const e1 = SR.children.find(v=>v.name==='Net=Receive').createInstance(); ex.appendChild(e1); await setAvatar(e1.findOne(n=>n.name==='avatar'), 1, 'M'); e1.setProperties({[IDS.c_stats.SettlementRow.propKeys.Me]:true}); e1.findOne(n=>n.name==='avatar').setProperties({[kMe]:true});
const e2 = SR.children.find(v=>v.name==='Net=Send').createInstance(); ex.appendChild(e2); await setAvatar(e2.findOne(n=>n.name==='avatar'), 3, 'M'); await setText(e2.findOne(n=>n.name==='name'), '수빈');
await axisLabel(sst, '↑ 프사 예: 민지(사진 + 나: Me 배지 + 보라 테두리) / 수빈(기본 이미지). avatar = 중첩 Avatar, Source·Color·Me로 바꾼다.', 80, ex.y + ex.height + 8);
fitStage(sst);
return out;

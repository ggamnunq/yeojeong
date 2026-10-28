const out = {};
const A = node(IDS.c_nav.Avatar.setId); const kR = propKey(A,'Ring');
const STK = node(IDS.c_nav.AvatarStack.setId);
async function setText(n, s) { await font(n.fontName.family, n.fontName.style); n.characters = s; }
// ---------- Tag: Duplicate, Refund
const TAG = node(IDS.c_inputs.Tag.setId);
for (const [tn, lab, tk, ic] of [['Duplicate','중복 의심','feedback/error','copy'],['Refund','환불','feedback/info','refresh']]) for (const sz of ['M','S']) {
  if (TAG.children.find(v=>v.name===`Type=${tn}, Size=${sz}`)) continue;
  const v = TAG.children.find(x=>x.name===`Type=Pending, Size=${sz}`).clone(); TAG.appendChild(v); v.name = `Type=${tn}, Size=${sz}`;
  v.fills=[await P(tk+'/bg')]; v.strokes=[]; v.dashPattern=[];
  const i = v.findOne(n=>n.name==='icon'); i.swapComponent(node(IDS.icons.comp[ic])); await iconColor(i, tk+'/fg');
  const t = v.findOne(n=>n.name==='label'); await setText(t, lab); t.fills=[await P(tk+'/fg')];
}
{ const types=['Shared','Personal','Pending','Duplicate','Refund']; const pad=24, gx=24, gy=20; let x=pad; const cx=[];
  for (const tn of types) { cx.push(x); x += Math.max(...['M','S'].map(s=>TAG.children.find(v=>v.name===`Type=${tn}, Size=${s}`).width)) + gx; }
  types.forEach((tn,k)=>['M','S'].forEach((s,r)=>{ const v=TAG.children.find(x=>x.name===`Type=${tn}, Size=${s}`); v.x=cx[k]; v.y=pad + r*(26+gy) + (26-v.height)/2; }));
  TAG.resizeWithoutConstraints(x - gx + pad, pad*2 + 26*2 + gy);
  const st = TAG.parent, pn = st.parent; pn.resize(1000, pn.height); st.resizeWithoutConstraints(920, st.height);
  for (const t of st.children.filter(n=>n.type==='TEXT' && types.includes(n.characters))) t.remove();
  for (let k=0;k<types.length;k++) await axisLabel(st, types[k], TAG.x + cx[k], 0);
  const u = pn.findOne(n=>n.name==='usage'); await setText(u, '결제 행·상세·정산 내역에 붙는 비대화형 라벨. 개인(회색·자물쇠) = 나만 보임·정산 제외, 미확정(주황 점선) = 공동/개인 미지정, 중복 의심(빨강) = 같은 금액·가맹점 결제가 겹침, 환불(파랑) = 취소·환불 건. 공동 결제는 v1.2부터 Tag 대신 AvatarStack(부담 인원 프사).'); u.resize(920, u.height);
  fitStage(st);
  out.Tag = {setId:TAG.id, props:Object.fromEntries(Object.entries(TAG.componentPropertyDefinitions).map(([k,d])=>[k,d.variantOptions||d.type]))};
}
const tagV = (t,s) => TAG.children.find(v=>v.name===`Type=${t}, Size=${s}`);
const stack = () => { const i = STK.children.find(v=>v.name==='Count=4, Size=XS').createInstance(); i.name='participants'; return i; };
// ---------- PaymentRow
const PR = node(IDS.c_list.PaymentRow.setId);
for (const v of PR.children) {
  const mr = v.findOne(n=>n.name==='meta row');
  if (!mr.findOne(n=>n.name==='changed')) { const ch = frame({name:'changed', layout:'HORIZONTAL', gap:3, fill:'none', hug:'both', parent:mr, align:'CENTER'});
    const d = figma.createEllipse(); d.resize(6,6); d.name='dot'; ch.appendChild(d); d.fills=[await P('brand/accent')]; await T('변경됨', 'Caption', 'amount/send', {parent:ch, name:'changed label'}); ch.visible=false; }
  if (v.name.startsWith('Type=Shared')) {
    const tg = mr.findOne(n=>n.name==='tag'); tg.visible = false;
    if (!mr.findOne(n=>n.name==='participants')) { const s = stack(); mr.insertChild(mr.children.indexOf(tg)+1, s); try { s.isExposedInstance = true; } catch(e) {} }
    await setText(mr.findOne(n=>n.name==='meta'), '12:40 · 민지 결제');
  }
}
for (const [tn, srcT, tagT, mer, meta, amt, org] of [['Refund','Personal','Refund','이치란 라멘 도톤보리점','원 결제 10.28 12:40 · 취소','−₩28,400','−¥3,200'],['Duplicate','Pending','Duplicate','FamilyMart 난바역','15:12 · 하린 · 같은 금액 2건','₩5,320','¥599']]) for (const st of ['Default','Pressed']) {
  if (PR.children.find(v=>v.name===`Type=${tn}, State=${st}`)) continue;
  const v = PR.children.find(x=>x.name===`Type=${srcT}, State=${st}`).clone(); PR.appendChild(v); v.name = `Type=${tn}, State=${st}`;
  v.findOne(n=>n.name==='tag').swapComponent(tagV(tagT,'S'));
  await setText(v.findOne(n=>n.name==='merchant'), mer); await setText(v.findOne(n=>n.name==='meta'), meta);
  const a = v.findOne(n=>n.name==='amount'); await setText(a, amt); a.fills=[await P(tn==='Refund'?'text/secondary':'text/secondary')];
  await setText(v.findOne(n=>n.name==='original amount'), org);
  if (tn==='Refund') { const mr = v.findOne(n=>n.name==='meta row'); const li = iconInst('link', 12, null, 'link icon'); await iconColor(li,'icon/subtle'); mr.insertChild(mr.children.indexOf(v.findOne(n=>n.name==='meta')), li); }
}
let kCh = propKey(PR,'Changed'); if (!kCh) kCh = PR.addComponentProperty('Changed','BOOLEAN',false);
for (const v of PR.children) v.findOne(n=>n.name==='changed').componentPropertyReferences = {visible:kCh};
{ const types=['Shared','Personal','Pending','Refund','Duplicate']; const pad=16, gx=24, gy=12;
  const rh = Math.max(...PR.children.map(v=>v.height));
  types.forEach((tn,r)=>['Default','Pressed'].forEach((s,k)=>{ const v=PR.children.find(x=>x.name===`Type=${tn}, State=${s}`); v.x = pad + k*(390+gx); v.y = pad + r*(rh+gy); }));
  PR.resizeWithoutConstraints(pad*2 + 2*390 + gx, pad*2 + 5*rh + 4*gy);
  const st = PR.parent;
  for (const t of st.children.filter(n=>n.type==='TEXT' && (['Shared','Personal','Pending','Refund','Duplicate','Default','Pressed'].includes(n.characters) || n.characters.startsWith('텍스트: merchant')))) t.remove();
  await axisLabel(st, 'State=Default', PR.x+pad, 0); await axisLabel(st, 'State=Pressed', PR.x+pad+390+gx, 0);
  for (let r=0;r<5;r++) await axisLabel(st, types[r], PR.x-14, PR.y+pad+r*(rh+gy)+rh/2-8, {right:true});
  const note = await axisLabel(st, '공동(Shared) = 부담 인원 AvatarStack(participants, 노출된 중첩 인스턴스 → Count/Size 변경). 개인·미확정·중복 의심·환불 = Tag. Changed 속성 = "· 변경됨"(공동 결제가 수정됨). Refund = 마이너스 금액 + 링크 아이콘 + "원 결제 시각". 결제자 아바타(payer avatar)는 Source=Photo|Default|Initial.', PR.x, PR.y+PR.height+12);
  note.textAutoResize='HEIGHT'; note.resize(1300, note.height);
  const dh = node(IDS.c_list.DateHeader.componentId); const dhl = st.children.find(n=>n.type==='TEXT' && n.characters.startsWith('DateHeader —'));
  dh.y = note.y + note.height + 50; dhl.y = dh.y - 22;
  // example: payer photo + changed
  const old = st.findOne(n=>n.name==='example v1.2'); if (old) old.remove();
  const ex = frame({name:'example v1.2', layout:'VERTICAL', gap:0, hug:'both', parent:st, x:PR.x+390+gx+16, y:dh.y - 22, radius:16, clip:true}); ex.fills=[await P('bg/surface')]; await strokeV(ex,'border/default',1,'INSIDE');
  const r1 = PR.children.find(v=>v.name==='Type=Shared, State=Default').createInstance(); ex.appendChild(r1); r1.setProperties({[kCh]:true});
  const pa = r1.findOne(n=>n.name==='payer avatar'); pa.setProperties({Source:'Photo', Color:'Gray'});
  const r2 = PR.children.find(v=>v.name==='Type=Shared, State=Default').createInstance(); ex.appendChild(r2);
  r2.findOne(n=>n.name==='participants').setProperties({Count:'2'}); r2.findOne(n=>n.name==='payer avatar').setProperties({Source:'Default', Color:'Violet'});
  await setText(r2.findOne(n=>n.name==='merchant'), 'MK택시'); await setText(r2.findOne(n=>n.name==='meta'), '14:10 · 태현 결제'); await setText(r2.findOne(n=>n.name==='amount'), '₩26,290'); await setText(r2.findOne(n=>n.name==='original amount'), '¥2,860');
  await axisLabel(st, '↑ 사용 예: 결제자 사진 + Changed / 택시 2명 부담(Count=2) + 결제자 기본 이미지', ex.x, ex.y + ex.height + 8);
  fitStage(st);
  out.PaymentRow = {setId:PR.id, props:Object.fromEntries(Object.entries(PR.componentPropertyDefinitions).map(([k,d])=>[k,d.variantOptions||d.type])), variants:Object.fromEntries(PR.children.map(v=>[v.name,v.id]))};
  const u = st.parent.findOne(n=>n.name==='usage'); await setText(u, '결제 내역 리스트의 한 줄. 결제자 아바타(사진/기본/이니셜), 가맹점명, 시각·결제자, 공동이면 부담 인원 프사 스택, 개인·미확정·중복 의심·환불이면 Tag, 오른쪽 환산 금액(KRW) + 원통화. 미확정·중복은 금액을 보조색으로 낮춘다.');
}
// ---------- TimelineItem shared
const TL = node(IDS.c_list.TimelineItem.setId);
for (const v of TL.children.filter(v=>v.name.startsWith('Type=Shared'))) {
  const r2 = v.findOne(n=>n.name==='row2'); const tg = r2.findOne(n=>n.name==='tag'); tg.visible=false;
  if (!r2.findOne(n=>n.name==='participants')) { const s = stack(); r2.insertChild(r2.children.indexOf(tg)+1, s); try { s.isExposedInstance = true; } catch(e) {} }
  await setText(r2.findOne(n=>n.name==='meta'), '¥3,200 · 민지 결제');
}
{ const u = TL.parent.parent.findOne(n=>n.name==='usage'); await setText(u, '결제 내역 타임라인 보기. 시각 · 레일(점+선) · 카드. 점 색 = 지출 구분(공동 보라 / 개인 회색 / 미확정 주황 점선). 공동 카드에는 부담 인원 프사 스택(participants). Now = 현재 시각(노을색). Position=Last면 아래 선을 숨긴다.'); }
out.TimelineItem = {setId:TL.id};
return out;

async function setText(n, s) { await font(n.fontName.family, n.fontName.style); n.characters = s; }
const sheet = node(IDS.c_overlays.BottomSheet.componentId);
const lb = sheet.parent.children.find(n=>n.type==='TEXT' && n.characters.startsWith('↑ 결제 상세 시트')); if (lb) await setText(lb, '↑ Content = SheetContent/PaymentDetail');
const A = node(IDS.c_nav.Avatar.setId); const kR = propKey(A,'Ring'), kMe = propKey(A,'Me'), kL = propKey(A,'Left');
const imgB = figma.createImage(b64ToBytes(PHOTOS.b)).hash;
const pc = node(IDS.icons.foundations).findOne(n=>n.name==='Default profile image');
const content = pc.findOne(n=>n.name==='content');
const old = content.findOne(n=>n.name==='rules'); if (old) old.remove();
const rc = frame({name:'rules', layout:'VERTICAL', gap:28, fill:'none', hug:'both', parent:content});
await T('소스 우선순위', 'Heading/H2', 'text/primary', {parent:rc});
const pr = frame({name:'priority', layout:'HORIZONTAL', gap:24, fill:'none', hug:'both', parent:rc, align:'CENTER'});
const mk = (n, props={}) => { const i = A.children.find(v=>v.name===n).createInstance(); i.setProperties(props); return i; };
const steps = [['① 카카오 프사', 'Source=Photo', mk('Color=Gray, Size=XL, Source=Photo')], ['② 없으면 기본 이미지', 'Source=Default · Violet(기본) / Sunset(선택)', mk('Color=Violet, Size=XL, Source=Default')], ['③ 이미지 로딩 실패', 'Source=Initial · 합류 순서 색', mk('Color=Blue, Size=XL, Source=Initial')]];
for (let i=0;i<steps.length;i++) { const [t, s, inst] = steps[i];
  const col = frame({name:'step', layout:'VERTICAL', gap:8, fill:'none', hug:'both', parent:pr, align:'CENTER'}); col.appendChild(inst);
  await T(t, 'Label/M', 'text/primary', {parent:col}); await T(s, 'Caption', 'text/tertiary', {parent:col});
  if (i<2) { const ar = iconInst('chevron-right', 24, pr, 'arrow'); await iconColor(ar,'icon/subtle'); } }
await T('크기 (Avatar Size)', 'Heading/H2', 'text/primary', {parent:rc});
const sz = frame({name:'sizes', layout:'HORIZONTAL', gap:24, fill:'none', hug:'both', parent:rc, align:'MAX'});
for (const [s,px] of [['XS',20],['S',28],['M',36],['L',48],['XL',64]]) { const col = frame({name:s, layout:'VERTICAL', gap:6, fill:'none', hug:'both', parent:sz, align:'CENTER'}); col.appendChild(mk(`Color=Violet, Size=${s}, Source=Default`)); await T(`${s} ${px}`, 'Caption', 'text/tertiary', {parent:col}); }
await T('상태', 'Heading/H2', 'text/primary', {parent:rc});
const stt = frame({name:'states', layout:'HORIZONTAL', gap:28, fill:'none', hug:'both', parent:rc, align:'MAX'});
const ph = (props) => { const i = mk('Color=Gray, Size=L, Source=Photo', props); return i; };
const states = [['기본', {}], ['나 (Me)', {[kMe]:true}], ['나간 멤버 (Left)', {[kL]:true}], ['스택용 (Ring)', {[kR]:true}]];
for (const [t, p] of states) { const col = frame({name:t, layout:'VERTICAL', gap:6, fill:'none', hug:'both', parent:stt, align:'CENTER'}); if (t.startsWith('스택')) { col.fills=[await P('bg/muted')]; col.paddingLeft=col.paddingRight=8; col.paddingTop=8; col.paddingBottom=4; col.cornerRadius=8; }
  const i = ph(p); col.appendChild(i); if (t.startsWith('나 ')) { i.findOne(n=>n.name==='photo').fills=[{type:'IMAGE',scaleMode:'FILL',imageHash:imgB}]; }
  await T(t, 'Caption', 'text/secondary', {parent:col}); }
await T('사진만으로 사람을 구분하지 않는다: 상세·선택 화면에서는 항상 이름을 함께 쓰고, 스택에는 접근성 라벨("준용 외 3명")을 붙인다.\n샘플 사진은 플레이스홀더다 — 실제 화면에서는 카카오 프로필 이미지로 교체한다.', 'Body/S', 'text/secondary', {parent:rc, width:1600});
return {ok:true, h: pc.height};

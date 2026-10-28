const body = node(IDS.c_buttons.body);
const out = {};
const es = {}; for (const s of await figma.getLocalEffectStylesAsync()) es[s.name]=s;
async function eff(n, name) { try { await n.setEffectStyleIdAsync(es[name].id); } catch(e) { n.effectStyleId = es[name].id; } }
// ---------- Input
{
  const {p, stage} = await panel(body, 'Input', '그룹 생성(그룹명·장소·예산), 닉네임, 초대코드 입력. 라벨은 항상 위에, 헬퍼/오류 문구는 아래. 오류는 테두리 + 문구 + 아이콘 3중 표시(색만으로 구분하지 않음).', 1200);
  const ST = ['Default','Focus','Error','Disabled']; const items=[];
  for (let k=0;k<4;k++) { const st = ST[k];
    const c = comp(`State=${st}`, {layout:'VERTICAL', gap:8, w:350, hugMain:true}); c.counterAxisSizingMode='FIXED'; c.resize(350, c.height); c.counterAxisAlignItems='MIN';
    await T('그룹명', 'Body/S Strong', st==='Disabled'?'text/disabled':'text/primary', {parent:c, name:'label'});
    const f = frame({name:'field', layout:'HORIZONTAL', gap:8, pad:[0,16,0,16], h:52, w:350, parent:c, align:'CENTER'}); fillW(f); f.counterAxisSizingMode='FIXED';
    await bindRadius(f,'radius/md'); await bindPad(f,null,'space/16',null,'space/16');
    f.fills=[await P(st==='Disabled'?'bg/subtle':'bg/surface')];
    await strokeV(f, st==='Focus'?'border/focus':st==='Error'?'border/error':'border/default', st==='Focus'||st==='Error'?1.5:1, 'INSIDE');
    if (st==='Focus') await eff(f,'Focus/Ring');
    const val = await T(st==='Default'?'예) 오사카 우정여행':st==='Disabled'?'오사카 우정여행':'오사카 우정여행', 'Body/L', st==='Default'?'text/tertiary':st==='Disabled'?'text/disabled':'text/primary', {parent:f, name:'value'}); grow(val);
    const ti = iconInst(st==='Error'?'alert':'close', 20, f, 'trailing icon'); await iconColor(ti, st==='Error'?'text/error':'icon/subtle'); ti.visible = st==='Focus'||st==='Error';
    const hr = frame({name:'helper', layout:'HORIZONTAL', gap:4, fill:'none', hug:'both', parent:c, align:'CENTER'});
    await T(st==='Error'?'그룹명을 입력해 주세요 (최대 20자)':'여정 목록과 헤더에 보이는 이름이에요', 'Caption', st==='Error'?'text/error':st==='Disabled'?'text/disabled':'text/tertiary', {parent:hr, name:'helper text'});
    items.push({c, r:0, k});
  }
  const g = gridSet(items, stage, 'Input', {ox:0, oy:30, gx:32, pad:24});
  // 2x2 layout instead
  const vs = g.set.children; const pos=[[24,24],[24+350+40,24],[24,24+vs[0].height+40],[24+350+40,24+vs[0].height+40]];
  vs.forEach((v,i)=>{ v.x=pos[i][0]; v.y=pos[i][1]; }); g.set.resizeWithoutConstraints(24+350+40+350+24, 24+vs[0].height*2+40+24);
  const kL = g.set.addComponentProperty('Label', 'TEXT', '그룹명'); const kH = g.set.addComponentProperty('Helper', 'BOOLEAN', true);
  for (const v of g.set.children) { v.findOne(n=>n.name==='label').componentPropertyReferences={characters:kL}; v.findOne(n=>n.name==='helper').componentPropertyReferences={visible:kH}; }
  for (let i=0;i<4;i++) await axisLabel(stage, ST[i], pos[i][0], pos[i][1]-22+30);
  await axisLabel(stage, '텍스트 바꾸기: label(속성) · value · helper text 레이어. 우측 아이콘: trailing icon(포커스=지우기, 오류=경고).', 0, g.set.y+g.set.height+12);
  fitStage(stage);
  out.Input = {setId:g.set.id, props:{State:ST}, defaultVariantId:g.set.defaultVariant.id, textLayers:{label:'label (속성 Label)', value:'value', helper:'helper text'}, iconLayer:'trailing icon', propKeys:{Label:kL, Helper:kH}};
}
// ---------- Badge (trip status)
{
  const {p, stage} = await panel(body, 'Badge · 여정 상태', '여정 카드·헤더·여정 정보에서 현재 상태 표시. 시작 전(파랑 연한 면) → 진행 중(보라 솔리드 + 노을 점) → 종료(회색). 색 + 글자로 구분.', 640);
  const S = {Upcoming:['시작 전','trip/upcoming'], Active:['진행 중','trip/active'], Ended:['종료','trip/ended']}; const items=[]; let k=0;
  for (const [sn,[lab,tk]] of Object.entries(S)) { for (const [zn,h] of [['M',28],['S',22]]) {
    const c = comp(`Status=${sn}, Size=${zn}`, {layout:'HORIZONTAL', gap:6, pad:[0,zn==='M'?12:8,0,zn==='M'?10:7], h, radius:999}); c.counterAxisSizingMode='FIXED'; c.resize(c.width,h);
    c.fills=[await P(tk+'/bg')];
    const d = figma.createEllipse(); d.resize(zn==='M'?8:6, zn==='M'?8:6); d.name='dot'; d.fills=[await P(tk+'/dot')]; c.appendChild(d);
    await T(lab, zn==='M'?'Label/S':'Label/S', tk+'/fg', {parent:c, name:'label'});
    if (zn==='S') { const t=c.findOne(n=>n.name==='label'); t.fontSize=11; }
    items.push({c, r: zn==='M'?0:1, k}); } k++; }
  const g = gridSet(items, stage, 'Badge', {ox:40, oy:30, gx:24, gy:20, vcenter:true});
  Object.keys(S).forEach((s,i)=>axisLabel(stage, s, 40+g.cx[i], 0));
  await axisLabel(stage,'M',26,30+g.ry[0]+4,{right:true}); await axisLabel(stage,'S',26,30+g.ry[1]+2,{right:true});
  await axisLabel(stage, 'D-day 등 문구 변경: label 레이어 (예: "D-3", "2일차")', 0, g.set.y+g.set.height+12);
  fitStage(stage);
  out.Badge = {setId:g.set.id, props:{Status:Object.keys(S), Size:['M','S']}, defaultVariantId:g.set.defaultVariant.id, textLayer:'label'};
}
// ---------- Segmented control
{
  const {p, stage} = await panel(body, 'SegmentedControl', '같은 데이터의 보기 전환. 결제 내역 리스트/타임라인 전환, 공동/개인 전환(2개), 전체·공동·개인 필터(3개). 선택된 칸만 흰 면 + 그림자.', 1000);
  const items=[]; const defs = [[2,['리스트','타임라인']],[3,['전체','공동','개인']]];
  for (let r=0;r<2;r++) { const [n, labs] = defs[r];
    for (let s=0;s<n;s++) { const sel=['First','Second','Third'][s];
      const c = comp(`Count=${n}, Selected=${sel}`, {layout:'HORIZONTAL', gap:4, pad:4, w:350, h:44, hugMain:false, radius:999}); c.counterAxisSizingMode='FIXED'; c.resize(350,44);
      c.fills=[await P('bg/subtle')]; await bindRadius(c,'radius/full');
      for (let i=0;i<n;i++) { const seg = frame({name:'segment '+(i+1), layout:'HORIZONTAL', justify:'CENTER', align:'CENTER', h:36, w:100, parent:c, radius:999}); grow(seg); seg.layoutAlign='STRETCH';
        seg.fills = i===s ? [await P('bg/surface')] : []; if (i===s) await eff(seg,'Elevation/1');
        await T(labs[i], 'Label/M', i===s?'text/primary':'text/tertiary', {parent:seg, name:'label '+(i+1)}); }
      items.push({c, r, k:s}); } }
  const g = gridSet(items, stage, 'SegmentedControl', {ox:70, oy:30, gx:24, gy:20});
  ['First','Second','Third'].forEach((s,i)=>axisLabel(stage, 'Selected='+s, 70+g.cx[i], 0));
  await axisLabel(stage,'2개',56,30+g.ry[0]+12,{right:true}); await axisLabel(stage,'3개',56,30+g.ry[1]+12,{right:true});
  // example: personal/shared
  const ex = g.set.children.find(v=>v.name==='Count=2, Selected=Second').createInstance(); stage.appendChild(ex); ex.x=70; ex.y=g.set.y+g.set.height+40;
  for (const [ln, t] of [['label 1','개인'],['label 2','공동']]) { const tn = ex.findOne(n=>n.name===ln); await font('Noto Sans KR','Bold'); tn.characters=t; }
  await axisLabel(stage, '↑ 결제 상세: 개인/공동 전환 (label 1·2 텍스트만 교체)', 70+370, ex.y+12);
  fitStage(stage);
  out.SegmentedControl = {setId:g.set.id, props:{Count:['2','3'], Selected:['First','Second','Third(Count=3만)']}, defaultVariantId:g.set.defaultVariant.id, textLayers:['label 1','label 2','label 3']};
}
// ---------- Tag (expense type)
{
  const {p, stage} = await panel(body, 'Tag · 지출 구분', '결제 행·상세·정산 내역에 붙는 비대화형 라벨. 공동(보라) = 정산에 들어감, 개인(회색·자물쇠) = 나만 보임·정산 제외, 미확정(주황 점선) = 아직 공동/개인 미지정.', 760);
  const T3 = {Shared:['공동','expense/shared','users'], Personal:['개인','expense/personal','lock'], Pending:['미확정','expense/pending','clock']}; const items=[]; let k=0;
  for (const [tn,[lab,tk,ic]] of Object.entries(T3)) { for (const [zn,h,is] of [['M',26,14],['S',20,12]]) {
    const c = comp(`Type=${tn}, Size=${zn}`, {layout:'HORIZONTAL', gap:3, pad:[0,zn==='M'?8:6,0,zn==='M'?6:5], h}); c.counterAxisSizingMode='FIXED'; c.resize(c.width,h);
    await bindRadius(c,'radius/xs'); c.fills=[await P(tk+'/bg')];
    if (tn==='Pending') { await strokeV(c, tk+'/border', 1, 'INSIDE'); c.dashPattern=[3,2]; }
    const i = iconInst(ic, is, c, 'icon'); await iconColor(i, tk+'/fg');
    const t = await T(lab, 'Label/S', tk+'/fg', {parent:c, name:'label'}); if (zn==='S') t.fontSize=11;
    items.push({c, r: zn==='M'?0:1, k}); } k++; }
  const g = gridSet(items, stage, 'Tag', {ox:40, oy:30, gx:24, gy:20, vcenter:true});
  Object.keys(T3).forEach((s,i)=>axisLabel(stage, s, 40+g.cx[i], 0));
  await axisLabel(stage,'M',26,30+g.ry[0]+4,{right:true}); await axisLabel(stage,'S',26,30+g.ry[1]+2,{right:true});
  fitStage(stage);
  out.Tag = {setId:g.set.id, props:{Type:Object.keys(T3), Size:['M','S']}, defaultVariantId:g.set.defaultVariant.id, textLayer:'label', iconLayer:'icon'};
}
// ---------- Chip
{
  const {p, stage} = await panel(body, 'Chip', '선택형 칩. 부담 인원 고르기(일부 인원만 참여한 지출), 결제 내역 필터, 날짜 점프. 여러 개 선택 가능. 선택 = 보라 연한 면 + 체크.', 900);
  const ST = ['Default','Selected','Disabled']; const items=[];
  for (let k=0;k<3;k++) { const st=ST[k];
    const c = comp(`State=${st}`, {layout:'HORIZONTAL', gap:4, pad:[0,14,0,st==='Selected'?10:14], h:36, radius:999}); c.counterAxisSizingMode='FIXED'; c.resize(c.width,36);
    await bindRadius(c,'radius/full');
    c.fills=[await P(st==='Selected'?'bg/brand-subtle':st==='Disabled'?'bg/subtle':'bg/surface')];
    await strokeV(c, st==='Selected'?'border/focus':'border/default', 1, 'INSIDE');
    const i = iconInst('check', 16, c, 'icon'); await iconColor(i, 'icon/brand'); i.visible = st==='Selected';
    await T('민지', 'Label/M', st==='Selected'?'text/brand':st==='Disabled'?'text/disabled':'text/secondary', {parent:c, name:'label'});
    items.push({c, r:0, k}); }
  const g = gridSet(items, stage, 'Chip', {ox:0, oy:30, gx:24});
  const kL = g.set.addComponentProperty('Label', 'TEXT', '민지'); for (const v of g.set.children) v.findOne(n=>n.name==='label').componentPropertyReferences={characters:kL};
  ST.forEach((s,i)=>axisLabel(stage, s, g.cx[i], 0));
  const exr = frame({name:'example', layout:'HORIZONTAL', gap:8, fill:'none', hug:'both', parent:stage, x:0, y:g.set.y+g.set.height+40});
  for (const [nm, sel] of [['민지',1],['서준',1],['하린',0],['도윤',0]]) { const ins = g.set.children[sel?1:0].createInstance(); exr.appendChild(ins); ins.setProperties({[kL]:nm}); }
  await axisLabel(stage, '↑ "택시 · 2명 부담" — 참여한 사람만 선택', 0, exr.y+48);
  fitStage(stage);
  out.Chip = {setId:g.set.id, props:{State:ST}, defaultVariantId:g.set.defaultVariant.id, textLayer:'label', iconLayer:'icon', propKeys:{Label:kL}};
}
return out;

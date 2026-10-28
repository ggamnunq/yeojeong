const s1 = S1();
for (const c of [...s1.children]) if (c.name==='01 · 컬러') c.remove();
const area = s1.findOne(n=>n.name==='01 · 로고 변형' && n.parent===s1);
const Y0 = area.y + area.height + 160;
const {wrap, body} = await block(s1, {name:'01 · 컬러', x:120, y:Y0, w:2560, eyebrow:'COLOR', title:'컬러', desc:'팔레트(원색 스케일)는 직접 쓰지 않고, 아래 역할 토큰(bg/·text/·expense/·trip/ …)을 통해서만 쓴다. 모든 값은 Figma Variables 「여정/Color」와 같은 이름의 Paint style로 등록되어 있다.', gap:56});
async function swatchRow(title, sub, group, keys, w=218) {
  const row = frame({name:'palette/'+group, layout:'VERTICAL', gap:16, fill:'none', hug:'v', w:2560, parent:body});
  const ht = frame({name:'label', layout:'HORIZONTAL', gap:16, align:'MAX', fill:'none', hug:'both', parent:row});
  await T(title, 'Heading/H2', 'text/primary', {parent:ht}); await T(sub, 'Body/S', 'text/tertiary', {parent:ht});
  const sw = frame({name:'swatches', layout:'HORIZONTAL', gap:16, fill:'none', hug:'both', parent:row});
  for (const k of keys) {
    const name = group + '/' + k, hex = TOK.palette[group][k];
    const f = frame({name, layout:'VERTICAL', gap:2, pad:16, w, h:150, radius:16, parent:sw, justify:'MAX'}); await fillV(f, name);
    if (hex.toUpperCase()==='#FFFFFF' || lumHex(hex) > 0.9) await strokeV(f, 'border/default', 1, 'INSIDE');
    const tc = crHex(hex, '#FFFFFF') >= 3 ? 'text/inverse' : 'text/primary';
    await T(k==='500' && group==='primary' ? '500 · Brand' : k, 'Label/M', tc, {parent:f});
    const hx = await text(hex, {family:'Archivo', style:'Medium', size:13, color:'#000', parent:f}); hx.fills=[await P(tc)]; hx.opacity = 0.85;
  }
  return row;
}
await swatchRow('Primary · Journey Violet', '브랜드·주요 행동·공동 지출. 500 위 흰 글자 5.53:1(AA), 600 위 7.66:1(AAA)', 'primary', ['50','100','200','300','400','500','600','700','800','900']);
await swatchRow('Neutral · Cool Gray', '보랏빛이 아주 살짝 섞인 회색 — 프라이머리와 온도를 맞춤. 텍스트는 500 이상(4.9:1↑)', 'neutral', ['0','50','100','200','300','400','500','600','700','800','900'], 216);
// sunset + semantic in one row
{
  const row = frame({name:'palette/accent+semantic', layout:'HORIZONTAL', gap:40, fill:'none', hug:'both', parent:body});
  async function mini(title, sub, group, keys) {
    const col = frame({name:'palette/'+group, layout:'VERTICAL', gap:16, fill:'none', hug:'both', parent:row});
    await T(title, 'Heading/H3', 'text/primary', {parent:col}); await T(sub, 'Caption', 'text/tertiary', {parent:col});
    const sw = frame({name:'swatches', layout:'HORIZONTAL', gap:8, fill:'none', hug:'both', parent:col});
    for (const k of keys) { const name=group+'/'+k, hex=TOK.palette[group][k];
      const f = frame({name, layout:'VERTICAL', gap:2, pad:12, w: keys.length>3?118:120, h:120, radius:14, parent:sw, justify:'MAX'}); await fillV(f,name);
      const tc = crHex(hex,'#FFFFFF')>=3?'text/inverse':'text/primary';
      await T(k, 'Label/S', tc, {parent:f}); const hx = await text(hex,{family:'Archivo',style:'Medium',size:12,color:'#000',parent:f}); hx.fills=[await P(tc)]; }
  }
  await mini('Sunset · 포인트', '로고 도착점·보낼 금액. 넓은 면·상태 표시에 쓰지 않음', 'sunset', ['50','100','300','500','700']);
  await mini('Success', '완료·정산 끝', 'success', ['50','500','700']);
  await mini('Warning', '미확정·예산 80%', 'warning', ['50','500','700']);
  await mini('Error', '오류·예산 초과', 'error', ['50','500','700']);
  await mini('Info', '안내·시작 전', 'info', ['50','500','700']);
}
// role tokens
const groups = [
  ['배경 · 테두리', r=>r.name.startsWith('bg/')||r.name.startsWith('border/')],
  ['텍스트 · 아이콘', r=>r.name.startsWith('text/')||r.name.startsWith('icon/')],
  ['지출 구분 — 공동 vs 개인 (+ 미확정)', r=>r.name.startsWith('expense/')],
  ['여정 상태 — 시작 전 · 진행 중 · 종료', r=>r.name.startsWith('trip/')],
  ['금액 · 예산 · 브랜드', r=>r.name.startsWith('amount/')||r.name.startsWith('budget/')||r.name.startsWith('brand/')],
];
const rt = frame({name:'role tokens', layout:'VERTICAL', gap:40, fill:'none', hug:'v', w:2560, parent:body});
await T('역할 토큰 (Role tokens)', 'Heading/H1', 'text/primary', {parent:rt});
for (const [g, fn] of groups) {
  const gf = frame({name:'roles/'+g, layout:'VERTICAL', gap:16, fill:'none', hug:'v', w:2560, parent:rt});
  await T(g, 'Heading/H3', 'text/primary', {parent:gf});
  const grid = frame({name:'grid', layout:'HORIZONTAL', gap:16, fill:'none', hug:'v', w:2560, parent:gf}); grid.layoutWrap='WRAP'; grid.counterAxisSpacing=16;
  for (const r of TOK.roles.filter(fn)) {
    const it = frame({name:r.name, layout:'HORIZONTAL', gap:16, pad:16, w:628, hug:'v', radius:16, parent:grid, align:'CENTER'}); await fillV(it,'bg/surface');
    const sw = frame({name:'swatch', w:56, h:56, radius:12, parent:it}); await fillV(sw, r.name); await strokeV(sw,'border/default',1,'INSIDE');
    const tx = frame({name:'text', layout:'VERTICAL', gap:2, fill:'none', hug:'v', w:524, parent:it});
    const nm = frame({name:'nm', layout:'HORIZONTAL', gap:8, align:'CENTER', fill:'none', hug:'both', parent:tx});
    await T(r.name, 'Label/M', 'text/primary', {parent:nm});
    const hx = await text((r.ref ? r.ref + ' · ' : '') + r.hex + (r.alpha!=null ? ' @'+Math.round(r.alpha*100)+'%' : ''), {family:'Archivo', style:'Medium', size:12, color:'#70707E', parent:nm}); hx.fills=[await P('text/tertiary')];
    await T(r.desc, 'Body/S', 'text/secondary', {parent:tx, width:524});
  }
}
return {colors: wrap.id, h: wrap.height, y: wrap.y};

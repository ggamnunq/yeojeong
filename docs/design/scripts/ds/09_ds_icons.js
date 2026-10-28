const s2 = S2(); s2.fills=[solid('#F4F5F7')];
for (const c of [...s2.children]) c.remove();
const h = frame({name:'02 · Header', layout:'VERTICAL', gap:12, fill:'none', hug:'v', w:5160, parent:s2, x:120, y:120});
await eyebrow('YEOJEONG DESIGN SYSTEM · v1.0', h);
const ht = await text('02 디자인 시스템', {family:'Noto Sans KR', style:'Bold', size:72, letterSpacing:-2, color:'#14141E', parent:h}); ht.fills=[await P('text/primary')];
await T('Variables 「여정/Color」(Light) · 「여정/Size」, 같은 이름의 Paint/Text/Effect style, 그리고 오토레이아웃 컴포넌트. 모든 색은 역할 토큰 변수에 바인딩되어 있다. 인계 문서: ds/spec.md · ds/components.json · ds/README_handoff.md', 'Body/L', 'text/secondary', {parent:h, width:2400});
const {wrap, body} = await block(s2, {name:'02 · Foundations', x:120, y:400, w:5160, eyebrow:'FOUNDATIONS', title:'Foundations', desc:'색·타이포·간격·라운드·그림자·아이콘. 화면을 만들 때는 이 값 밖의 숫자를 쓰지 않는다.', gap:40});
for (const n of ['row/color','row/type-space-radius','row/elevation-layout','row/icons']) { const r = frame({name:n, layout:'HORIZONTAL', gap:40, fill:'none', hug:'v', w:5160, parent:body, align:'MIN'}); }
const row = body.findOne(n=>n.name==='row/icons');
const ic = card(row, {name:'Icons', w:5160, gap:24});
await eyebrow('ICONS · Icons8 Fluency Systems Regular (PNG)', ic);
await T('아이콘', 'Heading/H1', 'text/primary', {parent:ic});
await T('모노 선형 한 가지 스타일만 쓴다. 각 아이콘은 24×24 컴포넌트 `Icon/이름`이며, PNG를 알파 마스크로 깔고 그 위 `color` 레이어(기본 icon/default 변수)를 칠하는 구조라 인스턴스에서 color 레이어 fill만 바꾸면 어떤 토큰 색으로든 바뀐다. 크기는 16/20/24 사용.', 'Body/M', 'text/secondary', {parent:ic, width:2400});
const grid = frame({name:'grid', layout:'HORIZONTAL', gap:12, fill:'none', hug:'v', w:5064, parent:ic}); grid.layoutWrap='WRAP'; grid.counterAxisSpacing=12;
const comp = {};
for (const [name, b64] of Object.entries(ICONS)) {
  const cell = frame({name:'cell/'+name, layout:'VERTICAL', gap:10, pad:[20,8,14,8], w:113, hug:'v', align:'CENTER', radius:12, parent:grid}); await fillV(cell,'bg/canvas');
  const c = figma.createComponent(); c.name = 'Icon/' + name; c.resize(24,24); c.fills=[]; c.clipsContent = true;
  cell.appendChild(c);
  const m = imageNode(b64, {w:24, parent:c, name:'mask'}); m.isMask = true; m.constraints={horizontal:'SCALE',vertical:'SCALE'};
  const col = rect({w:24, h:24, parent:c, name:'color'}); await fillV(col,'icon/default'); col.constraints={horizontal:'SCALE',vertical:'SCALE'};
  c.description = 'Icons8 fluency-systems-regular. 색 변경: 인스턴스의 `color` 레이어 fill을 토큰 변수로 교체.';
  await T(name, 'Caption', 'text/secondary', {parent:cell});
  comp[name] = c.id;
}
// kakao symbol (color PNG) as component
const kc = frame({name:'cell/kakao', layout:'VERTICAL', gap:10, pad:[20,8,14,8], w:113, hug:'v', align:'CENTER', radius:12, parent:grid}); await fillV(kc,'bg/canvas');
const kk = figma.createComponent(); kk.name='Brand/KakaoSymbol'; kk.resize(24,24); kk.fills=[]; kc.appendChild(kk);
const ki = imageNode(KAKAO, {w:24, parent:kk, name:'kakaotalk'}); ki.constraints={horizontal:'SCALE',vertical:'SCALE'};
await T('kakao (color)', 'Caption', 'text/secondary', {parent:kc});
comp['kakao'] = kk.id;
return {header:h.id, foundations:wrap.id, comp};

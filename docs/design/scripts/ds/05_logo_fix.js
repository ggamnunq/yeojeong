const s1 = S1(); const L = IDS.logo;
const ai = node(L['Logo/AppIcon']);
const r1 = ai.findOne(n=>n.name==='start ㅇ'), r2 = ai.findOne(n=>n.name==='destination ㅇ'), rt = ai.findOne(n=>n.name==='route');
const k = 0.8;
for (const r of [r1, r2]) { r.constraints={horizontal:'MIN',vertical:'MIN'}; r.rescale(k); }
r1.x = 214; r1.y = 196;
r2.x = 500; r2.y = 652;
const sx = r1.x + r1.width + 46, sy = r1.y + r1.height * 0.30;
const ex = r2.x + r2.width * 0.62, ey = r2.y - 52;
rt.vectorPaths = [{windingRule:'NONE', data:`M ${sx} ${sy} C ${sx+170} ${sy-10} ${ex+90} ${sy+150} ${ex} ${ey}`}];
rt.strokeWeight = 28; rt.dashPattern = [0.01, 56];
for (const n of [r1,r2,rt]) n.constraints={horizontal:'SCALE', vertical:'SCALE'};
// card heights / caption
const area = s1.findOne(n=>n.name==='01 · 로고 변형' && n.parent===s1);
const aiCard = area.findOne(n=>n.name==='card/Logo/AppIcon'); aiCard.resizeWithoutConstraints(1240, 1500);
const cap = aiCard.children.find(n=>n.type==='TEXT' && n.characters.startsWith('축약 마크')); cap.y = 1420;
const ms = area.findOne(n=>n.name==='card/Logo/MinSize'); ms.resizeWithoutConstraints(1279, 760);
const msNote = ms.children.find(n=>n.type==='TEXT' && n.characters.startsWith('워드마크')); msNote.y = 560;
area.resizeWithoutConstraints(2560, area.height + 80);
// ---- hero card next to overview
for (const c of [...s1.children]) if (c.name==='01 · 로고 히어로') c.remove();
const ov = node(IDS.brand_head.overview);
const hero = frame({name:'01 · 로고 히어로', w:1240, h:ov.height, parent:s1, x:1440, y:400, radius:24}); await fillV(hero,'bg/surface');
const eb = await eyebrow('PRIMARY WORDMARK', hero); eb.x = 48; eb.y = 48;
const sc = 3.4; const inst = node(L['Logo/Primary']).createInstance(); hero.appendChild(inst); inst.rescale(sc);
inst.x = Math.round((1240 - inst.width)/2); inst.y = 170;
const dest = inst.findOne(n=>n.name==='destination ㅇ');
// annotations
async function anno(label, sub, tx, ty, px, py, color) {
  const dot = figma.createEllipse(); dot.resize(12,12); hero.appendChild(dot); dot.x = px-6; dot.y = py-6; dot.fills=[await P(color)];
  const ln = figma.createVector(); hero.appendChild(ln); ln.vectorPaths=[{windingRule:'NONE', data:`M ${px} ${py} L ${tx} ${ty}`}]; ln.strokes=[await P(color)]; ln.strokeWeight=1.5; ln.fills=[];
  const g = frame({name:'anno', layout:'VERTICAL', gap:2, fill:'none', hug:'both', parent:hero});
  await T(label, 'Label/M', color==='brand/accent'?'amount/send':'text/brand', {parent:g}); await T(sub, 'Caption', 'text/tertiary', {parent:g});
  g.x = tx < px ? tx - g.width - 10 : tx + 10; g.y = ty - 18;
}
const sxp = inst.x + 25*sc, syp = inst.y + 43*sc;
await anno('출발 · 첫 ㅇ', '함께 떠나는 지점', inst.x - 70, inst.y + 60, sxp - 12*sc, syp - 20*sc, 'primary/500');
await anno('도착 · 받침 ㅇ', 'Sunset #FF7A59 — 여정의 끝, 정산 완료', inst.x + inst.width + 70, inst.y + inst.height - 40, inst.x + (dest.x + dest.width) * 1 - 8, inst.y + dest.y + dest.height/2, 'brand/accent');
const capt = await T('Gothic A1 Black · 자간 −7% · 워드마크 높이 기준 96px 컴포넌트. 두 ㅇ의 대비(출발=보라, 도착=노을)가 유일한 장식이다.', 'Body/S', 'text/secondary', {parent:hero, width:1144}); capt.x = 48; capt.y = ov.height - 48 - capt.height;
return {hero: hero.id, destX: dest.x, destW: dest.width};

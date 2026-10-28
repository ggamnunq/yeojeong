// v3.1: 04 전체의 점선 테두리 → 실선 연회색 #E5E7EB 1px (노드 ID 유지)
const s = SEC();
const wfOf = n => { let p = n; while (p && !(p.type === 'FRAME' && /^WF-\d\d /.test(p.name))) p = p.parent; return p ? p.name.slice(0, 5) : (n.parent ? n.parent.name : null); };
const dashed = s.findAll(n => 'dashPattern' in n && n.dashPattern && n.dashPattern.length > 0);
const where = {};
for (const n of dashed) {
  n.dashPattern = []; n.strokes = [solid(C.box)]; n.strokeWeight = 1;
  const w = wfOf(n) || '?'; where[w] = (where[w] || 0) + 1;
}
let banners = 0;
for (const b of s.findAll(n => n.type === 'FRAME' && n.name === 'Banner/미확정')) { b.strokes = [solid(C.box)]; b.strokeWeight = 1; b.dashPattern = []; banners++; }
const left = s.findAll(n => 'dashPattern' in n && n.dashPattern && n.dashPattern.length > 0).length;
return { dashedFixed: dashed.length, where, bannersToE5E7EB: banners, remainingDashed: left };

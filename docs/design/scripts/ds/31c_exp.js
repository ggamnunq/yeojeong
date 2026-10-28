const f = node('24:29748'); for (const c of [...f.children]) c.remove(); f.layoutMode='VERTICAL'; f.itemSpacing=16;
const cases = [['A ls-0.6', '₩11,770', -0.6, 32], ['B ls0', '₩11,770', 0, 32], ['C space', ' ₩11,770', -0.6, 32], ['D 160 ls-3', '₩11', -3, 160], ['E 160 ls0', '₩11', 0, 160]];
const out = {};
for (const [k, s, ls, sz] of cases) { const t = await text(s, {family:'Archivo', style:'Bold', size:sz, letterSpacing:ls, color:'#14141E', parent:f, name:k}); t.fills=[solid('#14141E')];
  const bg = t.absoluteBoundingBox, rb = t.absoluteRenderBounds; out[k] = {dx: +(rb.x - bg.x).toFixed(2)}; }
return out;

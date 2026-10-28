const s2 = S2(); const f = frame({name:'__glyph_test', layout:'HORIZONTAL', gap:60, pad:60, hug:'both', parent:s2, x:6000, y:0, fill:'#FFFFFF'});
const out = {};
for (const [fam, st] of [['Archivo','Bold'],['Archivo','SemiBold'],['Noto Sans KR','Bold'],['IBM Plex Sans','Bold'],['Roboto','Bold']]) {
  const t = await text('₩1', {family:fam, style:st, size:160, color:'#14141E', parent:f});
  out[fam+' '+st] = {bbX:t.absoluteBoundingBox.x, rbX:t.absoluteRenderBounds.x, w:t.width, rw:t.absoluteRenderBounds.width};
}
out.id = f.id; return out;

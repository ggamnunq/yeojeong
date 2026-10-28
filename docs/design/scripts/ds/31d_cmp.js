const f = node('24:29748'); for (const c of [...f.children]) c.remove(); f.layoutMode='VERTICAL'; f.itemSpacing=14;
const out = {};
for (const [fam, st] of [['Archivo','Bold'],['IBM Plex Sans KR','Bold'],['IBM Plex Sans KR','SemiBold'],['IBM Plex Sans','Bold']]) {
  const t = await text('₩11,770  ₩1,284,000  1인 ₩9,467', {family:fam, style:st, size:32, letterSpacing:-0.6, color:'#14141E', parent:f, name:fam+' '+st});
  const z = await text('0000000000', {family:fam, style:st, size:32, parent:f}); const o = await text('1111111111', {family:fam, style:st, size:32, parent:f});
  out[fam+' '+st] = [Math.round(z.width), Math.round(o.width)]; z.remove(); o.remove();
}
return out;

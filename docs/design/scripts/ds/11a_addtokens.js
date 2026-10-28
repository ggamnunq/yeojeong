const col = (await figma.variables.getLocalVariableCollectionsAsync()).find(c=>c.name==='여정/Color');
const m = col.modes[0].modeId; const vs = await allVars(); const out = {};
async function ensure(name, val, desc) { let v = vs[name]; if (!v) { v = figma.variables.createVariable(name, col, 'COLOR'); }
  v.setValueForMode(m, val); v.description = desc; vs[name]=v; out[name]=v.id;
  const ps = (await figma.getLocalPaintStylesAsync()).find(s=>s.name==='여정/'+name) || figma.createPaintStyle(); ps.name='여정/'+name;
  ps.paints=[figma.variables.setBoundVariableForPaint({type:'SOLID',color:rgb(hexOf(name))},'color',v)]; ps.description=desc; out['ps:'+name]=ps.id; }
const c = rgb('#9E1B21'); await ensure('error/800', {r:c.r,g:c.g,b:c.b,a:1}, '#9E1B21');
for (const n of ['bg/danger','bg/danger-pressed','bg/pressed']) { const r = TOK.roles.find(x=>x.name===n); await ensure(n, figma.variables.createVariableAlias(vs[r.ref]), r.desc+' → '+r.ref+' · '+r.hex); }
return out;

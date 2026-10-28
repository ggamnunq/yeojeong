// cleanup previous runs (own names only)
for (const c of await figma.variables.getLocalVariableCollectionsAsync()) if (c.name.startsWith('여정/')) c.remove();
for (const s of await figma.getLocalPaintStylesAsync()) if (s.name.startsWith('여정/')) s.remove();
for (const s of await figma.getLocalTextStylesAsync()) if (s.name.startsWith('여정/') || TYPE[s.name]) s.remove();
for (const s of await figma.getLocalEffectStylesAsync()) if (s.name.startsWith('Elevation/') || s.name.startsWith('Focus/')) s.remove();
const out = { colorCollection: null, sizeCollection: null, vars: {}, paintStyles: {}, textStyles: {}, effectStyles: {} };
const col = figma.variables.createVariableCollection('여정/Color');
col.renameMode(col.modes[0].modeId, 'Light');
const m = col.modes[0].modeId;
out.colorCollection = col.id;
const pv = {};
for (const [g, scale] of Object.entries(TOK.palette)) for (const [k, hex] of Object.entries(scale)) {
  const name = g + '/' + k;
  const v = figma.variables.createVariable(name, col, 'COLOR');
  const c = rgb(hex); v.setValueForMode(m, { r: c.r, g: c.g, b: c.b, a: 1 });
  v.description = hex;
  pv[name] = v; out.vars[name] = v.id;
}
for (const r of TOK.roles) {
  const v = figma.variables.createVariable(r.name, col, 'COLOR');
  if (r.ref && pv[r.ref]) v.setValueForMode(m, figma.variables.createVariableAlias(pv[r.ref]));
  else { const c = rgb(r.hex); v.setValueForMode(m, { r: c.r, g: c.g, b: c.b, a: r.alpha == null ? 1 : r.alpha }); }
  v.description = r.desc + (r.ref ? ' → ' + r.ref : '') + ' · ' + r.hex + (r.alpha != null ? ' @' + Math.round(r.alpha * 100) + '%' : '');
  pv[r.name] = v; out.vars[r.name] = v.id;
}
const sc = figma.variables.createVariableCollection('여정/Size');
sc.renameMode(sc.modes[0].modeId, 'Default');
const sm = sc.modes[0].modeId; out.sizeCollection = sc.id;
for (const [g, vals] of Object.entries(TOK.size)) for (const [k, n] of Object.entries(vals)) {
  const v = figma.variables.createVariable(g + '/' + k, sc, 'FLOAT');
  v.setValueForMode(sm, n);
  try { v.scopes = g === 'space' ? ['GAP', 'WIDTH_HEIGHT'] : g === 'radius' ? ['CORNER_RADIUS'] : ['WIDTH_HEIGHT', 'GAP']; } catch (e) {}
  out.vars[g + '/' + k] = v.id;
}
// paint styles bound to variables (same names, prefixed by 여정/ only for grouping in style picker)
for (const [name, v] of Object.entries(pv)) {
  const s = figma.createPaintStyle(); s.name = '여정/' + name;
  const r = TOK.roles.find(x => x.name === name);
  const p = { type: 'SOLID', color: rgb(hexOf(name)) }; if (r && r.alpha != null) p.opacity = r.alpha;
  let bound = p; try { bound = figma.variables.setBoundVariableForPaint(p, 'color', v); } catch (e) {}
  s.paints = [bound];
  s.description = v.description;
  out.paintStyles[name] = s.id;
}
// text styles
for (const [name, d] of Object.entries(TYPE)) {
  await font(d.f, d.s);
  const s = figma.createTextStyle(); s.name = name;
  s.fontName = { family: d.f, style: d.s }; s.fontSize = d.size;
  s.lineHeight = { unit: 'PIXELS', value: d.lh }; s.letterSpacing = { unit: 'PIXELS', value: d.ls };
  s.description = `${d.f} ${d.s} ${d.size}/${d.lh} · ${d.ls}px`;
  out.textStyles[name] = s.id;
}
// effect styles
const sh = (y, blur, a, spread = 0, hex = '#14141E') => { const c = rgb(hex); return { type: 'DROP_SHADOW', color: { r: c.r, g: c.g, b: c.b, a }, offset: { x: 0, y }, radius: blur, spread, visible: true, blendMode: 'NORMAL' }; };
const eff = {
  'Elevation/1': { e: [sh(1, 2, 0.06), sh(2, 6, 0.04)], d: '카드·리스트 그룹 — 0 1 2 6% + 0 2 6 4%' },
  'Elevation/2': { e: [sh(4, 16, 0.08), sh(1, 4, 0.04)], d: '드롭다운·토스트·떠 있는 버튼 — 0 4 16 8% + 0 1 4 4%' },
  'Elevation/3': { e: [sh(12, 32, 0.16), sh(2, 8, 0.06)], d: '바텀시트·다이얼로그 — 0 12 32 16% + 0 2 8 6%' },
  'Focus/Ring': { e: [sh(0, 0, 1, 3, '#D0CCFF')], d: '포커스 링 — 0 0 0 3px primary/200' },
};
for (const [name, x] of Object.entries(eff)) { const s = figma.createEffectStyle(); s.name = name; s.effects = x.e; s.description = x.d; out.effectStyles[name] = s.id; }
return out;

// ---- ds lib (TOK, IDS injected above) ----
const TYPE = {
 'Display':       {f:'Noto Sans KR', s:'Bold',    size:32, lh:42, ls:-0.8},
 'Heading/H1':    {f:'Noto Sans KR', s:'Bold',    size:26, lh:36, ls:-0.6},
 'Heading/H2':    {f:'Noto Sans KR', s:'Bold',    size:22, lh:30, ls:-0.4},
 'Heading/H3':    {f:'Noto Sans KR', s:'Bold',    size:18, lh:26, ls:-0.3},
 'Body/L':        {f:'Noto Sans KR', s:'Regular', size:16, lh:24, ls:-0.2},
 'Body/L Strong': {f:'Noto Sans KR', s:'Medium',  size:16, lh:24, ls:-0.2},
 'Body/M':        {f:'Noto Sans KR', s:'Regular', size:15, lh:22, ls:-0.15},
 'Body/M Strong': {f:'Noto Sans KR', s:'Medium',  size:15, lh:22, ls:-0.15},
 'Body/S':        {f:'Noto Sans KR', s:'Regular', size:13, lh:19, ls:-0.1},
 'Body/S Strong': {f:'Noto Sans KR', s:'Medium',  size:13, lh:19, ls:-0.1},
 'Caption':       {f:'Noto Sans KR', s:'Regular', size:12, lh:16, ls:0},
 'Label/L':       {f:'Noto Sans KR', s:'Bold',    size:16, lh:22, ls:-0.2},
 'Label/M':       {f:'Noto Sans KR', s:'Bold',    size:14, lh:20, ls:-0.1},
 'Label/S':       {f:'Noto Sans KR', s:'Medium',  size:12, lh:16, ls:0},
 'Amount/L':      {f:'Archivo',      s:'Bold',    size:32, lh:40, ls:-0.6},
 'Amount/M':      {f:'Archivo',      s:'SemiBold',size:20, lh:28, ls:-0.3},
 'Amount/S':      {f:'Archivo',      s:'SemiBold',size:15, lh:20, ls:-0.1},
};
function hexOf(name) {
  const r = TOK.roles.find(r => r.name === name); if (r) return r.hex;
  const [g, k] = name.split('/'); if (TOK.palette[g] && TOK.palette[g][k]) return TOK.palette[g][k];
  if (name.startsWith('#')) return name;
  throw new Error('unknown color token ' + name);
}
let __vars = null;
async function allVars() { if (!__vars) { __vars = {}; for (const v of await figma.variables.getLocalVariablesAsync()) __vars[v.name] = v; } return __vars; }
async function V(name) { const v = (await allVars())[name]; if (!v) throw new Error('var not found ' + name); return v; }
async function P(name, opacity) {
  const p = { type: 'SOLID', color: rgb(hexOf(name)) }; if (opacity !== undefined) p.opacity = opacity;
  try { return figma.variables.setBoundVariableForPaint(p, 'color', await V(name)); } catch (e) { return p; }
}
async function fillV(node, name, opacity) { node.fills = [await P(name, opacity)]; return node; }
async function strokeV(node, name, w = 1, align) { node.strokes = [await P(name)]; node.strokeWeight = w; if (align) node.strokeAlign = align; return node; }
async function bindN(node, field, name) { try { node.setBoundVariable(field, await V(name)); } catch (e) { } return node; }
async function bindPad(node, t, r, b, l) { if (t) await bindN(node,'paddingTop',t); if (r) await bindN(node,'paddingRight',r); if (b) await bindN(node,'paddingBottom',b); if (l) await bindN(node,'paddingLeft',l); }
async function bindRadius(node, name) { for (const f of ['topLeftRadius','topRightRadius','bottomLeftRadius','bottomRightRadius']) await bindN(node, f, name); }
let __ts = null;
async function TS(name) { if (!__ts) { __ts = {}; for (const s of await figma.getLocalTextStylesAsync()) __ts[s.name] = s; } return __ts[name]; }
// T('텍스트', 'Body/M', 'text/primary', {name, width, align, parent})
async function T(chars, style, color = 'text/primary', o = {}) {
  const d = TYPE[style]; if (!d) throw new Error('unknown type ' + style);
  const t = figma.createText();
  t.fontName = await font(d.f, d.s);
  t.characters = chars; t.fontSize = d.size;
  t.lineHeight = { unit: 'PIXELS', value: d.lh }; t.letterSpacing = { unit: 'PIXELS', value: d.ls };
  const st = await TS(style);
  if (st) { try { await t.setTextStyleIdAsync(st.id); } catch (e) { try { t.textStyleId = st.id; } catch (e2) {} } }
  t.fills = [await P(color)];
  if (o.align) t.textAlignHorizontal = o.align;
  if (o.width) { t.textAutoResize = 'HEIGHT'; t.resize(o.width, t.height); } else t.textAutoResize = 'WIDTH_AND_HEIGHT';
  t.name = o.name || chars.slice(0, 24);
  if (o.parent) o.parent.appendChild(t);
  return t;
}
// icon instance from Icon components (IDS.icons.comp[name])
function iconInst(name, size = 24, parent, layerName) {
  const id = IDS.icons && IDS.icons.comp && IDS.icons.comp[name]; if (!id) throw new Error('icon not found ' + name);
  const i = node(id).createInstance(); if (size !== 24) i.resize(size, size); i.name = layerName || 'icon';
  if (parent) parent.appendChild(i); return i;
}
async function iconColor(inst, colorToken) { const c = inst.findOne(n => n.name === 'color'); if (c) c.fills = [await P(colorToken)]; return inst; }
// eslint-disable-next-line
const S1 = () => section('01 브랜드 · 로고'); const S2 = () => section('02 디자인 시스템');
// ---- end ds lib ----
// ---- presentation helpers ----
async function eyebrow(txt, parent, color = 'text/brand') { const t = await text(txt, { family: 'Archivo', style: 'SemiBold', size: 14, letterSpacing: 2, color: hexOf(color), parent }); t.fills = [await P(color)]; t.name = 'eyebrow'; return t; }
// block: vertical stack with eyebrow + title + optional desc, returns {wrap, body}
async function block(parent, o) {
  const wrap = frame({ name: o.name, layout: 'VERTICAL', gap: 32, fill: 'none', hug: 'v', w: o.w, parent, x: o.x, y: o.y });
  const head = frame({ name: 'head', layout: 'VERTICAL', gap: 8, fill: 'none', hug: 'v', w: o.w, parent: wrap });
  if (o.eyebrow) await eyebrow(o.eyebrow, head);
  await T(o.title, 'Display', 'text/primary', { parent: head, name: 'title' });
  if (o.desc) await T(o.desc, 'Body/L', 'text/secondary', { parent: head, width: Math.min(o.w, 1400), name: 'desc' });
  const body = frame({ name: 'body', layout: o.bodyLayout || 'VERTICAL', gap: o.gap || 32, fill: 'none', hug: 'v', w: o.w, parent: wrap });
  if (o.bodyLayout === 'HORIZONTAL') { body.layoutWrap = o.wrap ? 'WRAP' : 'NO_WRAP'; body.counterAxisSpacing = o.gap || 32; }
  return { wrap, body };
}
function card(parent, o = {}) {
  const c = frame(Object.assign({ fill: '#FFFFFF', radius: 24, layout: 'VERTICAL', gap: 24, pad: 48, hug: 'v' }, o, { parent }));
  return c;
}
function lumHex(h){ const c=rgb(h); const f=x=>x<=0.04045?x/12.92:Math.pow((x+0.055)/1.055,2.4); return 0.2126*f(c.r)+0.7152*f(c.g)+0.0722*f(c.b); }
function crHex(a,b){ const x=lumHex(a), y=lumHex(b); return (Math.max(x,y)+0.05)/(Math.min(x,y)+0.05); }
// ---- component builders ----
// panel inside a row: title + usage + stage (absolute) ; returns {p, stage}
async function panel(row, title, usage, w) {
  const p = card(row, {name:'panel/'+title, w, gap:16, pad:40});
  await T(title, 'Heading/H2', 'text/primary', {parent:p, name:'title'});
  await T(usage, 'Body/S', 'text/secondary', {parent:p, width:w-80, name:'usage'});
  const stage = frame({name:'stage', w:w-80, h:100, fill:'none', parent:p}); stage.clipsContent=false;
  return {p, stage};
}
// combine comps into a set placed in stage; grid by r/c props given per comp: items=[{c, r, k}] (r=row index, k=col index)
function gridSet(items, stage, name, o = {}) {
  const pad = o.pad ?? 24, gx = o.gx ?? 24, gy = o.gy ?? 24, ox = o.ox ?? 0, oy = o.oy ?? 0;
  const set = figma.combineAsVariants(items.map(i=>i.c), stage); set.name = name;
  const nr = Math.max(...items.map(i=>i.r))+1, nc = Math.max(...items.map(i=>i.k))+1;
  const colW = Array(nc).fill(0), rowH = Array(nr).fill(0);
  for (const i of items) { colW[i.k] = Math.max(colW[i.k], i.c.width); rowH[i.r] = Math.max(rowH[i.r], i.c.height); }
  if (o.colW) colW.fill(Math.max(o.colW, ...colW));
  const cx = [pad], ry = [pad]; for (let k=1;k<nc;k++) cx[k]=cx[k-1]+colW[k-1]+gx; for (let r=1;r<nr;r++) ry[r]=ry[r-1]+rowH[r-1]+gy;
  for (const i of items) { i.c.x = cx[i.k]; i.c.y = ry[i.r] + (o.vcenter ? (rowH[i.r]-i.c.height)/2 : 0); }
  set.resizeWithoutConstraints(cx[nc-1]+colW[nc-1]+pad, ry[nr-1]+rowH[nr-1]+pad);
  set.x = ox; set.y = oy;
  set.fills = [solid('#FFFFFF')]; set.strokes=[solid('#9747FF')]; set.dashPattern=[6,4]; set.strokeWeight=1; set.cornerRadius=12;
  return {set, cx, ry, colW, rowH};
}
function fitStage(stage, extra = 0) { let mw=0, mh=0; for (const c of stage.children) { mw=Math.max(mw,c.x+c.width); mh=Math.max(mh,c.y+c.height); } stage.resizeWithoutConstraints(Math.max(stage.width, mw), mh + extra); }
async function axisLabel(stage, txt, x, y, o={}) { const t = await T(txt, 'Caption', 'text/tertiary', {parent:stage}); t.x = x; t.y = y; if (o.right) t.x = x - t.width; return t; }
function comp(name, o = {}) { const c = figma.createComponent(); c.name = name; c.fills = []; if (o.layout) { c.layoutMode = o.layout; c.itemSpacing = o.gap||0; c.counterAxisAlignItems = o.align||'CENTER'; c.primaryAxisAlignItems = o.justify||'MIN';
  const p = o.pad===undefined?0:o.pad; const [pt,pr,pb,pl] = Array.isArray(p)?p:[p,p,p,p]; c.paddingTop=pt; c.paddingRight=pr; c.paddingBottom=pb; c.paddingLeft=pl;
  c.primaryAxisSizingMode = o.hugMain===false?'FIXED':'AUTO'; c.counterAxisSizingMode = o.hugCross?'AUTO':'FIXED'; }
  if (o.w || o.h) c.resize(o.w || c.width, o.h || c.height); if (o.radius!==undefined) c.cornerRadius=o.radius; return c; }
function propKey(set, name) { const d = set.componentPropertyDefinitions; return Object.keys(d).find(k => k.split('#')[0] === name); }

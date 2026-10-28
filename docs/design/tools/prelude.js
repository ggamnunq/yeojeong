// ---- prelude: small helpers available to every figrun.py script ----
// All helpers are plain functions on top of the Figma Plugin API (`figma` global).
const __fontCache = new Set();
async function font(family, style) {
  const key = family + '|' + style;
  if (!__fontCache.has(key)) { await figma.loadFontAsync({ family, style }); __fontCache.add(key); }
  return { family, style };
}
// '#RRGGBB' | '#RGB' -> {r,g,b} in 0..1
function rgb(hex) {
  let h = hex.replace('#', '');
  if (h.length === 3) h = h.split('').map(c => c + c).join('');
  const n = parseInt(h, 16);
  return { r: ((n >> 16) & 255) / 255, g: ((n >> 8) & 255) / 255, b: (n & 255) / 255 };
}
function solid(hex, opacity) { const p = { type: 'SOLID', color: rgb(hex) }; if (opacity !== undefined) p.opacity = opacity; return p; }
// text('안녕', {family:'Noto Sans KR', style:'Bold', size:16, color:'#111', lineHeight:24, letterSpacing:-0.2, align:'LEFT', width:200})
async function text(chars, o = {}) {
  const fam = o.family || 'Noto Sans KR', sty = o.style || 'Regular';
  const t = figma.createText();
  t.fontName = await font(fam, sty);
  t.characters = chars;
  t.fontSize = o.size || 14;
  if (o.lineHeight) t.lineHeight = { unit: 'PIXELS', value: o.lineHeight };
  if (o.letterSpacing !== undefined) t.letterSpacing = { unit: 'PIXELS', value: o.letterSpacing };
  t.fills = [solid(o.color || '#111111')];
  if (o.align) t.textAlignHorizontal = o.align;
  if (o.width) { t.textAutoResize = 'HEIGHT'; t.resize(o.width, t.height); } else t.textAutoResize = 'WIDTH_AND_HEIGHT';
  if (o.name) t.name = o.name;
  if (o.parent) o.parent.appendChild(t);
  if (o.x !== undefined) t.x = o.x; if (o.y !== undefined) t.y = o.y;
  return t;
}
// frame({name, w, h, fill:'#fff', radius, layout:'VERTICAL'|'HORIZONTAL'|'NONE', gap, pad:[t,r,b,l]|n, align:'MIN'|'CENTER'|'MAX', justify:'MIN'|'CENTER'|'MAX'|'SPACE_BETWEEN', hug:'both'|'h'|'v', parent, stroke:'#eee', strokeWeight})
function frame(o = {}) {
  const f = figma.createFrame();
  if (o.name) f.name = o.name;
  f.resize(o.w || 100, o.h || 100);
  f.fills = o.fill === 'none' ? [] : [solid(o.fill || '#FFFFFF')];
  if (o.radius !== undefined) f.cornerRadius = o.radius;
  if (o.stroke) { f.strokes = [solid(o.stroke)]; f.strokeWeight = o.strokeWeight || 1; }
  if (o.layout && o.layout !== 'NONE') {
    f.layoutMode = o.layout;
    f.itemSpacing = o.gap || 0;
    const p = o.pad === undefined ? 0 : o.pad;
    const [pt, pr, pb, pl] = Array.isArray(p) ? p : [p, p, p, p];
    f.paddingTop = pt; f.paddingRight = pr; f.paddingBottom = pb; f.paddingLeft = pl;
    f.counterAxisAlignItems = o.align || 'MIN';
    f.primaryAxisAlignItems = o.justify || 'MIN';
    const hug = o.hug || 'none';
    f.primaryAxisSizingMode = (hug === 'both' || hug === (o.layout === 'VERTICAL' ? 'v' : 'h')) ? 'AUTO' : 'FIXED';
    f.counterAxisSizingMode = (hug === 'both' || hug === (o.layout === 'VERTICAL' ? 'h' : 'v')) ? 'AUTO' : 'FIXED';
  }
  if (o.clip !== undefined) f.clipsContent = o.clip;
  if (o.parent) o.parent.appendChild(f);
  if (o.x !== undefined) f.x = o.x; if (o.y !== undefined) f.y = o.y;
  return f;
}
// make a child stretch across the parent's counter axis / fill primary axis
function fillW(node) { node.layoutAlign = 'STRETCH'; return node; }
function grow(node) { node.layoutGrow = 1; return node; }
function rect(o = {}) {
  const r = figma.createRectangle();
  if (o.name) r.name = o.name;
  r.resize(o.w || 100, o.h || 100);
  r.fills = o.fill === 'none' ? [] : [solid(o.fill || '#E5E7EB')];
  if (o.radius !== undefined) r.cornerRadius = o.radius;
  if (o.stroke) { r.strokes = [solid(o.stroke)]; r.strokeWeight = o.strokeWeight || 1; }
  if (o.parent) o.parent.appendChild(r);
  if (o.x !== undefined) r.x = o.x; if (o.y !== undefined) r.y = o.y;
  return r;
}
function b64ToBytes(b64) { const bin = atob(b64); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u; }
// image-filled rectangle from a base64 PNG string (see icons8.py output)
function imageNode(b64, o = {}) {
  const img = figma.createImage(b64ToBytes(b64));
  const r = figma.createRectangle();
  r.name = o.name || 'image';
  r.resize(o.w || 24, o.h || o.w || 24);
  r.fills = [{ type: 'IMAGE', scaleMode: o.scaleMode || 'FIT', imageHash: img.hash }];
  if (o.parent) o.parent.appendChild(r);
  if (o.x !== undefined) r.x = o.x; if (o.y !== undefined) r.y = o.y;
  return r;
}
// find or create a top-level SECTION by name on the current page
function section(name, o = {}) {
  let s = figma.currentPage.children.find(n => n.type === 'SECTION' && n.name === name);
  if (!s) {
    s = figma.createSection(); s.name = name;
    s.x = o.x || 0; s.y = o.y || 0;
    s.resizeWithoutConstraints(o.w || 1000, o.h || 1000);
    if (o.fill) s.fills = [solid(o.fill)];
  }
  return s;
}
// grow a section so that all children fit, with padding
function fitSection(s, pad = 120) {
  if (!s.children.length) return;
  let maxX = 0, maxY = 0;
  for (const c of s.children) { maxX = Math.max(maxX, c.x + c.width); maxY = Math.max(maxY, c.y + c.height); }
  s.resizeWithoutConstraints(Math.max(s.width, maxX + pad), Math.max(s.height, maxY + pad));
}
function byName(parent, name) { return parent.findOne(n => n.name === name); }
function node(id) { const n = figma.getNodeById(id); if (!n) throw new Error('node not found: ' + id); return n; }
// ---- end prelude ----

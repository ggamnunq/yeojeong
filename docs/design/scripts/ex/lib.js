// ---- ex/lib.js : 03 예시 화면 공통 헬퍼 (C.js 뒤, 본문 앞에 이어붙임) ----
const SECTION_NAME = '03 예시 화면';
const __varCache = {};
async function V(name) {
  if (!C.variables.vars[name]) throw new Error('no variable ' + name);
  if (!__varCache[name]) __varCache[name] = await figma.variables.getVariableByIdAsync(C.variables.vars[name].id);
  return __varCache[name];
}
async function paint(name) {
  return figma.variables.setBoundVariableForPaint({ type: 'SOLID', color: { r: 0, g: 0, b: 0 } }, 'color', await V(name));
}
async function bindRadius(n, name) {
  for (const f of ['topLeftRadius', 'topRightRadius', 'bottomLeftRadius', 'bottomRightRadius']) n.setBoundVariable(f, await V(name));
}
function exSection() {
  const s = figma.currentPage.children.find(n => n.type === 'SECTION' && n.name === SECTION_NAME);
  if (!s) throw new Error('section missing');
  return s;
}
// 변형 인스턴스 생성
function inst(compKey, variantName) {
  const c = C.components[compKey];
  if (c.componentId) return node(c.componentId).createInstance();
  const set = node(c.setId);
  const v = variantName ? set.findChild(n => n.name === variantName) : set.defaultVariant;
  if (!v) throw new Error('variant not found: ' + compKey + ' / ' + variantName);
  return v.createInstance();
}
function icon(name) { return node(C.components.Icons.components['Icon/' + name]); }
function propKey(compKey, prefix) {
  const P = C.components[compKey].componentProps;
  const k = Object.keys(P).find(k => k.startsWith(prefix + '#'));
  if (!k) throw new Error('prop not found ' + compKey + '.' + prefix);
  return k;
}
async function loadAllFonts(t) {
  if (t.fontName === figma.mixed) {
    const seen = new Set();
    for (let i = 0; i < t.characters.length; i++) {
      const f = t.getRangeFontName(i, i + 1); const k = f.family + '|' + f.style;
      if (!seen.has(k)) { seen.add(k); await figma.loadFontAsync(f); }
    }
  } else await figma.loadFontAsync(t.fontName);
}
async function setText(root, layer, s) {
  const t = root.findOne(n => n.name === layer && n.type === 'TEXT');
  if (!t) throw new Error('text layer not found: ' + layer + ' in ' + root.name);
  await loadAllFonts(t); t.characters = s;
  return t;
}
// 구조용 오토레이아웃 프레임(채움 없음) — 컴포넌트 흉내가 아니라 배치용
function box(o = {}) {
  const f = figma.createFrame();
  f.name = o.name || 'box'; f.fills = [];
  f.layoutMode = o.dir || 'VERTICAL';
  f.itemSpacing = o.gap || 0;
  const p = o.pad === undefined ? 0 : o.pad; const [pt, pr, pb, pl] = Array.isArray(p) ? p : [p, p, p, p];
  f.paddingTop = pt; f.paddingRight = pr; f.paddingBottom = pb; f.paddingLeft = pl;
  f.primaryAxisAlignItems = o.justify || 'MIN'; f.counterAxisAlignItems = o.align || 'MIN';
  f.primaryAxisSizingMode = 'AUTO'; f.counterAxisSizingMode = 'AUTO';
  f.clipsContent = !!o.clip;
  if (o.parent) o.parent.appendChild(f);
  return f;
}
// ---- end ex/lib.js ----

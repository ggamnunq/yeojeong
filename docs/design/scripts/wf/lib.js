// ===== 여정 와이어프레임 공통 라이브러리 (icons.js 뒤, 각 행 스크립트 앞에 이어붙여 실행) =====
const C = { bg: '#FFFFFF', ink: '#111827', sub: '#6B7280', box: '#E5E7EB', line: '#D1D5DB', soft: '#F3F4F6', sec: '#F4F5F7' };
const SW = 390, SH = 844, BODY_W = 350;
const FONT = 'Noto Sans KR';
const SEC_NAME = '04 와이어프레임';
function SEC() { return section(SEC_NAME, { x: 11200, y: 0, w: 4900, h: 5900, fill: '#F4F5F7' }); }

// 레이아웃 그리드 (섹션 내부 좌표)
const COL = 490;            // 화면 폭 390 + 간격 100
const FRAME_DY = 170;       // 행 제목 아래 화면 시작 오프셋
const BAND_Y = [600, 1940, 3280, 4620];
function fx(gx, i) { return gx + i * COL; }

// ---------- 기본 빌더 ----------
const __hash = {};
function icon(name, o = {}) {
  const set = o.dark ? ICK : ICG; const key = (o.dark ? 'k:' : 'g:') + name;
  if (!set[name]) throw new Error('icon missing: ' + name);
  if (!__hash[key]) __hash[key] = figma.createImage(b64ToBytes(set[name])).hash;
  const r = figma.createRectangle(); r.name = 'icon/' + name; const s = o.size || 24; r.resize(s, s);
  r.fills = [{ type: 'IMAGE', scaleMode: 'FIT', imageHash: __hash[key] }];
  if (o.parent) o.parent.appendChild(r);
  if (o.rotate) r.rotation = o.rotate;
  if (o.opacity !== undefined) r.opacity = o.opacity;
  return r;
}
function box(o = {}) {
  const f = figma.createFrame();
  f.name = o.name || 'box';
  f.fills = o.fill ? [solid(o.fill, o.opacity)] : [];
  f.clipsContent = !!o.clip;
  if (o.radius !== undefined) f.cornerRadius = o.radius;
  if (o.stroke) { f.strokes = [solid(o.stroke)]; f.strokeWeight = o.sw || 1; f.strokeAlign = 'INSIDE'; if (o.dash) { f.strokes = [solid(C.box)]; f.strokeWeight = 1; } } // v3.1: 점선 금지 → 실선 연회색
  if (o.borderB || o.borderT) {
    f.strokes = [solid(o.borderB || o.borderT)]; f.strokeAlign = 'INSIDE';
    f.strokeTopWeight = o.borderT ? 1 : 0; f.strokeBottomWeight = o.borderB ? 1 : 0; f.strokeLeftWeight = 0; f.strokeRightWeight = 0;
  }
  const dir = o.dir || 'V';
  if (dir !== 'N') {
    f.layoutMode = dir === 'H' ? 'HORIZONTAL' : 'VERTICAL';
    f.itemSpacing = o.gap || 0;
    const p = o.pad === undefined ? 0 : o.pad;
    const [pt, pr, pb, pl] = Array.isArray(p) ? p : [p, p, p, p];
    f.paddingTop = pt; f.paddingRight = pr; f.paddingBottom = pb; f.paddingLeft = pl;
    f.counterAxisAlignItems = o.align || 'MIN';
    f.primaryAxisAlignItems = o.justify || 'MIN';
  }
  f.resize(typeof o.w === 'number' ? o.w : 10, typeof o.h === 'number' ? o.h : 10);
  if (o.parent) o.parent.appendChild(f);
  const inAL = o.parent && o.parent.layoutMode && o.parent.layoutMode !== 'NONE' && !o.abs;
  if (dir !== 'N') {
    f.layoutSizingHorizontal = (o.w === 'fill' && inAL) ? 'FILL' : (typeof o.w === 'number' ? 'FIXED' : 'HUG');
    f.layoutSizingVertical = (o.h === 'fill' && inAL) ? 'FILL' : (typeof o.h === 'number' ? 'FIXED' : 'HUG');
  } else if (inAL) {
    if (o.w === 'fill') f.layoutSizingHorizontal = 'FILL';
    if (o.h === 'fill') f.layoutSizingVertical = 'FILL';
  }
  if (o.abs) { f.layoutPositioning = 'ABSOLUTE'; }
  if (o.x !== undefined) f.x = o.x; if (o.y !== undefined) f.y = o.y;
  if (o.opacityNode !== undefined) f.opacity = o.opacityNode;
  return f;
}
async function T(chars, o = {}) {
  const t = figma.createText();
  t.fontName = await font(FONT, o.weight || 'Regular');
  t.characters = String(chars);
  const size = o.size || 14;
  t.fontSize = size;
  t.lineHeight = { unit: 'PIXELS', value: o.lh || Math.round(size * 1.45) };
  t.letterSpacing = { unit: 'PIXELS', value: o.ls !== undefined ? o.ls : (size >= 20 ? -0.4 : -0.1) };
  t.fills = [solid(o.color || C.ink)];
  if (o.align) t.textAlignHorizontal = o.align;
  t.name = o.name || String(chars).slice(0, 30);
  if (o.parent) o.parent.appendChild(t);
  if (o.w === 'fill') { t.layoutSizingHorizontal = 'FILL'; t.textAutoResize = 'HEIGHT'; }
  else if (typeof o.w === 'number') { t.textAutoResize = 'HEIGHT'; t.resize(o.w, t.height); }
  else t.textAutoResize = 'WIDTH_AND_HEIGHT';
  if (o.underline) t.textDecoration = 'UNDERLINE';
  if (o.abs) { t.layoutPositioning = 'ABSOLUTE'; }
  if (o.x !== undefined) t.x = o.x; if (o.y !== undefined) t.y = o.y;
  return t;
}
function line(p, o = {}) {
  const r = figma.createRectangle(); r.name = 'divider';
  r.resize(o.w || 100, o.h || 1); r.fills = [solid(o.color || C.box)];
  p.appendChild(r); if (!o.w) r.layoutSizingHorizontal = 'FILL';
  return r;
}
function spacer(p, h) { const r = box({ parent: p, dir: 'N', w: 'fill', h: h, name: 'spacer' }); return r; }
function grower(p) { const r = box({ parent: p, dir: 'N', w: 'fill', h: 'fill', name: 'flex' }); r.layoutSizingVertical = 'FILL'; return r; }

// ---------- 공통 UI ----------
function iconBtn(name, p, o = {}) {
  const b = box({ parent: p, dir: 'H', w: o.box || 40, h: o.box || 40, align: 'CENTER', justify: 'CENTER', name: 'IconButton/' + name });
  icon(name, { parent: b, size: o.size || 24, dark: o.dark !== false, rotate: o.rotate });
  return b;
}
async function statusBar(p, time = '9:41') {
  const b = box({ name: 'StatusBar', parent: p, dir: 'H', w: 'fill', h: 44, pad: [0, 22, 0, 30], justify: 'SPACE_BETWEEN', align: 'CENTER' });
  await T(time, { parent: b, size: 15, weight: 'Bold' });
  const r = box({ parent: b, dir: 'H', gap: 6, align: 'CENTER', name: 'indicators' });
  icon('wifi', { parent: r, size: 16, dark: true }); icon('full-battery', { parent: r, size: 24, dark: true });
  return b;
}
// 여정 헤더: [≡] 그룹명 ▾ ........ [지갑][마이]
async function appHeader(p, o = {}) {
  const h = box({ name: 'Header/App', parent: p, dir: 'H', w: 'fill', h: 56, pad: [0, 8, 0, 6], justify: 'SPACE_BETWEEN', align: 'CENTER', borderB: C.box });
  const l = box({ parent: h, dir: 'H', align: 'CENTER', gap: 2, name: 'left' });
  if (o.noGroup) {
    box({ parent: l, dir: 'N', w: 10, h: 10, name: 'pad' });
    await T('여정', { parent: l, size: 20, weight: 'Black', ls: -0.6 });
  } else {
    iconBtn('menu', l);
    const g = box({ parent: l, dir: 'H', align: 'CENTER', gap: 4, name: 'GroupSwitcher' });
    await T(o.group || '오사카 3박 4일', { parent: g, size: 18, weight: 'Bold' });
    icon('expand-arrow', { parent: g, size: 16, dark: true, rotate: o.open ? 180 : 0 });
  }
  const r = box({ parent: h, dir: 'H', align: 'CENTER', gap: 0, name: 'right' });
  iconBtn('wallet', r); iconBtn('user', r);
  return h;
}
// 서브페이지 헤더: [<] 제목 [우측]
async function subHeader(p, title, o = {}) {
  const h = box({ name: 'Header/Sub', parent: p, dir: 'H', w: 'fill', h: 56, pad: [0, 8, 0, 6], align: 'CENTER', borderB: o.noBorder ? undefined : C.box });
  if (o.close) iconBtn('multiply', h, { size: 20 }); else if (o.noBack) box({ parent: h, dir: 'N', w: 40, h: 40, name: 'pad' }); else iconBtn('back', h);
  await T(title, { parent: h, size: 17, weight: 'Bold', w: 'fill', align: 'CENTER' });
  if (o.right) await T(o.right, { parent: h, size: 14, color: C.sub, w: 40, align: 'CENTER' });
  else box({ parent: h, dir: 'N', w: 40, h: 40, name: 'pad' });
  return h;
}
// 하단 네비 3탭: 결제내역 / 현황(종료 후 정산) / 여정 정보
async function bottomNav(p, active, o = {}) {
  const n = box({ name: 'BottomNav', parent: p, dir: 'H', w: 'fill', h: 78, pad: [8, 8, 22, 8], borderT: C.box, fill: C.bg });
  const tabs = [
    { k: 'pay', label: '결제내역', icon: 'receipt' },
    { k: 'stat', label: o.ended ? '정산' : '현황', icon: o.ended ? 'calculator' : 'pie-chart' },
    { k: 'info', label: '여정 정보', icon: 'info' },
  ];
  for (const t of tabs) {
    const on = t.k === active; const locked = o.locked && t.k !== 'info';
    const tb = box({ parent: n, dir: 'V', w: 'fill', h: 'fill', align: 'CENTER', justify: 'CENTER', gap: 3, name: 'Tab/' + t.label });
    icon(locked ? 'lock' : t.icon, { parent: tb, size: 24, dark: on });
    await T(t.label, { parent: tb, size: 11, weight: on ? 'Bold' : 'Medium', color: on ? C.ink : C.sub });
    if (locked) tb.opacity = 0.45;
  }
  return n;
}
// 화면 프레임
async function screen(id, title, _x, _y, o = {}) {
  // v3: 위치·부모는 PLACE 표로 결정. 같은 WF 프레임이 있으면 노드를 재사용(내용만 비우고 다시 그림 → 노드 ID 유지)
  const [k, i] = PLACE[id]; const parent = await sub(k);
  let f = findWF(id);
  if (f) { for (const c of [...f.children]) c.remove(); f.name = `WF-${id} ${title}`; }
  else f = box({ name: `WF-${id} ${title}`, dir: 'V', w: SW, h: SH, fill: C.bg, clip: true });
  parent.appendChild(f); const [x, y] = gpos(i); f.x = x; f.y = y;
  await statusBar(f, o.time);
  return f;
}
function body(p, o = {}) {
  const b = box({ name: o.name || 'Body', parent: p, dir: 'V', w: 'fill', h: 'fill', pad: o.pad !== undefined ? o.pad : [16, 20, 16, 20], gap: o.gap !== undefined ? o.gap : 16, fill: o.fill || C.bg, clip: true, align: o.align, justify: o.justify });
  return b;
}
// 버튼: primary(진한 채움) / secondary(테두리) / ghost(텍스트) / gray(회색 채움)
async function btn(label, p, o = {}) {
  const kind = o.kind || 'primary';
  const st = {
    primary: { fill: C.ink, color: '#FFFFFF' }, secondary: { fill: C.bg, stroke: C.line, color: C.ink },
    ghost: { color: C.sub }, gray: { fill: C.box, color: C.ink },
  }[kind];
  const b = box({ parent: p, dir: 'H', w: o.w || 'fill', h: o.h || 52, radius: o.radius !== undefined ? o.radius : 12, fill: st.fill, stroke: st.stroke, align: 'CENTER', justify: 'CENTER', gap: 6, pad: [0, o.padX || 16, 0, o.padX || 16], name: 'Button/' + kind });
  if (o.icon) icon(o.icon, { parent: b, size: o.iconSize || 20, dark: kind !== 'ghost' });
  await T(label, { parent: b, size: o.size || 16, weight: o.weight || (kind === 'ghost' ? 'Medium' : 'Bold'), color: st.color, underline: o.underline });
  return b;
}
// 태그: shared(테두리) / personal(회색) / pending(점선) / solid(진함) / soft
async function tag(label, p, kind = 'soft', o = {}) {
  const st = {
    shared: { stroke: C.ink, color: C.ink }, personal: { fill: C.box, color: C.sub },
    pending: { fill: C.soft, color: C.sub }, solid: { fill: C.ink, color: '#FFFFFF' }, soft: { fill: C.soft, color: C.sub },
  }[kind];
  const t = box({ parent: p, dir: 'H', h: o.h || 20, pad: [0, 7, 0, 7], radius: 5, fill: st.fill, stroke: st.stroke, dash: st.dash, align: 'CENTER', gap: 3, name: 'Tag/' + label });
  if (o.icon) icon(o.icon, { parent: t, size: 12, dark: kind === 'shared' });
  await T(label, { parent: t, size: o.size || 11, weight: 'Medium', color: st.color, lh: 14 });
  return t;
}
// 프사 규칙: 카카오 프사 있음 = 진한 회색 원(사진 자리) / 없음 = 연한 회색 원 + 기본 사람 아이콘
const PROFILE = { 준용: 'photo', 민지: 'photo', 태현: 'default', 수빈: 'default', 지호: 'default', 하은: 'photo' };
const JOIN = ['준용', '민지', '태현', '수빈', '지호', '하은'];
let ME = '준용';
function realName(n) { return n === '나' ? ME : n; }
function orderMembers(list) { // 나 먼저 → 나머지는 가입 순
  const r = list.map(realName);
  return r.sort((a, b) => (a === ME ? -1 : b === ME ? 1 : JOIN.indexOf(a) - JOIN.indexOf(b)));
}
async function avatar(name, p, size = 36, o = {}) {
  const n = realName(name); const photo = PROFILE[n] === 'photo';
  const a = box({ parent: p, dir: 'H', w: size, h: size, radius: size / 2, fill: photo ? C.sub : C.box, align: 'CENTER', justify: 'CENTER', name: `Avatar/${n} (${photo ? '사진' : '기본'})` });
  if (!photo) icon('user', { parent: a, size: Math.round(size * 0.58) });
  if (o.ring) { a.strokes = [solid(o.ring)]; a.strokeWeight = o.ringW || 1.5; a.strokeAlign = 'OUTSIDE'; }
  if (o.faded) a.opacity = 0.35;
  return a;
}
// 프사 스택: 지름 20(행)/24(시트), 겹침 −6, 흰 테두리 1.5, 최대 4 + "+N", 나 먼저 → 가입 순, 나 = 진한 테두리 2
async function stack(p, names, o = {}) {
  const size = o.size || 20, ov = o.overlap !== undefined ? o.overlap : -6, max = o.max || 4;
  const list = o.noSort ? names.map(realName) : orderMembers(names);
  const s = box({ parent: p, dir: 'H', gap: ov, align: 'CENTER', name: 'AvatarStack/' + list.length });
  s.itemReverseZIndex = true;
  for (const n of list.slice(0, max)) {
    const me = n === ME;
    await avatar(n, s, size, { ring: me ? C.ink : '#FFFFFF', ringW: me ? 2 : 1.5, faded: (o.faded || []).includes(n) });
  }
  if (list.length > max) {
    const c = box({ parent: s, dir: 'H', w: size, h: size, radius: size / 2, fill: C.soft, align: 'CENTER', justify: 'CENTER', name: 'More' });
    c.strokes = [solid('#FFFFFF')]; c.strokeWeight = 1.5; c.strokeAlign = 'OUTSIDE';
    await T('+' + (list.length - max), { parent: c, size: Math.max(9, Math.round(size * 0.45)), weight: 'Bold', color: C.sub, lh: size });
  }
  return s;
}
// 부담 인원 프사 토글 (시트): 선택 = 진한 테두리 + 체크 배지, 해제 = 흐리게
async function avatarToggle(p, name, on, o = {}) {
  const c = box({ parent: p, dir: 'V', w: 'fill', gap: 6, align: 'CENTER', name: `Toggle/${name}${on ? ' ✓' : ''}` });
  const wrap = box({ parent: c, dir: 'N', w: 54, h: 54, name: 'wrap' });
  const a = await avatar(name, wrap, 48, { ring: on ? C.ink : undefined, ringW: 2 }); a.x = 3; a.y = 3;
  if (!on) a.opacity = 0.35;
  if (on) { const bd = box({ parent: wrap, dir: 'H', w: 22, h: 22, radius: 11, fill: '#FFFFFF', align: 'CENTER', justify: 'CENTER', name: 'check' }); icon('ok', { parent: bd, size: 20, dark: true }); bd.x = 34; bd.y = 34; }
  await T(name, { parent: c, size: 13, weight: on ? 'Bold' : 'Medium', color: on ? C.ink : C.sub });
  return c;
}
async function flagTag(fl, p) {
  if (fl === '변경됨') return tag('변경됨', p, 'soft');
  if (fl === '중복 의심') return tag('중복 의심', p, 'shared', { icon: 'high-priority' });
  if (fl === '나간 멤버') return tag('나간 멤버', p, 'soft');
  return tag(fl, p, 'soft');
}
async function input(p, o = {}) {
  const w = box({ parent: p, dir: 'V', w: 'fill', gap: 6, name: 'Input/' + (o.label || '') });
  if (o.label) await T(o.label, { parent: w, size: 13, weight: 'Medium', color: C.sub });
  const f = box({ parent: w, dir: 'H', w: 'fill', h: o.h || 52, radius: 10, stroke: o.focus ? C.ink : C.line, sw: o.focus ? 1.5 : 1, pad: [0, 14, 0, 14], align: 'CENTER', gap: 8, name: 'field' });
  if (o.iconL) icon(o.iconL, { parent: f, size: 20 });
  await T(o.value || o.placeholder || '', { parent: f, size: 16, color: o.value ? C.ink : C.sub, w: 'fill', weight: o.valueWeight || 'Regular', ls: o.ls });
  if (o.suffix) await T(o.suffix, { parent: f, size: 15, color: C.sub });
  if (o.iconR) icon(o.iconR, { parent: f, size: 18 });
  if (o.helper || o.count) {
    const hr = box({ parent: w, dir: 'H', w: 'fill', justify: 'SPACE_BETWEEN', gap: 8 });
    await T(o.helper || '', { parent: hr, size: 12, color: C.sub, w: 'fill' });
    if (o.count) await T(o.count, { parent: hr, size: 12, color: C.sub });
  }
  return w;
}
function card(p, o = {}) {
  return box({ parent: p, dir: o.dir || 'V', w: o.w || 'fill', pad: o.pad !== undefined ? o.pad : 16, gap: o.gap !== undefined ? o.gap : 12, radius: o.radius !== undefined ? o.radius : 14, stroke: o.noStroke ? undefined : (o.stroke || C.line), fill: o.fill || C.bg, dash: o.dash, align: o.align, justify: o.justify, name: o.name || 'Card' });
}
async function kv(p, label, value, o = {}) {
  const r = box({ parent: p, dir: 'H', w: 'fill', gap: 12, align: 'CENTER', name: 'KV/' + label });
  if (o.icon) icon(o.icon, { parent: r, size: 18 });
  await T(label, { parent: r, size: 13, color: C.sub, w: o.lw || 56 });
  await T(value, { parent: r, size: 15, weight: o.weight || 'Medium', w: 'fill', align: o.align });
  return r;
}
async function sectionTitle(p, title, o = {}) {
  const r = box({ parent: p, dir: 'H', w: 'fill', justify: 'SPACE_BETWEEN', align: 'CENTER', gap: 8, name: 'SectionTitle/' + title });
  await T(title, { parent: r, size: o.size || 15, weight: 'Bold' });
  if (o.right) await T(o.right, { parent: r, size: 13, color: C.sub });
  return r;
}
function checkbox(p, on, size = 22) { return icon(on ? 'checked-checkbox' : 'o-unchecked-checkbox', { parent: p, size, dark: on }); }
function radio(p, on, size = 22) { return icon(on ? 'ok' : 'o-full-moon', { parent: p, size, dark: on }); }
async function segmented(p, items, active, o = {}) {
  const s = box({ parent: p, dir: 'H', w: o.w || 'fill', h: o.h || 40, pad: 3, gap: 2, radius: 10, fill: C.soft, name: 'Segmented' });
  for (const it of items) {
    const on = it === active;
    const b = box({ parent: s, dir: 'H', w: 'fill', h: 'fill', radius: 8, fill: on ? C.bg : undefined, stroke: on ? C.line : undefined, align: 'CENTER', justify: 'CENTER', gap: 4, name: 'Seg/' + it });
    await T(it, { parent: b, size: o.size || 14, weight: on ? 'Bold' : 'Medium', color: on ? C.ink : C.sub });
  }
  return s;
}
// 진행 바 (트랙 폭을 명시)
function bar(p, w, ratio, o = {}) {
  const t = box({ parent: p, dir: 'N', w: w, h: o.h || 8, radius: (o.h || 8) / 2, fill: C.box, name: 'Bar', clip: true });
  const r = figma.createRectangle(); r.name = 'fill'; r.resize(Math.max(2, Math.round(w * ratio)), o.h || 8); r.cornerRadius = (o.h || 8) / 2; r.fills = [solid(o.color || C.ink)]; t.appendChild(r);
  if (o.mark !== undefined) { const m = figma.createRectangle(); m.name = 'mark'; m.resize(2, o.h || 8); m.x = Math.round(w * o.mark); m.fills = [solid(C.sub)]; t.appendChild(m); }
  return t;
}
// 회색 플레이스홀더 박스 (이미지/일러스트 자리)
async function placeholder(p, label, o = {}) {
  const b = box({ parent: p, dir: 'V', w: o.w || 'fill', h: o.h || 120, radius: o.radius !== undefined ? o.radius : 12, fill: C.box, align: 'CENTER', justify: 'CENTER', name: 'Placeholder/' + label });
  await T(label, { parent: b, size: o.size || 13, color: C.sub, weight: 'Medium', align: 'CENTER' });
  return b;
}
// 결제 행 (리스트형)
async function payRow(p, d) {
  const r = box({ parent: p, dir: 'H', w: 'fill', pad: [11, 0, 11, 0], gap: 12, align: 'CENTER', name: 'PayRow/' + d.name });
  await avatar(d.payer, r, 36);
  const mid = box({ parent: r, dir: 'V', w: 'fill', gap: 4, name: 'mid' });
  await T(d.name, { parent: mid, size: 15, weight: 'Medium', w: 'fill', lh: 20 });
  const meta = box({ parent: mid, dir: 'H', gap: 6, align: 'CENTER', name: 'meta' });
  await T(`${d.time} · ${d.payer}`, { parent: meta, size: 12, color: C.sub, lh: 16 });
  await payMark(meta, d);
  const right = box({ parent: r, dir: 'V', gap: 2, align: 'MAX', name: 'amount' });
  await T(d.krw, { parent: right, size: 15, weight: 'Bold', lh: 20, color: d.tag === 'pending' ? C.sub : C.ink });
  await T(d.fx, { parent: right, size: 12, color: C.sub, lh: 16 });
  return r;
}
// 공동 = 부담 인원 프사 스택 / 개인 = 🔒 태그 / 미확정 = 점선 태그  (+ 변경됨·중복 의심 등 플래그)
async function payMark(meta, d) {
  if (d.tag === 'shared') await stack(meta, d.who, { size: 20, faded: d.faded });
  else await tag(d.tagLabel, meta, d.tag, { icon: d.tag === 'personal' ? 'lock' : undefined });
  for (const fl of d.flags || []) await flagTag(fl, meta);
}
async function dateHeader(p, left, right) {
  const r = box({ parent: p, dir: 'H', w: 'fill', pad: [14, 0, 6, 0], justify: 'SPACE_BETWEEN', align: 'CENTER', borderB: C.box, name: 'DateHeader' });
  await T(left, { parent: r, size: 13, weight: 'Bold' });
  if (right) await T(right, { parent: r, size: 12, color: C.sub });
  return r;
}
// ---------- 오버레이 ----------
function dim(f, top = 0) {
  const r = figma.createRectangle(); r.name = 'Dim'; r.resize(SW, SH - top); r.fills = [solid(C.ink, 0.45)];
  f.appendChild(r); r.layoutPositioning = 'ABSOLUTE'; r.x = 0; r.y = top; return r;
}
function sheet(f, o = {}) {
  const s = box({ parent: f, abs: true, dir: 'V', w: SW, pad: o.pad || [10, 20, 30, 20], gap: o.gap !== undefined ? o.gap : 16, fill: C.bg, name: o.name || 'BottomSheet' });
  s.topLeftRadius = 20; s.topRightRadius = 20;
  const g = box({ parent: s, dir: 'H', w: 'fill', justify: 'CENTER', name: 'grabber' });
  const gr = figma.createRectangle(); gr.resize(40, 4); gr.cornerRadius = 2; gr.fills = [solid(C.line)]; g.appendChild(gr);
  return s;
}
function placeBottom(f, s) { s.x = 0; s.y = SH - s.height; }
function dialog(f, o = {}) {
  return box({ parent: f, abs: true, dir: 'V', w: o.w || 322, pad: o.pad || [24, 20, 20, 20], gap: o.gap !== undefined ? o.gap : 12, radius: 18, fill: C.bg, name: o.name || 'Dialog' });
}
function placeCenter(f, d) { d.x = Math.round((SW - d.width) / 2); d.y = Math.round((SH - d.height) / 2); }
async function toast(f, msg, y) {
  const t = box({ parent: f, abs: true, dir: 'H', pad: [12, 18, 12, 18], radius: 12, fill: C.ink, align: 'CENTER', gap: 8, name: 'Toast' });
  icon('checkmark', { parent: t, size: 16 });
  await T(msg, { parent: t, size: 14, weight: 'Medium', color: '#FFFFFF' });
  t.x = Math.round((SW - t.width) / 2); t.y = y; return t;
}
// ---------- 캔버스 주석 ----------
async function note(_x, _y, id, title, desc) {
  const [k, i] = PLACE[id]; const parent = await sub(k);
  removeNamed(`Note · WF-${id}`);
  const n = box({ name: `Note · WF-${id}`, dir: 'V', w: SW, gap: 4 });
  parent.appendChild(n); const [x, y] = gpos(i); n.x = x; n.y = y + SH + 16;
  await T(`WF-${id}  ${title}`, { parent: n, size: 15, weight: 'Bold', w: 'fill', lh: 22 });
  await T(desc, { parent: n, size: 13, color: '#4B5563', w: 'fill', lh: 20 });
  return n;
}
async function rowTitle() { return null; } // v3: 행 제목은 중첩 섹션 제목(sub)으로 대체
// 04 섹션 최상위 + 중첩 섹션 안에서 이름으로 제거
function removeNamed(name) {
  const s = SEC();
  for (const c of [...s.children]) {
    if (c.name === name) c.remove();
    else if (c.type === 'SECTION') for (const d of [...c.children]) if (d.name === name) d.remove();
  }
}
// v3: WF 프레임은 지우지 않는다(재사용). 주석과 레거시 노드만 정리
function clean(ids, extra = []) {
  for (const id of ids) removeNamed(`Note · WF-${id}`);
  const s = SEC();
  for (const c of [...s.children]) if (extra.includes(c.name) || c.name.startsWith('RowTitle · ')) c.remove();
}
// ===== v3 배치: 04 안의 플로우별 중첩 섹션 =====
const SUB_X = 100, SUB_W = 2800, SUB_PAD = 80, SUB_TOP = 190, GAP_X = 60, PITCH = 1000, START_Y = 700, SUB_GAP = 120;
const SECTION_DEFS = [
  ['A', 'A 인증', '스플래시 → 카카오 로그인 → 닉네임 → 약관 → 토스 연결 → 계좌·카드 선택 → 완료', 8],
  ['B', 'B 여정 생성·참여', '빈 상태 → 생성 → 초대코드 공유  /  초대코드로 바로 참여', 4],
  ['C', 'C 공통 UI', '헤더(그룹 전환 · 그룹원) + 하단 탭 3개 — 모든 여정 화면 공통', 3],
  ['D', 'D 시작 전', '여정 정보 + [여정 시작](그룹장) → 확인', 2],
  ['E', 'E 진행 중', '결제내역(리스트 ⇄ 타임라인) → 상세 · 현황 · 여정 정보 → 종료   (11.13 금 18:34 기준)', 7],
  ['F', 'F 종료·정산', '정산 요약 → 멤버별 결제 내역', 2],
  ['G', 'G 지갑', '계좌·카드 · 토스로 추가 · 환율', 3],
  ['H', 'H 마이페이지', '닉네임 · 지갑 요약 · 로그아웃', 1],
  ['I', 'I 분담 변경', '공동 ↔ 개인 · 부담 인원 변경 · 읽기 전용 · 종료 후 잠금   (분기 시나리오, 11.13 금 21:00)', 9],
  ['J', 'J 엣지케이스', '중요한 상황은 화면, 나머지는 규칙표', 7],
];
const PLACE = {};
(() => {
  const m = { A: [1, 8], B: [9, 12], C: [13, 15], D: [16, 17], E: [18, 24], F: [25, 26], G: [27, 29], H: [30, 30], I: [31, 39], J: [40, 45] };
  for (const [k, [a, b]] of Object.entries(m)) for (let n = a; n <= b; n++) PLACE[String(n).padStart(2, '0')] = [k, n - a];
})();
function subLayout() {
  let y = START_Y; const L = {};
  for (const [k, name, desc, count] of SECTION_DEFS) { const rows = Math.ceil(count / 6); const h = rows * PITCH + 180; L[k] = { name, desc, y, h, rows }; y += h + SUB_GAP; }
  return L;
}
function gpos(i) { return [SUB_PAD + (i % 6) * (SW + GAP_X), SUB_TOP + Math.floor(i / 6) * PITCH]; }
const __subCache = {};
async function sub(k) {
  if (__subCache[k]) return __subCache[k];
  const L = subLayout()[k]; const s = SEC();
  let n = s.children.find(c => c.type === 'SECTION' && c.name === L.name);
  if (!n) { n = figma.createSection(); n.name = L.name; s.appendChild(n); }
  n.fills = [solid('#FFFFFF')]; n.x = SUB_X; n.y = L.y;
  n.resizeWithoutConstraints(SUB_W, Math.max(L.h, k === 'J' ? n.height : 0));
  for (const c of [...n.children]) if (c.name === 'SubTitle · ' + k) c.remove();
  const t = box({ name: 'SubTitle · ' + k, dir: 'V', w: SUB_W - SUB_PAD * 2, gap: 6 }); n.appendChild(t); t.x = SUB_PAD; t.y = 72;
  await T(L.name, { parent: t, size: 28, weight: 'Bold', w: 'fill', lh: 40 });
  await T(L.desc, { parent: t, size: 16, color: '#4B5563', w: 'fill', lh: 24 });
  __subCache[k] = n; return n;
}
function findWF(id) {
  const s = SEC(); const pre = `WF-${id} `;
  for (const c of s.children) {
    if (c.type === 'FRAME' && c.name.startsWith(pre)) return c;
    if (c.type === 'SECTION') for (const d of c.children) if (d.type === 'FRAME' && d.name.startsWith(pre)) return d;
  }
  return null;
}
// 기존 프레임을 지우지 않고 제자리(중첩 섹션 그리드)로 이동만
async function place(id) {
  const f = findWF(id); const [k, i] = PLACE[id]; const parent = await sub(k);
  parent.appendChild(f); const [x, y] = gpos(i); f.x = x; f.y = y; return f;
}
// ===== end lib =====

// ===== 샘플 데이터: 오사카 3박 4일 (2026.11.12 목 ~ 11.15 일), 환율 100엔 = 919.20원 =====
const PAY_D2 = [
  { time: '18:20', name: '551 호라이 난바본점', payer: '나', krw: '₩25,740', fx: '¥2,800', tag: 'pending', tagLabel: '미확정' },
  { time: '16:40', name: '우메다 스카이빌딩 공중정원', payer: '민지', krw: '₩73,540', fx: '¥8,000', tag: 'shared', tagLabel: '공동 4명', who: ['준용', '민지', '태현', '수빈'] },
  { time: '14:10', name: 'MK택시', payer: '나', krw: '₩26,290', fx: '¥2,860', tag: 'shared', tagLabel: '공동 2명', who: ['준용', '민지'] },
  { time: '10:30', name: '오사카성 천수각', payer: '수빈', krw: '₩44,120', fx: '¥4,800', tag: 'shared', tagLabel: '공동 4명', who: ['준용', '민지', '태현', '수빈'] },
  { time: '08:50', name: '패밀리마트 난바역점', payer: '나', krw: '₩11,770', fx: '¥1,280', tag: 'pending', tagLabel: '미확정' },
];
const PAY_D1 = [
  { time: '19:30', name: '쿠시카츠 다루마 신세카이점', payer: '태현', krw: '₩117,660', fx: '¥12,800', tag: 'shared', tagLabel: '공동 4명', who: ['준용', '민지', '태현', '수빈'] },
  { time: '17:40', name: '돈키호테 도톤보리점', payer: '나', krw: '₩79,420', fx: '¥8,640', tag: 'personal', tagLabel: '개인' },
  { time: '13:05', name: '이치란 라멘 도톤보리점', payer: '나', krw: '₩36,400', fx: '¥3,960', tag: 'shared', tagLabel: '공동 4명', who: ['준용', '민지', '태현', '수빈'] },
  { time: '11:20', name: '난카이 라피트 간사이공항역', payer: '민지', krw: '₩54,780', fx: '¥5,960', tag: 'shared', tagLabel: '공동 4명', who: ['준용', '민지', '태현', '수빈'] },
];
// 결제내역 탭 상단: 미확정 배너(한 줄) + [리스트|타임라인] 토글
async function compactBanner(bn) {
  icon('high-priority', { parent: bn, size: 18, dark: true });
  await T('확인 필요 2건', { parent: bn, size: 14, weight: 'Bold', w: 'fill' });
  icon('forward', { parent: bn, size: 16 });
}
async function payTop(b, mode) {
  const bn = box({ parent: b, dir: 'H', w: 'fill', h: 44, radius: 10, stroke: C.box, pad: [0, 14, 0, 14], gap: 8, align: 'CENTER', name: 'Banner/미확정' });
  await compactBanner(bn);
  const ctl = box({ parent: b, dir: 'H', w: 'fill', align: 'CENTER', gap: 10, name: 'Controls' });
  await segmented(ctl, ['리스트', '타임라인'], mode, { w: 'fill', h: 36, size: 13 });
  return { bn, ctl };
}
async function payListContent(b, o = {}) {
  if (!o.noTop) await payTop(b, '리스트');
  const l = box({ parent: b, dir: 'V', w: 'fill', gap: 0, name: 'PayList' });
  await dateHeader(l, '11.13 (금) · Day 2');
  for (const d of PAY_D2) await payRow(l, d);
  await dateHeader(l, '11.12 (목) · Day 1');
  for (const d of PAY_D1) await payRow(l, d);
  return l;
}

// ===== 여정 정보 블록 (D 시작 전 / E 여정 정보 탭 공용) =====
async function tripInfoCard(b, o = {}) {
  const c = card(b, { gap: 10, name: 'TripInfoCard' });
  const tr = box({ parent: c, dir: 'H', w: 'fill', align: 'CENTER', gap: 8 });
  await T('오사카 3박 4일', { parent: tr, size: 19, weight: 'Bold' });
  await tag(o.status || '진행 중', tr, (o.status || '').startsWith('시작 전') ? 'soft' : 'solid');
  box({ parent: tr, dir: 'N', w: 'fill', h: 10, name: 'flex' });
  if (o.edit) icon('edit', { parent: tr, size: 18 });
  await kv(c, '기간', '2026.11.12 ~ 11.15 · 3박 4일');
  await kv(c, '장소', '일본 오사카');
  await kv(c, '예산', '₩1,200,000');
  return c;
}
async function memberRows(b, o = {}) {
  const w = box({ parent: b, dir: 'V', w: 'fill', gap: 0, name: 'MemberRows' });
  const mem = [['준용', true, true], ['민지'], ['태현'], ['수빈']];
  for (const [n, lead, me] of mem) {
    const r = box({ parent: w, dir: 'H', w: 'fill', h: o.rowH || 46, gap: 10, align: 'CENTER', name: 'Member/' + n });
    await avatar(n, r, 32);
    await T(n, { parent: r, size: 15, weight: 'Medium' });
    if (lead) icon('crown', { parent: r, size: 16, dark: true });
    if (me) await tag('나', r, 'personal');
  }
  return w;
}
async function inviteStrip(b, o = {}) {
  const c = card(b, { dir: 'H', gap: 10, align: 'CENTER', fill: C.soft, noStroke: true, radius: 12, pad: [12, 12, 12, 16], name: 'InviteStrip' });
  const t = box({ parent: c, dir: 'V', w: 'fill', gap: 1 });
  await T('초대코드', { parent: t, size: 12, color: C.sub });
  await T('K7M-2QX', { parent: t, size: 18, weight: 'Black', ls: 2 });
  await btn('복사', c, { kind: 'secondary', icon: 'copy', iconSize: 16, w: 74, h: 36, size: 13, radius: 8, padX: 8 });
  return c;
}

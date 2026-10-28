const meta = {};
for (const k of ['c_buttons','c_inputs','c_nav','c_list','c_stats','c_overlays','c_controls','c_patch','c_v12']) for (const [name, m] of Object.entries(IDS[k])) { if (typeof m === 'object' && m && (m.setId || m.componentId)) meta[name] = Object.assign(meta[name]||{}, m); }
const out = {};
for (const [name, m] of Object.entries(meta)) {
  const n = node(m.setId || m.componentId);
  const defs = n.componentPropertyDefinitions || {};
  const variantProps = {}, otherProps = {};
  for (const [k, d] of Object.entries(defs)) {
    if (d.type === 'VARIANT') variantProps[k] = d.variantOptions;
    else otherProps[k] = {type: d.type, default: d.defaultValue};
  }
  const entry = { type: n.type === 'COMPONENT_SET' ? 'COMPONENT_SET' : 'COMPONENT', name: n.name };
  if (n.type === 'COMPONENT_SET') { entry.setId = n.id; entry.props = variantProps; entry.defaultVariantId = n.defaultVariant.id; entry.defaultVariantName = n.defaultVariant.name; entry.variants = Object.fromEntries(n.children.map(v=>[v.name, v.id])); entry.size = [Math.round(n.defaultVariant.width), Math.round(n.defaultVariant.height)]; }
  else { entry.componentId = n.id; entry.size = [Math.round(n.width), Math.round(n.height)]; }
  entry.componentProps = otherProps;
  for (const k of ['textLayer','textLayers','iconLayer','iconLayers','nested','slotLayer','imageLayer','resizeLayer','tabLayers','note','layers']) if (m[k] !== undefined) entry[k] = m[k];
  entry.usage = USAGE[name] || n.description || '';
  out[name] = entry;
}
// logos
const L = IDS.logo;
out['Logo/Primary'] = {type:'COMPONENT', componentId:L['Logo/Primary'], size:[179,96], layers:{wordmark:'wordmark (primary/500)', ring:'destination ㅇ (brand/accent)'}, usage:'기본 워드마크(흰/밝은 배경). 크기는 instance.rescale(높이/96).'};
out['Logo/Inverse'] = {type:'COMPONENT', componentId:L['Logo/Inverse'], size:[179,96], usage:'프라이머리·어두운 배경 위 흰 워드마크(받침 ㅇ은 노을색 유지). 스플래시에 사용.'};
out['Logo/Mono'] = {type:'COMPONENT', componentId:L['Logo/Mono'], size:[179,96], usage:'단색(neutral/900). 흑백 인쇄·도장.'};
out['Logo/AppIcon'] = {type:'COMPONENT', componentId:L['Logo/AppIcon'], size:[1024,1024], usage:'앱 아이콘/축약 마크. 작게 쓸 땐 rescale(px/1024). 최소 24px.'};
const ls = node(IDS.logo_layout.lockupSet);
out['Logo/Lockup'] = {type:'COMPONENT_SET', setId:ls.id, props:{Layout:['Horizontal','Vertical']}, defaultVariantId:ls.defaultVariant.id, variants:Object.fromEntries(ls.children.map(v=>[v.name,v.id])), textLayer:'tagline', usage:'태그라인 결합형. Vertical = 스플래시/온보딩, Horizontal = 웹 헤더·문서.'};
out['Logo/editable-text'] = {type:'FRAME', ids:L.editable, usage:'편집용 라이브 텍스트 원본(Primary/Inverse/Mono). 화면에는 쓰지 말 것.'};
// icons
out.Icons = {type:'COMPONENT', note:'각 24×24. 인스턴스의 `color` 레이어 fill을 토큰 변수로 바꿔 색 변경. 버튼 등에서는 INSTANCE_SWAP 속성 Icon으로 교체.', components: Object.fromEntries(Object.entries(IDS.icons.comp).map(([k,v])=>[k==='kakao'?'Brand/KakaoSymbol':'Icon/'+k, v])), colorLayer:'color', maskLayer:'mask'};
// variables & styles
const vars = {}; for (const v of await figma.variables.getLocalVariablesAsync()) vars[v.name] = {id:v.id, type:v.resolvedType, collection: v.variableCollectionId};
const ps = {}; for (const s of await figma.getLocalPaintStylesAsync()) ps[s.name] = s.id;
const ts = {}; for (const s of await figma.getLocalTextStylesAsync()) ts[s.name] = s.id;
const efs = {}; for (const s of await figma.getLocalEffectStylesAsync()) efs[s.name] = s.id;
const cols = (await figma.variables.getLocalVariableCollectionsAsync()).map(c=>({name:c.name, id:c.id, modes:c.modes}));
return {components: out, variables: {collections: cols, vars}, styles: {paint: ps, text: ts, effect: efs}, sections: {brand: S1().id, ds: S2().id}};

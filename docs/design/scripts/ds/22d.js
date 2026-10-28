const s = node(IDS.c_patch.Callout.setId); const kI = IDS.c_patch.Callout.propKeys.Icon;
for (const v of s.children) v.findOne(n=>n.name==='icon').componentPropertyReferences = {};
if (s.componentPropertyDefinitions[kI]) s.deleteComponentProperty(kI);
const want = {'Tone=Pending':['alert','expense/pending/fg'], 'Tone=Info':['info','feedback/info/fg'], 'Tone=Warning':['alert','feedback/warning/fg']};
for (const v of s.children) { const i = v.findOne(n=>n.name==='icon'); const [ic, tk] = want[v.name]; if (i.mainComponent.id !== IDS.icons.comp[ic]) i.swapComponent(node(IDS.icons.comp[ic])); await iconColor(i, tk); }
// examples
const ex = s.parent.findOne(n=>n.name==='example');
const [e1, e2] = ex.children;
const i1 = e1.findOne(n=>n.name==='icon'); if (i1.mainComponent.name!=='Icon/info') i1.swapComponent(node(IDS.icons.comp['info']));
const i2 = e2.findOne(n=>n.name==='icon'); i2.swapComponent(node(IDS.icons.comp['pie-chart'])); await iconColor(i2, 'feedback/warning/fg');
const note = s.parent.children.find(n=>n.type==='TEXT' && n.characters.startsWith('↑ 예')); await font('Noto Sans KR','Regular');
note.characters = '↑ 예: Info / Warning(아이콘 교체). 텍스트 = Label 속성, 오른쪽 화살표 = Chevron 속성, 아이콘 = icon 레이어를 swapComponent(Icon/*)로 직접 교체.';
return {props: Object.keys(s.componentPropertyDefinitions), icons: s.children.map(x=>x.name+': '+x.findOne(n=>n.name==='icon').mainComponent.name), ex:[i1.mainComponent.name, i2.mainComponent.name]};

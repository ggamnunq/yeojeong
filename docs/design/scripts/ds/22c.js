const s = node(IDS.c_patch.Callout.setId); const kI = IDS.c_patch.Callout.propKeys.Icon;
const v = s.children.find(x=>x.name==='Tone=Info'); const i = v.findOne(n=>n.name==='icon');
i.componentPropertyReferences = {};
i.swapComponent(node(IDS.icons.comp['info']));
const after1 = i.mainComponent.name;
i.componentPropertyReferences = {mainComponent: kI};
await iconColor(i, 'feedback/info/fg');
return {after1, after2: i.mainComponent.name, all: s.children.map(x=>x.name+': '+x.findOne(n=>n.name==='icon').mainComponent.name)};

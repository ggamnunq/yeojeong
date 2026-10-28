const s = node(IDS.c_patch.Callout.setId);
const kI = IDS.c_patch.Callout.propKeys.Icon;
try { s.editComponentProperty(kI, {defaultValue: IDS.icons.comp['alert']}); } catch(e) {}
const want = {'Tone=Pending':'alert', 'Tone=Info':'info', 'Tone=Warning':'alert'};
for (const v of s.children) { const i = v.findOne(n=>n.name==='icon'); const target = node(IDS.icons.comp[want[v.name]]); if (i.mainComponent.id !== target.id) i.swapComponent(target); }
// re-apply icon colors (swap keeps overrides? ensure)
const tok = {'Tone=Pending':'expense/pending/fg','Tone=Info':'feedback/info/fg','Tone=Warning':'feedback/warning/fg'};
for (const v of s.children) await iconColor(v.findOne(n=>n.name==='icon'), tok[v.name]);
// example instances: info stays info, warning example had pie-chart override
const nav = node(IDS.c_nav.NavItem.setId); try { nav.editComponentProperty(IDS.c_nav.NavItem.propKeys.Label, {defaultValue:'결제내역'}); } catch(e) { return 'nav err '+e; }
return {icons: s.children.map(v=>v.name+': '+v.findOne(n=>n.name==='icon').mainComponent.name), def: s.componentPropertyDefinitions[kI].defaultValue, navDefault: nav.componentPropertyDefinitions[IDS.c_nav.NavItem.propKeys.Label].defaultValue,
  bottomNavTabs: node(IDS.c_nav.BottomNav.setId).defaultVariant.children.map(t=>t.findOne(n=>n.name==='label').characters)};

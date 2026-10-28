function dump(n, d=0, max=5) {
  const o = {n:n.name, t:n.type, w:Math.round(n.width), h:Math.round(n.height)};
  if (n.layoutMode && n.layoutMode!=='NONE') o.lm = n.layoutMode[0] + ' gap'+n.itemSpacing+' pad'+[n.paddingTop,n.paddingRight,n.paddingBottom,n.paddingLeft].join(',') + ' sizing'+n.primaryAxisSizingMode+'/'+n.counterAxisSizingMode;
  if (n.type==='TEXT') { o.c = n.characters; o.f = n.fontName.family+' '+n.fontName.style+' '+n.fontSize; }
  if (n.type==='INSTANCE') { try { o.main = n.mainComponent.name; } catch(e){} }
  if (n.visible===false) o.hidden = true;
  if (n.componentPropertyReferences && Object.keys(n.componentPropertyReferences).length) o.ref = n.componentPropertyReferences;
  if (n.layoutSizingHorizontal) o.sz = n.layoutSizingHorizontal+'/'+n.layoutSizingVertical;
  if ('children' in n && d < max) o.k = n.children.map(c => dump(c, d+1, max));
  return o;
}
const get = (setId, name) => { const s = node(setId); return s.type==='COMPONENT_SET' ? s.findChild(c=>c.name===name) : s; };
return {
  sheet: dump(node(C.components.BottomSheet.componentId), 0, 2),
  liValue: dump(get(C.components.ListItem.setId, 'Type=Value'), 0, 2),
  tagM: dump(get(C.components.Tag.setId, 'Type=Pending, Size=M'), 0, 1),
  statL: dump(get(C.components.StatCard.setId, 'Type=Default, Size=L'), 0, 3),
};

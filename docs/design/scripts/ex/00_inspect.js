function dump(n, d=0, max=5) {
  const o = {n:n.name, t:n.type, w:Math.round(n.width), h:Math.round(n.height)};
  if (n.layoutMode && n.layoutMode!=='NONE') o.lm = n.layoutMode[0] + ' gap'+n.itemSpacing+' pad'+[n.paddingTop,n.paddingRight,n.paddingBottom,n.paddingLeft].join(',') + ' sz'+n.primaryAxisSizingMode[0]+n.counterAxisSizingMode[0];
  if (n.type==='TEXT') { o.c = n.characters; o.f = n.fontName.family+' '+n.fontName.style+' '+n.fontSize; }
  if (n.type==='INSTANCE') { try { o.main = n.mainComponent.name + ' / ' + (n.mainComponent.parent && n.mainComponent.parent.type==='COMPONENT_SET' ? n.mainComponent.parent.name : ''); } catch(e){} }
  if (n.visible===false) o.hidden = true;
  if (n.componentPropertyReferences && Object.keys(n.componentPropertyReferences).length) o.ref = n.componentPropertyReferences;
  if (n.layoutSizingHorizontal) o.sz = (n.layoutSizingHorizontal||'')[0]+(n.layoutSizingVertical||'')[0];
  if ('children' in n && d < max) o.k = n.children.map(c => dump(c, d+1, max));
  return o;
}
const get = (setId, name) => { const s = node(setId); return s.type==='COMPONENT_SET' ? s.findChild(c=>c.name===name) : s; };
return {
  topHeader: dump(get(C.components.TopHeader.setId, 'Type=Group')),
  bottomNav3: dump(get(C.components.BottomNav.setId, 'Tabs=3, Active=First'), 0, 3),
  seg: dump(get(C.components.SegmentedControl.setId, 'Count=2, Selected=First'), 0, 3),
  date: dump(node(C.components.DateHeader.componentId)),
  rowPending: dump(get(C.components.PaymentRow.setId, 'Type=Pending, State=Default'), 0, 4),
};

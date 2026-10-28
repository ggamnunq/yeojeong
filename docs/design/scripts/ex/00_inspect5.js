function dump(n, d=0, max=4) {
  const o = {n:n.name, t:n.type, w:Math.round(n.width), h:Math.round(n.height)};
  if (n.layoutMode && n.layoutMode!=='NONE') o.lm = n.layoutMode[0] + ' gap'+n.itemSpacing+' pad'+[n.paddingTop,n.paddingRight,n.paddingBottom,n.paddingLeft].join(',');
  if (n.type==='TEXT') { o.c = n.characters; }
  if (n.type==='INSTANCE') { try { o.main = n.mainComponent.name; o.props = Object.fromEntries(Object.entries(n.componentProperties).map(([k,v])=>[k,v.value])); } catch(e){} }
  if (n.visible===false) o.hidden = true;
  if (n.isExposedInstance) o.exposed = true;
  if (n.componentPropertyReferences && Object.keys(n.componentPropertyReferences).length) o.ref = n.componentPropertyReferences;
  if ('children' in n && d < max) o.k = n.children.map(c => dump(c, d+1, max));
  return o;
}
const V = (k, v) => node(C.components[k].variants[v]);
return {
  rowShared: dump(V('PaymentRow','Type=Shared, State=Default'), 0, 3),
  stack4: dump(V('AvatarStack','Count=4, Size=XS'), 0, 1),
  sc: dump(node(C.components.SheetContent.componentId), 0, 3),
  dlg: dump(V('Dialog','Type=SharedToPersonal'), 0, 2),
  tog: dump(V('AvatarToggle','Selected=Off'), 0, 1),
};

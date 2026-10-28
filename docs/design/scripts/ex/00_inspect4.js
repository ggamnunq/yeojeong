function dump(n, d=0, max=3) {
  const o = {n:n.name, t:n.type, w:Math.round(n.width), h:Math.round(n.height)};
  if (n.layoutMode && n.layoutMode!=='NONE') o.lm = n.layoutMode[0] + ' gap'+n.itemSpacing+' pad'+[n.paddingTop,n.paddingRight,n.paddingBottom,n.paddingLeft].join(',') + ' sizing'+n.primaryAxisSizingMode+'/'+n.counterAxisSizingMode;
  if (n.type==='TEXT') { o.c = n.characters; o.f = n.fontName===figma.mixed?'mixed':(n.fontName.family+' '+n.fontName.style+' '+n.fontSize); o.style = n.textStyleId ? figma.getStyleById(n.textStyleId)?.name : null; }
  if (n.type==='INSTANCE') { try { o.main = n.mainComponent.name; } catch(e){} }
  if (n.visible===false) o.hidden = true;
  if (n.componentPropertyReferences && Object.keys(n.componentPropertyReferences).length) o.ref = n.componentPropertyReferences;
  if (n.layoutSizingHorizontal) o.sz = n.layoutSizingHorizontal+'/'+n.layoutSizingVertical;
  if ('children' in n && d < max && n.type!=='INSTANCE' || (n.type==='INSTANCE' && d===0)) if ('children' in n) o.k = n.children.map(c => dump(c, d+1, max));
  return o;
}
return {
  th: dump(node(C.components.TopHeader.variants['Type=Group']), 0, 1),
  co: dump(node(C.components.Callout.variants['Tone=Pending']), 0, 1),
  date: dump(node(C.components.DateHeader.componentId), 0, 1),
  sheet: dump(node(C.components.BottomSheet.componentId), 0, 1),
  nav: dump(node(C.components.BottomNav.variants['Tabs=3, Active=First, Phase=Ongoing']), 0, 1),
};

function dump(n, d=0, max=5) {
  const o = {n:n.name, t:n.type, w:Math.round(n.width), h:Math.round(n.height)};
  if (n.layoutMode && n.layoutMode!=='NONE') o.lm = n.layoutMode[0] + ' gap'+n.itemSpacing+' pad'+[n.paddingTop,n.paddingRight,n.paddingBottom,n.paddingLeft].join(',') + ' align'+n.primaryAxisAlignItems+'/'+n.counterAxisAlignItems;
  if (n.type==='TEXT') { o.c = n.characters; o.f = n.fontName.family+' '+n.fontName.style+' '+n.fontSize; o.ar=n.textAutoResize; }
  if (n.type==='INSTANCE') { try { o.main = n.mainComponent.name; } catch(e){} }
  if (n.visible===false) o.hidden = true;
  if (n.componentPropertyReferences && Object.keys(n.componentPropertyReferences).length) o.ref = n.componentPropertyReferences;
  if (n.layoutSizingHorizontal) o.sz = n.layoutSizingHorizontal+'/'+n.layoutSizingVertical;
  if (n.strokes && n.strokes.length) o.stroke = n.strokes.length + (n.dashPattern && n.dashPattern.length ? ' dash'+n.dashPattern : '');
  if (n.boundVariables && n.boundVariables.fills) o.fillVar = true;
  if ('cornerRadius' in n && n.cornerRadius) o.r = n.cornerRadius;
  if ('children' in n && d < max) o.k = n.children.map(c => dump(c, d+1, max));
  return o;
}
const get = (setId, name) => { const s = node(setId); return s.type==='COMPONENT_SET' ? s.findChild(c=>c.name===name) : s; };
return {
  seg: dump(get(C.components.SegmentedControl.setId, 'Count=2, Selected=First'), 0, 1),
  li: dump(get(C.components.ListItem.setId, 'Type=Navigation'), 0, 3),
  btnGhostS: dump(get(C.components.Button.setId, 'Type=Ghost, Size=S, State=Default'), 0, 1),
  btnSecS: dump(get(C.components.Button.setId, 'Type=Secondary, Size=S, State=Default'), 0, 1),
  chip: dump(get(C.components.Chip.setId, 'State=Default'), 0, 1),
  tagShared: dump(get(C.components.Tag.setId, 'Type=Shared, Size=S'), 0, 1),
  tagPersonal: dump(get(C.components.Tag.setId, 'Type=Personal, Size=S'), 0, 1),
  divInset: dump(get(C.components.Divider.setId, 'Type=Inset'), 0, 2),
  toastInfo: dump(get(C.components.Toast.setId, 'Type=Info'), 0, 1),
  rowShared: dump(get(C.components.PaymentRow.setId, 'Type=Shared, State=Default'), 0, 1),
  bprops: C.components.Button.componentProps,
};

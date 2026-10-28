const sheet = node(IDS.c_overlays.BottomSheet.componentId);
const exf = sheet.parent.findOne(n=>n.name==='example · dim + sheet');
for (const c of exf.children.filter(n=>n.type==='INSTANCE')) c.remove();
const si = sheet.createInstance(); exf.appendChild(si); si.x = 0; si.y = 560 - si.height;
const cta = si.findOne(n=>n.name==='cta'); cta.setProperties({[IDS.c_buttons.Button.propKeys.Label]:'저장하기'});
return {label: cta.findOne(n=>n.name==='label').characters, props: JSON.stringify(cta.componentProperties).slice(0,200)};

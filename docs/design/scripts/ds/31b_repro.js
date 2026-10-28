const f = node('24:29748'); for (const c of [...f.children]) c.remove();
const sc = node(IDS.c_v12.SheetContent.componentId);
const sum = sc.findOne(n=>n.name==='summary');
const info = {mainClip: sc.clipsContent, sumClip: sum.clipsContent, sumPad: [sum.paddingLeft], amountX: sc.findOne(n=>n.name==='amount').x};
const i = sc.createInstance(); f.appendChild(i);
const t = i.findOne(n=>n.name==='amount'); await figma.loadFontAsync(t.fontName); t.characters = '₩11,770';
info.inst = i.id;
return info;

const s2 = section('02 디자인 시스템');
const box = figma.createFrame(); box.name='__v12_test'; s2.appendChild(box); box.x=6000; box.y=0; box.layoutMode='VERTICAL'; box.itemSpacing=12; box.resize(430,100); box.primaryAxisSizingMode='AUTO'; box.counterAxisSizingMode='FIXED'; box.paddingLeft=box.paddingRight=box.paddingTop=box.paddingBottom=20;
const r = {};
async function setText(inst, layer, s) { const t = inst.findOne(n => n.name === layer && n.type === 'TEXT'); await figma.loadFontAsync(t.fontName); t.characters = s; }
const key = (comp, p) => Object.keys(C.components[comp].componentProps).find(k => k.startsWith(p + '#'));
// 1) Photo avatar with real image
const av = figma.getNodeById(C.components.Avatar.variants['Color=Gray, Size=L, Source=Photo']).createInstance(); box.appendChild(av);
try { const img = await figma.createImageAsync('https://img.icons8.com/color/96/user-male-circle.png'); av.findOne(n => n.name === 'photo').fills = [{ type: 'IMAGE', scaleMode: 'FILL', imageHash: img.hash }]; r.urlImage = 'ok'; }
catch (e) { r.urlImage = 'fail: ' + e; }
av.setProperties({ [key('Avatar','Me')]: true });
const def = figma.getNodeById(C.components.Avatar.variants['Color=Sunset, Size=L, Source=Default']).createInstance(); box.appendChild(def);
def.setProperties({ [key('Avatar','Left')]: true });
// 2) AvatarStack 3 people, third = initial
const st = figma.getNodeById(C.components.AvatarStack.variants['Count=3, Size=S']).createInstance(); box.appendChild(st);
const avs = st.findAll(n => n.type === 'INSTANCE' && n.name.startsWith('avatar'));
avs[2].setProperties({ Source: 'Initial', Color: 'Blue' }); await setText(avs[2], 'initial', '도');
const st5 = figma.getNodeById(C.components.AvatarStack.variants['Count=5+, Size=S']).createInstance(); box.appendChild(st5);
await setText(st5, 'count', '+3');
r.stack = avs.map(a => a.mainComponent.name);
// 3) PaymentRow shared: 2 participants, payer default image, changed
const row = figma.getNodeById(C.components.PaymentRow.variants['Type=Shared, State=Default']).createInstance(); box.appendChild(row); row.layoutSizingHorizontal = 'FILL';
row.findOne(n => n.name === 'participants').setProperties({ Count: '2' });
row.findOne(n => n.name === 'payer avatar').setProperties({ Source: 'Default', Color: 'Violet' });
row.setProperties({ [key('PaymentRow','Changed')]: true });
await setText(row, 'merchant', 'MK택시'); await setText(row, 'meta', '14:10 · 태현 결제'); await setText(row, 'amount', '₩26,290'); await setText(row, 'original amount', '¥2,860');
const ref = figma.getNodeById(C.components.PaymentRow.variants['Type=Refund, State=Default']).createInstance(); box.appendChild(ref); ref.layoutSizingHorizontal='FILL';
r.row = row.findOne(n=>n.name==='participants').mainComponent.name + ' / ' + row.findOne(n=>n.name==='payer avatar').mainComponent.name;
r.id = box.id; return r;

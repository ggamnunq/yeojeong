const s1 = section('01 브랜드 · 로고');
const tmp = figma.createFrame(); tmp.name='__handoff_test'; s1.appendChild(tmp); tmp.x = 3000; tmp.y = 0; tmp.layoutMode='VERTICAL'; tmp.itemSpacing=12; tmp.primaryAxisSizingMode='AUTO'; tmp.counterAxisSizingMode='AUTO'; tmp.paddingLeft=tmp.paddingTop=tmp.paddingRight=tmp.paddingBottom=20;
const r = {};
// ex1 button
const set = figma.getNodeById(C.components.Button.setId);
const btn = set.findChild(c => c.name === 'Type=Primary, Size=L, State=Default').createInstance();
tmp.appendChild(btn);
const labelKey = Object.keys(C.components.Button.componentProps).find(k => k.startsWith('Label#'));
btn.setProperties({ [labelKey]: '여정 시작' });
btn.layoutSizingHorizontal = 'FIXED'; btn.resize(350, 56);
btn.setProperties({ Type: 'Secondary' }); btn.setProperties({ Type: 'Primary' });
r.btn = btn.findOne(n=>n.name==='label').characters;
// ex2 payment row
const row = figma.getNodeById(C.components.PaymentRow.setId).defaultVariant.createInstance(); tmp.appendChild(row);
const setT = async (inst, layer, s) => { const t = inst.findOne(n => n.name === layer && n.type === 'TEXT'); await figma.loadFontAsync(t.fontName); t.characters = s; };
await setT(row, 'merchant', '쿠로몬 시장 타코야키'); await setT(row, 'amount', '₩8,900'); await setT(row, 'original amount', '¥1,000');
row.setProperties({ Type: 'Pending' });
const av = row.findOne(n => n.name === 'payer avatar'); av.setProperties({ Color: 'Blue' }); await setT(av, 'initial', '도');
r.row = row.findOne(n=>n.name==='merchant').characters + ' / ' + row.findOne(n=>n.name==='tag').name;
// ex3 icon color via variable
const icon = figma.getNodeById(C.components.Icons.components['Icon/wallet']).createInstance(); tmp.appendChild(icon);
const v = await figma.variables.getVariableByIdAsync(C.variables.vars['icon/brand'].id);
icon.findOne(n => n.name === 'color').fills = [figma.variables.setBoundVariableForPaint({ type: 'SOLID', color: { r: 0, g: 0, b: 0 } }, 'color', v)];
// ex4 frame fill bound + text style
const card = figma.createFrame(); tmp.appendChild(card); card.resize(200, 60);
card.fills = [figma.variables.setBoundVariableForPaint({ type: 'SOLID', color: { r: 1, g: 1, b: 1 } }, 'color', await figma.variables.getVariableByIdAsync(C.variables.vars['bg/surface'].id))];
card.setBoundVariable('topLeftRadius', await figma.variables.getVariableByIdAsync(C.variables.vars['radius/lg'].id));
const t = figma.createText(); await figma.loadFontAsync({ family: 'Archivo', style: 'Bold' }); card.appendChild(t);
await t.setTextStyleIdAsync(C.styles.text['Amount/L']); t.characters = '₩1,284,000';
r.ts = t.textStyleId === C.styles.text['Amount/L'];
// ex5 bottom sheet content swap + nested label
const sh = figma.getNodeById(C.components.BottomSheet.componentId).createInstance(); tmp.appendChild(sh);
const ck = Object.keys(C.components.BottomSheet.componentProps);
sh.setProperties({ [ck.find(k=>k.startsWith('Title#'))]: '초대코드 공유' });
sh.findOne(n=>n.name==='cta').setProperties({ [labelKey]: '코드 복사' });
r.sheet = sh.findOne(n=>n.name==='title').characters + ' / ' + sh.findOne(n=>n.name==='cta').findOne(n=>n.name==='label').characters;
r.id = tmp.id;
return r;

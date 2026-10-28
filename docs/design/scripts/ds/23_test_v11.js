const s2 = section('02 디자인 시스템');
const body = figma.createFrame(); body.name='__v11_test'; s2.appendChild(body); body.x = 6000; body.y = 0; body.layoutMode='VERTICAL'; body.itemSpacing=12; body.resize(390, 100); body.primaryAxisSizingMode='AUTO'; body.counterAxisSizingMode='FIXED'; body.paddingLeft=body.paddingRight=20; body.paddingTop=body.paddingBottom=20;
const CO = C.components.Callout, ck = p => Object.keys(CO.componentProps).find(k => k.startsWith(p + '#'));
const banner = figma.getNodeById(CO.variants['Tone=Pending']).createInstance(); body.appendChild(banner); banner.layoutSizingHorizontal = 'FILL';
banner.setProperties({ [ck('Label')]: '확인 필요 3건', [ck('Chevron')]: true });
const nav = figma.getNodeById(C.components.BottomNav.setId).defaultVariant.createInstance(); body.appendChild(nav);
nav.setProperties({ Active: 'Second' }); const a = nav.mainComponent.name;
nav.setProperties({ Phase: 'Ended', Active: 'Second' }); const b = nav.mainComponent.name;
const hd = figma.getNodeById(C.components.TopHeader.variants['Type=Group']).createInstance(); body.appendChild(hd);
const hk = p => Object.keys(C.components.TopHeader.componentProps).find(k => k.startsWith(p + '#'));
hd.setProperties({ [hk('Menu')]: true, [hk('Status badge')]: false });
function dumpLayers(inst) { return inst.findAll(n => n.type === 'TEXT' || n.type === 'INSTANCE').map(n => n.type === 'TEXT' ? `TEXT ${n.name}="${n.characters}"` : `INST ${n.name}→${n.mainComponent ? n.mainComponent.name : '?'}`); }
const r = {navA:a, navB:b, banner: banner.findOne(n=>n.name==='label').characters + ' w=' + Math.round(banner.width), header: dumpLayers(hd).slice(0,6), id: body.id};
return r;

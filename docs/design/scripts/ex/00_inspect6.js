const V = (k, v) => node(C.components[k].variants[v]);
const st4 = V('AvatarStack','Count=4, Size=XS'), st2 = V('AvatarStack','Count=2, Size=XS');
const ph = n => { const p = n.findOne(x => x.name === 'photo'); return p ? p.fills.map(f => f.type + ':' + (f.imageHash || '')) : null; };
const m = V('Avatar','Color=Gray, Size=M, Source=Photo');
const tog = node(C.components.SheetContent.componentId).findOne(n => n.name === 'toggle · 준용');
const togAv = tog.findOne(n => n.type === 'INSTANCE');
return {
  st4: st4.children.map(c => [c.name, c.mainComponent.name, ph(c), Object.fromEntries(Object.entries(c.componentProperties).map(([k,v])=>[k,v.value]))]),
  st2: st2.children.map(c => [c.name, c.mainComponent.name, ph(c)]),
  m: ph(m), mKids: m.children.map(c => c.name + ':' + c.type),
  togAv: [togAv.name, togAv.mainComponent.name, ph(togAv)],
  togs: ['준용','민지','태현','수빈'].map(n => { const t = node(C.components.SheetContent.componentId).findOne(x => x.name === 'toggle · ' + n); const a = t.findOne(x => x.type==='INSTANCE'); return [n, a.mainComponent.name, ph(a), a.componentProperties['Me#24:260'] && a.componentProperties['Me#24:260'].value]; }),
  dlgEffects: V('Dialog','Type=SharedToPersonal').effectStyleId,
};

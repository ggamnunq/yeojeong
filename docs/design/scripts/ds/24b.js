const A = node(IDS.c_nav.Avatar.setId);
const s2 = S2(); const f = frame({name:'__av_test', layout:'HORIZONTAL', gap:16, pad:20, hug:'both', parent:s2, x:6000, y:0, align:'CENTER'}); await fillV(f,'bg/canvas');
const kR = propKey(A,'Ring'), kM = propKey(A,'Me'), kL = propKey(A,'Left');
const mk = (n, props={}) => { const i = A.children.find(v=>v.name===n).createInstance(); f.appendChild(i); i.setProperties(props); return i; };
mk('Color=Violet, Size=XL, Source=Default'); mk('Color=Sunset, Size=XL, Source=Default'); mk('Color=Gray, Size=XL, Source=Photo');
mk('Color=Gray, Size=XL, Source=Photo', {[kM]:true}); mk('Color=Gray, Size=XL, Source=Photo', {[kL]:true}); mk('Color=Violet, Size=XL, Source=Initial', {[kL]:true});
mk('Color=Violet, Size=L, Source=Default', {[kR]:true}); mk('Color=Blue, Size=M, Source=Initial', {[kM]:true});
return {id:f.id, setH:A.height, lastY: Math.max(...A.children.map(v=>v.y+v.height))};

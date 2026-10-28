const A = node(IDS.c_nav.Avatar.setId);
const surf = await P('bg/surface');
let n = 0;
for (const v of A.children) { const fa = v.findOne(x=>x.name==='fade 60%'); fa.fills=[surf]; fa.opacity = 0.6; n++; }
return {n, sample: JSON.stringify(A.children[0].findOne(x=>x.name==='fade 60%').fills[0]).slice(0,120)};

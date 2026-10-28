const ai = node(IDS.logo['Logo/AppIcon']);
const r1 = ai.findOne(n=>n.name==='start ㅇ'), r2 = ai.findOne(n=>n.name==='destination ㅇ');
const old = ai.findOne(n=>n.name==='route'); if (old) old.remove();
const sx = r1.x + r1.width + 52, sy = r1.y + r1.height*0.5, ex = r2.x + r2.width*0.56, ey = r2.y - 58;
const P0=[sx,sy], P1=[sx+190,sy], P2=[ex+70,sy+150], P3=[ex,ey];
const B = t => [0,1].map(i => (1-t)**3*P0[i] + 3*(1-t)**2*t*P1[i] + 3*(1-t)*t**2*P2[i] + t**3*P3[i]);
// arc-length sampling
const S=[]; let L=0, prev=B(0); S.push([0,0]); for (let i=1;i<=400;i++){ const p=B(i/400); L+=Math.hypot(p[0]-prev[0],p[1]-prev[1]); S.push([i/400,L]); prev=p; }
const N = 6, dots = [];
for (let k=0;k<N;k++) { const target = L*k/(N-1); const s = S.find(x=>x[1]>=target) || S[S.length-1]; const p = B(s[0]);
  const d = figma.createEllipse(); d.resize(30,30); d.x = p[0]-15; d.y = p[1]-15; d.fills=[await P('text/inverse', 0.75)]; ai.appendChild(d); dots.push(d); }
const g = figma.group(dots, ai); g.name = 'route';
for (const n of [g]) n.constraints = {horizontal:'SCALE', vertical:'SCALE'};
for (const d of dots) d.constraints = {horizontal:'SCALE', vertical:'SCALE'};
return {L, n:dots.length};

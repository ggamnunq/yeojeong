const body = node(IDS.c_buttons.body);
const P_ = {}; body.findAll(n=>n.name.startsWith('panel/')).forEach(p=>P_[p.name.replace('panel/','')]=p);
const plan = {
  '식별 · 내비게이션': [['TopHeader'],['BottomNav · NavItem'],['Avatar','Tag · 지출 구분'],['ListItem','Badge · 여정 상태']],
  '결제 · 정산 (도메인)': [['PaymentRow · 결제 내역 행'],['TimelineItem · 타임라인 노드'],['StatCard','BudgetProgress'],['SettlementRow · TransferRow']],
};
for (const [g, cols] of Object.entries(plan)) {
  const grp = body.findOne(n=>n.name==='group/'+g); const row = grp.findOne(n=>n.name==='columns');
  const old = [...row.children];
  for (const col of cols) { const cf = frame({name:'column', layout:'VERTICAL', gap:40, fill:'none', hug:'both', parent:row}); for (const n of col) cf.appendChild(P_[n]); }
  for (const o of old) if (o.children.length===0) o.remove();
}
const s2 = S2(); fitSection(s2, 120);
// shrink height if needed
let maxY=0; for (const c of s2.children) maxY=Math.max(maxY, c.y+c.height); s2.resizeWithoutConstraints(5400, maxY+120);
return {s2:[s2.width,s2.height]};

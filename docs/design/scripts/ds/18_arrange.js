const body = node(IDS.c_buttons.body);
const P_ = {}; for (const p of body.children) if (p.name.startsWith('panel/')) P_[p.name.replace('panel/','')] = p;
const groups = [
  ['액션 · 입력 컨트롤', '버튼·입력·선택 컨트롤', [['Button'],['IconButton','Divider'],['KakaoLoginButton','Chip','Checkbox'],['SegmentedControl','Input','Toggle']]],
  ['식별 · 내비게이션', '사람·상태·지출 구분 라벨, 상단 헤더·하단 내비·범용 행', [['TopHeader','BottomNav · NavItem'],['Avatar','Tag · 지출 구분'],['ListItem','Badge · 여정 상태']]],
  ['결제 · 정산 (도메인)', '결제 내역(리스트/타임라인), 현황 통계·예산, 여정 종료 후 정산', [['PaymentRow · 결제 내역 행','TimelineItem · 타임라인 노드'],['StatCard','BudgetProgress'],['SettlementRow · TransferRow']]],
  ['오버레이 · 피드백', '바텀시트·다이얼로그·토스트·빈 화면', [['BottomSheet'],['Dialog','Toast'],['EmptyState']]],
];
body.layoutWrap = 'NO_WRAP'; body.layoutMode = 'VERTICAL'; body.itemSpacing = 96; body.counterAxisSizingMode='FIXED'; body.resize(5160, body.height); body.primaryAxisSizingMode='AUTO';
const used = new Set();
const made = [];
for (const [title, sub, cols] of groups) {
  const g = frame({name:'group/'+title, layout:'VERTICAL', gap:24, fill:'none', hug:'v', w:5160, parent:body});
  const h = frame({name:'head', layout:'HORIZONTAL', gap:16, align:'MAX', fill:'none', hug:'both', parent:g});
  await T(title, 'Heading/H1', 'text/primary', {parent:h}); await T(sub, 'Body/M', 'text/tertiary', {parent:h});
  const row = frame({name:'columns', layout:'HORIZONTAL', gap:40, fill:'none', hug:'both', parent:g, align:'MIN'});
  for (const col of cols) {
    const cf = frame({name:'column', layout:'VERTICAL', gap:40, fill:'none', hug:'both', parent:row});
    for (const n of col) { const p = P_[n]; if (!p) throw new Error('missing panel '+n); cf.appendChild(p); used.add(n); }
  }
  made.push(g.id);
}
const left = Object.keys(P_).filter(n=>!used.has(n));
// fit sections
const s1 = S1(), s2 = S2();
fitSection(s1, 120); fitSection(s2, 120);
s1.resizeWithoutConstraints(2800, s1.height); s2.resizeWithoutConstraints(5400, s2.height);
// section1: keyword cards equal height
const kw = s1.findOne(n=>n.name==='keywords'); if (kw) for (const c of kw.children) c.layoutAlign='STRETCH';
return {left, s1:[s1.width,s1.height], s2:[s2.width,s2.height], body:[body.width, body.height]};

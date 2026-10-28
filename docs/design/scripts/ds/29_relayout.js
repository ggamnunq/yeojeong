const s2 = S2(); const fw = node(IDS.icons.foundations); const cw = node(IDS.c_buttons.componentsWrap);
const before = cw.y; cw.y = fw.y + fw.height + 160;
let maxY = 0; for (const c of s2.children) maxY = Math.max(maxY, c.y + c.height); s2.resizeWithoutConstraints(5400, maxY + 120);
// read-only check of other sections
const res = {};
for (const sec of figma.currentPage.children.filter(n=>n.type==='SECTION' && !/^0[12]/.test(n.name))) {
  for (const i of sec.findAll(n=>n.type==='INSTANCE')) { const mc = i.mainComponent; if (!mc) { res.missing=(res.missing||0)+1; continue; }
    const set = mc.parent && mc.parent.type==='COMPONENT_SET' ? mc.parent.name : mc.name;
    if (['PaymentRow','TimelineItem','Avatar','AvatarStack','Tag','Callout','Dialog','SettlementRow','BottomSheet'].includes(set)) { const k = sec.name.slice(0,2)+' '+set; res[k]=(res[k]||0)+1; } } }
return {before, after: cw.y, s2h: s2.height, overlapsFixed: cw.y >= fw.y+fw.height, res};

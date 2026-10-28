// EX-01c 공동 → 개인 확인 — EX-01 복제 위에 bg/dim + Dialog Type=SharedToPersonal (그 외 요소 없음)
// 실행: __IDS__ 치환 후 cat ds/C.js ex/lib.js body > ex/.run.js && python3 tools/figrun.py ex/.run.js
const IDS = __IDS__;
const sec = exSection();
const NAME = 'EX-01c 공동 → 개인 확인';
for (const old of sec.children.filter(n => n.name === NAME)) old.remove();

const base = node(IDS.ex01.frame);
const scr = base.clone();
sec.appendChild(scr);
scr.name = NAME;
scr.x = base.x + (390 + 40) * 2; scr.y = base.y;

const dim = figma.createRectangle();
scr.appendChild(dim);
dim.layoutPositioning = 'ABSOLUTE';
dim.name = 'dim (bg/dim)';
dim.resize(390, 844); dim.x = 0; dim.y = 0;
dim.fills = [await paint('bg/dim')];

const dlg = inst('Dialog', 'Type=SharedToPersonal');   // 문구·버튼(취소 / 개인으로 변경)은 컴포넌트 기본값 그대로
scr.appendChild(dlg);
dlg.layoutPositioning = 'ABSOLUTE';
dlg.x = Math.round((390 - dlg.width) / 2); dlg.y = Math.round((844 - dlg.height) / 2);

return { ex01c: scr.id, dialog: dlg.id, dim: dim.id, dlg: [dlg.x, dlg.y, dlg.width, dlg.height] };

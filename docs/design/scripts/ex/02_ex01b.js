// EX-01b 결제 상세 바텀시트(WF-20) — EX-01 복제 위에 bg/dim + BottomSheet(Content = SheetContent/PaymentDetail)
// 실행: __IDS__를 ex/ids.json으로 치환 → cat ds/C.js ex/lib.js body > ex/.run.js && python3 tools/figrun.py ex/.run.js
const IDS = __IDS__;
const sec = exSection();
const NAME_B = 'EX-01b 결제 상세 · 미확정 → 개인 확정 (바텀시트)';
const OLD_C = 'EX/Sheet content · 결제 상세(미확정)';   // v1.1까지 쓰던 로컬 콘텐츠 컴포넌트 → v1.2에서 DS SheetContent로 대체, 삭제
for (const old of sec.children.filter(n => n.name === NAME_B || n.name === OLD_C)) old.remove();

const base = node(IDS.ex01.frame);
const scr = base.clone();
sec.appendChild(scr);
scr.name = NAME_B;
scr.x = base.x + 390 + 40; scr.y = base.y;

const dim = figma.createRectangle();
scr.appendChild(dim);
dim.layoutPositioning = 'ABSOLUTE';
dim.name = 'dim (bg/dim)';
dim.resize(390, 844); dim.x = 0; dim.y = 0;
dim.fills = [await paint('bg/dim')];

const sh = inst('BottomSheet');
scr.appendChild(sh);
sh.layoutPositioning = 'ABSOLUTE';
const SK = p => propKey('BottomSheet', p);
sh.setProperties({ [SK('Title')]: '결제 상세', [SK('Content')]: C.components.SheetContent.componentId, [SK('CTA')]: true, [SK('Close')]: true });
const content = sh.findOne(n => n.name === 'content');
// 금액 요약 (데이터: 패밀리마트 난바역점 ¥1,280 ≈ ₩11,770, 11.13 08:50, 내 결제, 100엔 = 919.20원)
await setText(content, 'merchant', '패밀리마트 난바역점');
await setText(content, 'amount', '₩11,770');
await setText(content, 'detail', '¥1,280 · 100엔 = 919.20원 · 11.13 08:50 · 내 결제');
// [개인|공동] → 미확정 → 개인 확정 상태이므로 개인 선택
const et = content.findOne(n => n.name === 'expense type');
et.setProperties({ Selected: 'First' });
await setText(et, 'label 1', '개인');
await setText(et, 'label 2', '공동');
// 부담 인원: AvatarToggle은 Selected=On|Off뿐(비활성 변형 없음) → 개인일 때는 부담 인원 영역을 숨김
content.findOne(n => n.name === 'participants header').visible = false;
content.findOne(n => n.name === 'participants').visible = false;
sh.findOne(n => n.name === 'cta').setProperties({ [propKey('Button', 'Label')]: '개인으로 확정' });
sh.primaryAxisSizingMode = 'AUTO';   // 시트 높이 hug (하단 패딩 58 = 24 + 안전영역 34, 컴포넌트 기본)
sh.x = 0; sh.y = 844 - sh.height;

return { ex01b: scr.id, sheet: sh.id, dim: dim.id, sheetH: sh.height, sheetPadB: sh.paddingBottom, contentH: content.height, contentMain: content.mainComponent.name };

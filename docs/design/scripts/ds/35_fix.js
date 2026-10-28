async function setText(n, s) { await font(n.fontName.family, n.fontName.style); n.characters = s; }
const sh = node(IDS.c_overlays.BottomSheet.componentId);
const res = [];
for (const nm of ['example · dim + sheet','example · payment detail sheet']) { const ex = sh.parent.findOne(n=>n.name===nm); const i = ex.children.find(n=>n.type==='INSTANCE'); i.y = ex.height - i.height; res.push([nm, i.y, i.height]); }
const TAG = node(IDS.c_inputs.Tag.setId); const u = TAG.parent.parent.findOne(n=>n.name==='usage');
await setText(u, '결제 행·상세·정산 내역에 붙는 비대화형 라벨. 개인(회색·자물쇠) = 나만 보임·정산 제외, 미확정(회색 글자만, 테두리·아이콘 없음) = 공동/개인 미지정 — 메타 줄 맨 끝에 조용히, 중복 의심(빨강) = 같은 금액·가맹점 결제가 겹침, 환불(파랑) = 취소·환불 건. 공동 결제는 Tag 대신 AvatarStack(부담 인원 프사).');
const CO = node(IDS.c_patch.Callout.setId); const cu = CO.parent.parent.findOne(n=>n.name==='usage');
await setText(cu, '화면 상단 한 줄 배너(탭 → 해당 목록/시트). Pending = 미확정 결제 확인 유도("확인 필요 2건", 회색 바탕·연회색 테두리 + 주황 점 하나), Info = 안내(지갑 동기화), Warning = 주의(예산 80%↑), Disconnected = 연동 끊김("토스 연결이 끊겼어요 › 다시 연결"). 부모 안에서 FILL.');
const TL = node(IDS.c_list.TimelineItem.setId); const tu = TL.parent.parent.findOne(n=>n.name==='usage');
await setText(tu, '결제 내역 타임라인 보기. 시각 · 레일(점+선) · 카드. 점 = 공동 보라 / 개인 회색 / 미확정 빈 회색 링. 공동 카드에는 부담 인원 프사 스택(participants), 미확정은 카드 테두리 그대로 + 메타 줄 끝 "미확정" 태그 + 금액 보조색. Now = 현재 시각(노을색). Position=Last면 아래 선을 숨긴다.');
return res;

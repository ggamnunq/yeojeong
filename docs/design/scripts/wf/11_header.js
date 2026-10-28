// 04 섹션 헤더 (v3): 제목 + "읽는 법 + 표기 규칙(프사 스택)" 카드 하나, 섹션 크기 맞춤, 중첩 섹션 ID 반환
const s = SEC();
for (const c of [...s.children]) if (c.name.startsWith('Header · ') || c.name.startsWith('RowTitle · ') || c.name.startsWith('Note · ')) c.remove();
const ids = {};
const head = box({ name: 'Header · 제목', dir: 'V', w: SUB_W, gap: 8 });
s.appendChild(head); head.x = SUB_X; head.y = 80;
await T('04 와이어프레임 — 「여정」 전체 플로우', { parent: head, size: 56, weight: 'Black', w: 'fill', lh: 72, ls: -1.2 });
await T('45화면 + 엣지케이스 규칙표 · 390×844 · 로파이 v3 · 샘플: 오사카 3박 4일 · 준용(나)·민지·태현·수빈', { parent: head, size: 20, color: '#4B5563', w: 'fill', lh: 30 });
ids['Header'] = head.id;

const card0 = box({ name: 'Header · 읽는 법 + 표기 규칙', dir: 'H', w: SUB_W, pad: [28, 32, 28, 32], gap: 56, radius: 20, fill: '#FFFFFF', stroke: C.line });
s.appendChild(card0); card0.x = SUB_X; card0.y = 210;
async function col(title, w) { const c = box({ parent: card0, dir: 'V', w, gap: 12 }); await T(title, { parent: c, size: 20, weight: 'Bold' }); return c; }
// 1) 읽는 법
const c1 = await col('읽는 법', 700);
for (const l of ['A → B → D → E → F 순서로 읽기', 'C 공통 UI = D·E·F 모든 여정 화면에 적용', 'G 지갑 · H 마이페이지 = 헤더 우측 아이콘', 'I 분담 변경 · J 엣지케이스 = 보충 시나리오', '화면 아래 캡션 = WF 번호 + 한 줄'])
  await T(l, { parent: c1, size: 15, w: 'fill', lh: 23 });
// 2) 결제 표시
const c2 = await col('결제 표시', 640);
const sr = box({ parent: c2, dir: 'H', w: 'fill', gap: 12, align: 'CENTER' });
await stack(sr, ['준용', '민지', '태현', '수빈']); await T('공동 = 부담 인원 프사 스택 (전원·일부는 인원 수로 구분)', { parent: sr, size: 15, w: 'fill' });
for (const [label, kind, ic, desc] of [['개인', 'personal', 'lock', '나만 보임 · 정산 제외'], ['미확정', 'pending', undefined, '결제자만 보임 · 메타 줄 끝 회색 칩'], ['변경됨', 'soft', undefined, '공동 결제가 수정됨'], ['중복 의심', 'shared', 'high-priority', '표시만, 삭제 안 함']]) {
  const r = box({ parent: c2, dir: 'H', w: 'fill', gap: 12, align: 'CENTER' });
  const tw = box({ parent: r, dir: 'H', w: 92 }); await tag(label, tw, kind, { icon: ic });
  await T(desc, { parent: r, size: 15, w: 'fill' });
}
// 3) 프사 스택 규칙
const c3 = await col('프사 · 스택 규칙', 1220);
const row3 = box({ parent: c3, dir: 'H', w: 'fill', gap: 40 });
const ex = box({ parent: row3, dir: 'V', w: 420, gap: 12 });
for (const [label, names] of [['전원 4명 (나 포함)', ['준용', '민지', '태현', '수빈']], ['일부 2명', ['준용', '민지']], ['6명 → 최대 4 + "+N"', ['준용', '민지', '태현', '수빈', '지호', '하은']]]) {
  const r = box({ parent: ex, dir: 'H', w: 'fill', gap: 12, align: 'CENTER' });
  const sw = box({ parent: r, dir: 'H', w: 96 }); await stack(sw, names);
  await T(label, { parent: r, size: 15, w: 'fill' });
}
const pr = box({ parent: ex, dir: 'H', w: 'fill', gap: 16, align: 'CENTER' });
for (const [n, l] of [['민지', '카카오 프사 (사진 자리)'], ['태현', '프사 없음 → 기본 이미지']]) {
  const it = box({ parent: pr, dir: 'H', gap: 6, align: 'CENTER' }); await avatar(n, it, 24); await T(l, { parent: it, size: 13, color: C.sub });
}
const spec = box({ parent: row3, dir: 'V', w: 'fill', gap: 6 });
for (const l of ['지름 20 (행) · 24 (상세 시트) · 토글 48', '겹침 −6 (시트 −7) · 흰 테두리 1.5 (바깥)', '최대 4개 표시, 넘으면 "+N"', '순서: 나 먼저 → 나머지는 가입 순', '"나" = 진한 테두리 2 · 나간 멤버 = 흐리게', '결제자 아바타(행 왼쪽)도 같은 프사 규칙'])
  await T(l, { parent: spec, size: 15, w: 'fill', lh: 23 });
// 섹션 크기 맞춤 (폭 3000 고정)
let maxY = 0; for (const c of s.children) maxY = Math.max(maxY, c.y + c.height);
s.resizeWithoutConstraints(SUB_X * 2 + SUB_W, maxY + 100);
const sections = {}; for (const c of s.children) if (c.type === 'SECTION') sections[c.name] = c.id;
return { ...ids, HeaderCard: card0.id, sections, _cardBottom: card0.y + card0.height, _size: [s.width, s.height] };

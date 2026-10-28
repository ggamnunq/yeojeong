const s1 = S1();
const lab = s1.findOne(n=>n.name==='__logo_lab'); if (lab) lab.remove();
for (const c of [...s1.children]) if (['01 · Header','01 · 브랜드 개요'].includes(c.name)) c.remove();
s1.fills = [solid('#F4F5F7')];
// header
const h = frame({name:'01 · Header', layout:'VERTICAL', gap:12, fill:'none', hug:'v', w:2560, parent:s1, x:120, y:120});
await eyebrow('YEOJEONG BRAND GUIDE · v1.0 · 2026-10-28', h);
const ht = await text('01 브랜드 · 로고', {family:'Noto Sans KR', style:'Bold', size:72, letterSpacing:-2, color:'#14141E', parent:h}); ht.fills=[await P('text/primary')];
await T('그룹 여행 공동 지갑 「여정」의 브랜드 방향, 로고, 컬러, 타이포그래피. 컴포넌트와 토큰은 02 디자인 시스템 섹션을 본다.', 'Body/L', 'text/secondary', {parent:h, width:1600});
// overview card
const ov = card(s1, {name:'01 · 브랜드 개요', w:1240, x:120, y:400, gap:36});
await eyebrow('BRAND OVERVIEW', ov);
const one = await T('함께 떠난 여행의 결제를 한 지갑에 모으고,\n끝나면 정확하게 나눠 주는 그룹 여행 공동 지갑', 'Heading/H1', 'text/primary', {parent:ov, width:1144, name:'one-liner'});
one.fontSize = 34; one.lineHeight={unit:'PIXELS',value:48};
// keywords
const kw = frame({name:'keywords', layout:'HORIZONTAL', gap:16, fill:'none', hug:'v', w:1144, parent:ov});
const KW = [['동행','같이 쓰고, 같이 본다','공동 지출은 모두에게 투명하게, 개인 지출은 나에게만.'],['정확','한 푼까지 추적되는 정산','어떤 결제가 누구에게 얼마씩 나뉘었는지 언제든 거슬러 볼 수 있다.'],['설렘','돈 얘기는 짧게, 여행은 길게','자동 수집이 기본. 사용자는 애매한 것만 확인한다.']];
for (const [k, sub, d] of KW) {
  const c = frame({name:'keyword/'+k, layout:'VERTICAL', gap:8, pad:24, radius:16, hug:'v', w:370, parent:kw}); await fillV(c,'bg/brand-subtle'); grow(c);
  await T(k, 'Heading/H2', 'text/brand', {parent:c});
  await T(sub, 'Body/M Strong', 'text/primary', {parent:c});
  await T(d, 'Body/S', 'text/secondary', {parent:c, width:322});
}
// color rationale
const cr = frame({name:'color-rationale', layout:'HORIZONTAL', gap:28, fill:'none', hug:'v', w:1144, parent:ov, align:'MIN'});
const sw = frame({name:'swatch', layout:'VERTICAL', gap:0, w:200, h:200, radius:20, parent:cr, justify:'MAX', pad:16}); await fillV(sw,'primary/500');
await text('#5B4CF5', {family:'Archivo', style:'SemiBold', size:18, color:'#FFFFFF', parent:sw});
await text('Journey Violet', {family:'Archivo', style:'Medium', size:13, color:'#FFFFFF', parent:sw});
const crt = frame({name:'text', layout:'VERTICAL', gap:12, fill:'none', hug:'v', w:916, parent:cr});
await T('컬러 선택 근거', 'Heading/H3', 'text/primary', {parent:crt});
await T('토스 블루(#3182F6)·카카오 옐로(#FEE500)·스플릿와이즈 민트와 겹치지 않는 블루-바이올렛을 골랐다. 파랑이 주는 금융의 신뢰감은 지키면서, 해 질 녘 하늘의 보랏빛으로 여행의 설렘을 더한다. 성공(초록)·경고(주황)·오류(빨강)·정보(파랑) 어디에도 속하지 않는 색이라, 돈을 다루는 화면에서 브랜드 색이 수입·손실 같은 의미로 오독되지 않는다.', 'Body/M', 'text/secondary', {parent:crt, width:916});
const ctr = frame({name:'contrast', layout:'HORIZONTAL', gap:8, fill:'none', hug:'both', parent:crt});
for (const [lab, bgc] of [['흰 글자 on 500 · 5.53:1 AA','primary/500'],['흰 글자 on 600 · 7.66:1 AAA','primary/600'],['포인트 Sunset #FF7A59 · 장식 전용','sunset/500']]) {
  const chip = frame({name:'chip', layout:'HORIZONTAL', pad:[6,12,6,12], radius:999, hug:'both', parent:ctr}); await fillV(chip,bgc);
  await T(lab, 'Label/S', 'text/inverse', {parent:chip});
}
return {header:h.id, overview:ov.id, h: ov.height};

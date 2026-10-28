const S = section('05 핵심 플로우 · 결제수단 → 정산', {x:16400, y:0, w:8000, h:3000, fill:'#F4F5F7'});
for (const c of [...S.children]) c.remove();
const KR = 'Noto Sans KR';
await text('05 핵심 플로우 — 결제수단 등록 → 조회 → 여행 결제내역 표시 → 누구끼리 내는지 지정 → 분담 변경 → 여정 종료 후 정산', {family:KR, style:'Bold', size:40, color:'#111827', parent:S, x:80, y:60, name:'title'});
await text('04 와이어프레임(v3)에서 해당 화면만 복제해 순서대로 모았다 (사본). 회색 화살표 = 다음 화면, 굵은 화살표 = 다음 단계. 윗줄 ①~③, 아랫줄 ④~⑥.', {family:KR, style:'Regular', size:16, color:'#6B7280', parent:S, x:80, y:132, name:'subtitle'});
const steps = [
  {n:1, row:0, title:'결제수단 등록', desc:'가입 마지막 단계(또는 지갑에서 추가). 토스 인증 → 계좌·카드 선택 → 완료', ids:['24:9134','24:9169','24:9193','24:9248']},
  {n:2, row:0, title:'결제수단 조회', desc:'지갑에서 연결 계좌·카드와 동기화 시각 확인 · 추가 연결 · 연결 만료 시 "다시 연결"', ids:['24:11782','24:11834','24:24367']},
  {n:3, row:0, title:'여행 결제내역에 표시', desc:'여정 시작 후 연결 수단의 결제가 자동 인입. 분류 전엔 「미확정」(결제자 본인에게만) · 환불은 원 결제와 묶음 · 중복은 표시만', ids:['24:7451','24:10559','24:24062']},
  {n:4, row:1, title:'누구끼리 내는지 지정', desc:'미확정 결제 탭 → 개인 / 공동(전원) / 공동(일부: 부담 인원 프사 선택). 확정해야 공개·정산 포함', ids:['24:10697','24:10876']},
  {n:5, row:1, title:'분담 변경 (결제자 본인 · 진행 중만)', desc:'공동→개인은 이미 공개된 건이라 확인 다이얼로그 · 개인→공동은 부담 인원 선택 · 일부↔전원 변경 · 결제자 아닌 멤버는 읽기 전용', ids:['24:20950','24:21146','24:21569','24:22026','24:22256']},
  {n:6, row:1, title:'여정 종료 후 반영', desc:'자동(기간 종료) 또는 수동 종료 → 정산 요약 → 멤버별 내역 · 종료 후 변경 잠금 · 나간 멤버 부담 유지', ids:['24:11230','24:11639','24:11720','24:22384','24:24457']},
];
const W=390, H=844, GAP=60, STEP_GAP=200, HEAD_Y0=220, ROW_H=H+420;
const out=[];
async function arrow(x1,x2,y,bold){const l=figma.createLine();S.appendChild(l);l.resize(x2-x1-8,0);l.x=x1+4;l.y=y;l.strokes=[solid(bold?'#111827':'#9CA3AF')];l.strokeWeight=bold?3:2;l.strokeCap='ARROW_LINES';l.name=bold?'arrow/step':'arrow/next';}
let x=80, curRow=0;
for (let si=0; si<steps.length; si++){
  const st=steps[si];
  if (st.row!==curRow){ curRow=st.row; x=80; }
  const HEAD_Y=HEAD_Y0+curRow*ROW_H, Y=HEAD_Y+140;
  const stepW=st.ids.length*W+(st.ids.length-1)*GAP;
  const badge=frame({name:'badge',w:44,h:44,fill:'#111827',radius:22,layout:'HORIZONTAL',align:'CENTER',justify:'CENTER',parent:S,x,y:HEAD_Y});
  await text(String(st.n),{family:'Inter',style:'Bold',size:20,color:'#FFFFFF',parent:badge});
  await text(st.title,{family:KR,style:'Bold',size:28,color:'#111827',parent:S,x:x+56,y:HEAD_Y+2,name:'step-title'});
  await text(st.desc,{family:KR,style:'Regular',size:15,color:'#4B5563',parent:S,x,y:HEAD_Y+58,width:Math.max(stepW,520),name:'step-desc',lineHeight:22});
  for (let i=0;i<st.ids.length;i++){
    const src=node(st.ids[i]); const c=src.clone(); S.appendChild(c);
    c.x=x; c.y=Y; c.name=`F${st.n}.${i+1} ${src.name}`;
    await text(src.name,{family:KR,style:'Medium',size:13,color:'#6B7280',parent:S,x,y:Y+H+14,width:W,name:'caption'});
    out.push(c.id);
    if(i<st.ids.length-1) await arrow(x+W,x+W+GAP,Y+H/2,false);
    x+=W+(i<st.ids.length-1?GAP:0);
  }
  const next=steps[si+1];
  if(next && next.row===curRow){ await arrow(x,x+STEP_GAP,Y+H/2,true); x+=STEP_GAP; }
}
let mx=0,my=0; for(const c of S.children){mx=Math.max(mx,c.x+c.width);my=Math.max(my,c.y+c.height)}; S.resizeWithoutConstraints(mx+80,my+80);
return {section:S.id,w:S.width,h:S.height,screens:out.length};

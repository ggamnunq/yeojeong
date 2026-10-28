# 여정 디자인 산출물 (2026-10-28)

Figma 파일: https://www.figma.com/design/sdIBxJiMyqxhzaO5HZcUwn/여정 — 페이지 「화면」 하나에 섹션 5개.

| 섹션 | 내용 | 문서 |
|---|---|---|
| `01 브랜드 · 로고` | 브랜드 방향, 팔레트, 역할 토큰, 타이포, 워드마크 로고(기본/반전/모노/락업/앱 아이콘) | `design-system/spec.md` 1~3장 |
| `02 디자인 시스템` | Figma 변수(`여정/Color`, `여정/Size`), Paint/Text/Effect 스타일, 컴포넌트 세트 30여 종, 아이콘 세트 | `design-system/` |
| `03 예시 화면` | DS 인스턴스만으로 조립한 「여정 진행 중 · 결제내역」 하이파이 + 결제 상세 바텀시트 + 공동→개인 확인 상태 | `example/notes.md` |
| `04 와이어프레임` | 전체 플로우 로파이 45화면, 플로우별 중첩 섹션 A~J (v3: 정보 다이어트 + 프사 스택 + 분담 변경 + 엣지케이스 규칙표) | `wireframes/screens.md` |
| `05 핵심 플로우 · 결제수단 → 정산` | 04에서 결제수단 등록 → 조회 → 결제내역 표시 → 분담 지정 → 분담 변경 → 종료 후 정산 흐름 22화면(6단계, 2줄)만 복제해 모음 | `scripts/flow/02_build_v2.js` |

## 핵심 결정
- **프라이머리 Journey Violet `#5B4CF5`** (흰 글자 대비 5.53:1), 포인트 **Sunset `#FF7A59`**. 본문 **Noto Sans KR**, 금액 **IBM Plex Sans KR**(고정폭 숫자, v1.3에서 Archivo 대체 — Archivo의 ₩ 글리프가 잘려 보이는 문제).
- 결제 상태 3종: **미확정**(불러온 직후, 결제자 본인에게만 보임) / **공동**(전원 또는 일부 — 부담 인원 선택) / **개인**(정산 제외, 타인에겐 건수만).
- 공동 결제의 부담 인원은 텍스트("공동 4명")가 아니라 **프사 원형 스택**(카카오 프사 → 없으면 자체 기본 유저 이미지, 최대 4 + "+N", "나" 테두리 강조, 나간 멤버 흐리게). 분담 변경은 결제자 본인이 진행 중에만; 공동→개인은 확인 다이얼로그; 종료 후 잠금. 엣지케이스 규칙표 16행은 `wireframes/screens.md`.
- 하단 네비 3탭: 결제내역 / 현황 / 여정 정보. 종료 후엔 현황 → 정산.
- 화면 원칙: 핵심 정보만, 설명형 마이크로카피 없음, 모달은 제목 + 한 줄 + 버튼.
- 지출 카테고리 UI 없음(추후). 예산은 공동 지출 기준 금액 하나 + 초과 여부.

## Figma를 코드로 조작하는 방법 (`tools/`)
이 파일은 학교 계정 소유라 claude.ai Figma MCP(dino 계정)로는 못 건드린다. 대신 **Orca 내장 브라우저**에 파일을 편집 모드로 띄워 두고, 그 탭의 `window.figma`(Plugin API)를 `orca eval`로 호출한다.

```bash
orca tab list --worktree all --json          # "여정 – Figma" 탭의 browserPageId 확인
export FIGMA_PAGE_ID=<browserPageId>         # 기본값은 도구 안에 하드코딩돼 있으니 탭이 바뀌면 설정
python3 tools/figrun.py script.js            # script.js = async 함수 본문. prelude.js 헬퍼(text/frame/section/imageNode…) 자동 포함
python3 tools/figrun.py -e "return figma.currentPage.children.map(n=>n.name)"
python3 tools/figshot.py <nodeId|name:레이어명> out.png [scale]     # 노드를 PNG로 내보내 눈으로 확인
python3 tools/icons8.py icons.js --style fluency-systems-regular --size 96 --color 6B7280 home wallet   # PNG 아이콘 → const ICONS
```
`scripts/`는 각 섹션을 생성한 스크립트 원본이다(아이콘 base64 번들은 용량 때문에 제외 — `icons8.py`로 재생성). 스크립트 안의 `$S` 경로와 노드 ID는 당시 세션 기준이므로 재실행 시 `design-system/components.json`, `wireframes/screens.md`의 ID로 맞춘다.

## 미해결 / 다음 단계
- 미확정·공동 N명 표기 방식(태그 vs 시각 처리), 또는 "기본 공동으로 잡고 예외만 바꾸기" 흐름으로 뒤집을지 — 사용자 결정 대기.
- 그룹 삭제·강퇴 확인 다이얼로그, 인원 추가 공유 시트, 비그룹장 시점 화면은 주석으로만 정의됨.
- 카카오 심볼은 Icons8 `kakaotalk` PNG(공식 심볼과 다름) — 실제 출시 전 공식 리소스로 교체. Icons8 무료 PNG는 서비스 내 출처 표기 필요.
- 다크 모드, Textarea, 파비콘 그래픽 없음.

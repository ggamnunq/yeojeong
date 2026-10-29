# 약관·개인정보 문서 게시 절차

정식 발행본은 `docs/legal/v1.0/`에 있고 웹은 `apps/web/src/features/legal/content/`의 사본을 보여 준다. 초안(`docs/legal/*.md`)과 내부 검토 메모(`docs/legal/v1.0/README.md`)는 공개 레포에 올리지 않는다(`.gitignore`).

## 게시 대상 (v1.0, 시행일 2026-10-30)

| 원문 (`docs/legal/v1.0/`) | 웹 사본 (`content/`) | 공개 주소 | 동의 |
|---|---|---|---|
| 서비스 이용약관.md | terms.md | `/terms`, `/consents/TOS` | `TOS` 1.0, `AGE14` 1.0(제7조) |
| 개인정보 수집·이용 동의서.md | consent-collection.md | `/consents/PRIVACY` | `PRIVACY` 1.0 |
| 개인정보처리방침.md | privacy.md | `/privacy` | 고지 |
| 개인정보 처리위탁 고지.md | processors.md | `/privacy/processors` | 고지 |
| 오픈소스 및 라이선스 고지.md | licenses.md | `/oss`(예전 `/licenses`는 리다이렉트) | 고지 |
| consents.md | — (개발용, 게시 안 함) | — | 동의 ID·버전·해시 표 |

## 게시 범위

v1.0은 지금 제공하는 기능(카카오 로그인, 여정·그룹, 수동 결제 입력, 지갑, 정산, 환율, 탈퇴)만 다룬다. 아래 기능을 운영에 켜려면 먼저 약관·처리방침을 개정해 게시하고, 필요하면 동의서를 새로 발행한다(약관 제10조④).

| 기능 | 운영 상태(개정 전) | 웹의 동의 전문 링크 |
|---|---|---|
| 카드 내역 불러오기(`CARD_IMPORT`) | `FEATURE_CARD_IMPORT`는 `off` 또는 `allowlist`(운영자 본인)만 | `/consents/CARD_IMPORT` → "준비 중" 안내 |
| 토스 계좌 연동(`FIN_LINK`·`FIN_PRIVACY`·`THIRD_PARTY`) | `FEATURE_ACCOUNT_LINK=false` | `/terms/fin-link`·`/consents/FIN_*`·`/consents/THIRD_PARTY` → "준비 중" 안내 |
| 마케팅 수신(`MARKETING`) | 숨김 | `/consents/MARKETING` → "준비 중" 안내 |

이 동의들의 `consent_documents`는 초안(`0.1-draft`)만 있다.

## 원문을 고쳤을 때

```bash
# 작성한 사본을 레포 원문으로 가져오며 동기화(시행일 채움 · 웹 사본 · consents.md 해시 칸)
pnpm --filter @yeojeong/web legal:sync -- --from <작성 폴더>
# 레포 원문만 고쳤으면
pnpm --filter @yeojeong/web legal:sync
# 최신인지 확인만
pnpm --filter @yeojeong/web legal:sync -- --check
```

- 시행일은 `apps/web/scripts/sync-legal.mjs`의 `EFFECTIVE_DATE`. 개정판은 새 폴더(`v1.1` 등)와 `VERSION_DIR`을 함께 바꾼다.
- 동의 문서(TOS·PRIVACY·AGE14)의 본문이 바뀌면 해시가 바뀐다. **게시본 해시 = 동의 기록의 `doc_hash`**이므로 이미 시행한 버전의 본문을 고치지 말고 새 버전 행을 마이그레이션으로 추가한다(`version` 1.1 = MINOR 고지만, 2.0 = MAJOR 재동의, 시행일은 `effective_at`). `apps/api/src/common/auth/consent-catalog.spec.ts`가 게시본 파일 해시와 마이그레이션 값을 대조한다.
- 개정을 알릴 때는 공지 목록(`apps/api/src/notices/notices.ts`)에 새 id로 공지를 더한다. 약관 제3조③: 시행 7일 전(불리·중대 변경은 30일 전)부터 게시.
- 오픈소스 고지는 운영 빌드에 실제로 들어가는 패키지 기준이다. 의존성이 바뀌면 웹을 빌드해 번들 모듈 목록(rolldown `generateBundle`의 `chunk.modules`)과 각 패키지 `LICENSE`의 저작권 줄로 다시 맞춘다(`pnpm --filter @yeojeong/web licenses list --prod`는 참고용 — 번들에 안 들어가는 패키지도 나온다).

// 이 파일은 apps/web/scripts/sync-legal.mjs가 만든다 — 손으로 고치지 않는다(pnpm --filter @yeojeong/web legal:sync).
// 원본: docs/legal/releases.json(게시일) · docs/legal/v<판>/(게시본, 머리 줄의 버전·시행일) · consents.md 1절 표(동의 버전·재동의 필요).

/** 판(폴더)과 게시일(KST 날짜). 문서의 {{게시일}}·{{게시일+N}}을 이 값으로 채웠다 */
export const LEGAL_RELEASES = [
  {
    "dir": "v0.1",
    "published": "2026-10-30"
  },
  {
    "dir": "v0.2",
    "published": "2026-10-30"
  }
] as const

/** 공개 문서 한 판. 시행 시각 = effectiveDate 00:00 KST */
export interface LegalDocumentVersion {
  version: string
  effectiveDate: string
  /** 웹 content/ 아래 경로 */
  path: string
  /** 게시본(채운 웹 사본) SHA-256 */
  sha256: string
}

/** 웹 content 파일 → 판들(오래된 것부터). 판 폴더에 없는 문서는 이전 판이 현행이다 */
export const LEGAL_DOCUMENT_VERSIONS: Readonly<Record<string, readonly LegalDocumentVersion[]>> = {
  "terms.md": [
    {
      "version": "0.1",
      "effectiveDate": "2026-10-30",
      "path": "v0.1/terms.md",
      "sha256": "85fba61427bc5b15d241aea542fb7ea5159a611548dbd49ec54c821d2ae90142"
    },
    {
      "version": "0.2",
      "effectiveDate": "2026-11-06",
      "path": "v0.2/terms.md",
      "sha256": "3f95a26a9ae9118775f3433b8b8f55bcf22ac16356373279c03a8a0942c9847e"
    }
  ],
  "privacy.md": [
    {
      "version": "0.1",
      "effectiveDate": "2026-10-30",
      "path": "v0.1/privacy.md",
      "sha256": "eff7d2c6c7cf40f368665d2ca7e4915bd46a9caa7ee534ff968cb6d07fddb125"
    },
    {
      "version": "0.2",
      "effectiveDate": "2026-10-30",
      "path": "v0.2/privacy.md",
      "sha256": "710f594c686b772b965d1d631e072c5a251cae35b3d74b72bd8997d56f84387c"
    }
  ],
  "consent-collection.md": [
    {
      "version": "0.1",
      "effectiveDate": "2026-10-30",
      "path": "v0.1/consent-collection.md",
      "sha256": "a7c0412b377ca2977bd15c8d4c626f0076646143df183ab7b18d700210028a72"
    },
    {
      "version": "0.2",
      "effectiveDate": "2026-10-30",
      "path": "v0.2/consent-collection.md",
      "sha256": "633801d93fa52512209d963b8da2fb2bed0489ac04e9fd98d1918d9bbef85c7e"
    }
  ],
  "processors.md": [
    {
      "version": "0.1",
      "effectiveDate": "2026-10-30",
      "path": "v0.1/processors.md",
      "sha256": "e4506a565614ea7c9326494222b3546790d8be8f28a5397981585f2dd518df87"
    },
    {
      "version": "0.2",
      "effectiveDate": "2026-10-30",
      "path": "v0.2/processors.md",
      "sha256": "8cb4566072f0760c3fd7a698ca28d5cb0e03c40c021ab8dfceda3b99e73d49a4"
    }
  ],
  "licenses.md": [
    {
      "version": "0.1",
      "effectiveDate": "2026-10-30",
      "path": "v0.1/licenses.md",
      "sha256": "52d910a4fd47a0e56fc861573bf59ec8f6d6ad90b064a8f92cee9feefd49fac3"
    }
  ],
  "consent-card-import.md": [
    {
      "version": "0.1",
      "effectiveDate": "2026-10-30",
      "path": "v0.2/consent-card-import.md",
      "sha256": "ba84ffe7075b1d1f4784e2b1ebdb632c45225d6db1a37afb53f4e783f40505e2"
    }
  ]
}

/** 0.x 동의 문서 행(apps/api consent_documents, 마이그레이션 20261030020000_consent_documents_v0_x과 같은 값) */
export interface LegalConsentRelease {
  consentId: 'TOS' | 'PRIVACY' | 'AGE14' | 'CARD_IMPORT'
  version: string
  title: string
  required: boolean
  docPath: string
  docHash: string
  effectiveDate: string
  /** true면 이 버전 시행부터 이전 버전 동의로는 부족하다(재동의) */
  reconsentRequired: boolean
  /** 같은 문서의 구 표기(예: 0.1 = 구 1.0). 그 표기로 받은 동의를 이 버전 동의로 본다 */
  replacesVersion: string | null
  summary: string
}

export const LEGAL_CONSENT_RELEASES: readonly LegalConsentRelease[] = [
  {
    "consentId": "TOS",
    "version": "0.1",
    "title": "서비스 이용약관",
    "required": true,
    "docPath": "docs/legal/v0.1/서비스 이용약관.md",
    "docHash": "85fba61427bc5b15d241aea542fb7ea5159a611548dbd49ec54c821d2ae90142",
    "effectiveDate": "2026-10-30",
    "reconsentRequired": true,
    "replacesVersion": "1.0",
    "summary": "정식 약관 0.1(구 표기 1.0) 시행 — 수동 결제·지갑·공동 결제 공개 범위 반영, 연동·카드 불러오기·마케팅 제외"
  },
  {
    "consentId": "PRIVACY",
    "version": "0.1",
    "title": "개인정보 수집·이용",
    "required": true,
    "docPath": "docs/legal/v0.1/개인정보 수집·이용 동의서.md",
    "docHash": "a7c0412b377ca2977bd15c8d4c626f0076646143df183ab7b18d700210028a72",
    "effectiveDate": "2026-10-30",
    "reconsentRequired": true,
    "replacesVersion": "1.0",
    "summary": "정식 약관 0.1(구 표기 1.0) 시행 — 수동 결제·지갑·공동 결제 공개 범위 반영, 연동·카드 불러오기·마케팅 제외"
  },
  {
    "consentId": "AGE14",
    "version": "0.1",
    "title": "만 14세 이상입니다",
    "required": true,
    "docPath": "docs/legal/v0.1/서비스 이용약관.md",
    "docHash": "85fba61427bc5b15d241aea542fb7ea5159a611548dbd49ec54c821d2ae90142",
    "effectiveDate": "2026-10-30",
    "reconsentRequired": true,
    "replacesVersion": "1.0",
    "summary": "정식 약관 0.1(구 표기 1.0) 시행 — 수동 결제·지갑·공동 결제 공개 범위 반영, 연동·카드 불러오기·마케팅 제외"
  },
  {
    "consentId": "TOS",
    "version": "0.2",
    "title": "서비스 이용약관",
    "required": true,
    "docPath": "docs/legal/v0.2/서비스 이용약관.md",
    "docHash": "3f95a26a9ae9118775f3433b8b8f55bcf22ac16356373279c03a8a0942c9847e",
    "effectiveDate": "2026-11-06",
    "reconsentRequired": false,
    "replacesVersion": null,
    "summary": "약관 0.2 — 사실 정정, 카드 승인내역 불러오기 반영"
  },
  {
    "consentId": "PRIVACY",
    "version": "0.2",
    "title": "개인정보 수집·이용",
    "required": true,
    "docPath": "docs/legal/v0.2/개인정보 수집·이용 동의서.md",
    "docHash": "633801d93fa52512209d963b8da2fb2bed0489ac04e9fd98d1918d9bbef85c7e",
    "effectiveDate": "2026-10-30",
    "reconsentRequired": false,
    "replacesVersion": null,
    "summary": "약관 0.2 — 사실 정정, 카드 승인내역 불러오기 반영"
  },
  {
    "consentId": "CARD_IMPORT",
    "version": "0.1",
    "title": "카드 승인내역 불러오기",
    "required": true,
    "docPath": "docs/legal/v0.2/카드 내역 조회 동의서.md",
    "docHash": "ba84ffe7075b1d1f4784e2b1ebdb632c45225d6db1a37afb53f4e783f40505e2",
    "effectiveDate": "2026-10-30",
    "reconsentRequired": true,
    "replacesVersion": null,
    "summary": "약관 0.2 — 사실 정정, 카드 승인내역 불러오기 반영"
  }
]

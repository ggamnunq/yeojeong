interface ImportMetaEnv {
  /** "1"이면 개발 서버에서 MSW 목 API를 켠다(운영 빌드에서는 무시) */
  readonly VITE_MOCK_API?: string
  /**
   * CODEF 공개키(DER) SHA-256 hex(비밀 아님, 배포 워크플로가 GitHub 변수 CODEF_PUBKEY_SHA256으로 넣는다).
   * 있으면 서버가 내려준 공개키 지문과 비교해 다르면 암호화를 거부한다. 운영 빌드에서 비어 있으면 카드 불러오기 진입을 막는다
   */
  readonly VITE_CODEF_PUBKEY_SHA256?: string
}

/** apps/web package.json version(vite.config.ts define). src/app/version.ts로만 읽는다 */
declare const __APP_VERSION__: string

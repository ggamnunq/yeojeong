/** 앱 버전(apps/web package.json version — 빌드 때 vite define으로 넣는다). 마이페이지 푸터 "베타 v0.1.0" */
export const APP_VERSION: string = __APP_VERSION__

/** 마이페이지 푸터 한 줄(정식 출시 전까지 "베타") */
export const appVersionLabel = (version = APP_VERSION) => `베타 v${version}`

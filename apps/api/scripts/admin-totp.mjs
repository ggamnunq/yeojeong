#!/usr/bin/env node
// 관리자 2단계 인증(TOTP) 시크릿 만들기: pnpm --silent --filter @yeojeong/api admin:totp [계정 이름]
// 표준출력에는 ADMIN_TOTP_SECRET 값(base32 32자 = 160비트)만 쓴다 — 그대로 gcloud에 파이프로 넘긴다.
// 인증 앱 등록용 otpauth:// URI는 표준에러(터미널)로만 보낸다. 둘 다 시크릿이므로 파일·채팅·스크린샷에 남기지 않는다.
// 해시·검증 함수는 서버와 같은 src/admin/totp.ts(Node 타입 제거로 바로 실행).
import { generateTotpSecret, otpauthUri } from '../src/admin/totp.ts';

const account = (process.argv[2] ?? 'admin').slice(0, 64);
const secret = generateTotpSecret();
process.stderr.write(
  [
    '',
    '인증 앱(Google Authenticator·1Password 등)에 아래 URI를 등록하세요(QR이 필요하면 신뢰할 수 있는 로컬 도구로 만드세요).',
    otpauthUri(secret, account),
    '',
    '',
  ].join('\n'),
);
process.stdout.write(`${secret}\n`);

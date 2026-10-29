#!/usr/bin/env node
// 관리자 비밀번호 해시 만들기: pnpm --filter @yeojeong/api admin:hash
// 표준입력에서 비밀번호를 화면에 보이지 않게(echo 없이) 두 번 읽고, ADMIN_PASSWORD_HASH 값(scrypt$…)만 표준출력에 쓴다.
// 안내 문구는 표준에러로만 나간다. 비밀번호는 파일·로그·셸 기록에 남지 않는다(인자로 받지 않는다).
// 파이프로 줄 때(예: CI)는 첫 줄만 읽고 확인을 건너뛴다. 해시 함수는 서버와 같은 src/admin/password-hash.ts(Node 타입 제거로 바로 실행).
import { hashPassword } from '../src/admin/password-hash.ts';

const MIN_LENGTH = 12;
const MAX_LENGTH = 256;

function readHidden(prompt) {
  return new Promise((resolve, reject) => {
    const input = process.stdin;
    process.stderr.write(prompt);
    input.setRawMode(true);
    input.resume();
    input.setEncoding('utf8');
    let value = '';
    const done = (fn) => {
      input.setRawMode(false);
      input.pause();
      input.off('data', onData);
      process.stderr.write('\n');
      fn();
    };
    const onData = (chunk) => {
      for (const ch of chunk) {
        if (ch === '\r' || ch === '\n' || ch === '\u0004') return done(() => resolve(value));
        if (ch === '\u0003') return done(() => reject(new Error('취소했습니다')));
        if (ch === '\u007f' || ch === '\b') value = value.slice(0, -1);
        else if (ch >= ' ') value += ch;
      }
    };
    input.on('data', onData);
  });
}

async function readPiped() {
  let data = '';
  process.stdin.setEncoding('utf8');
  for await (const chunk of process.stdin) data += chunk;
  return data.split(/\r?\n/)[0] ?? '';
}

async function main() {
  let password;
  if (process.stdin.isTTY) {
    password = await readHidden('관리자 비밀번호: ');
    const again = await readHidden('한 번 더: ');
    if (password !== again) throw new Error('두 번 입력한 비밀번호가 다릅니다');
  } else {
    password = await readPiped();
  }
  if (password.length < MIN_LENGTH || password.length > MAX_LENGTH) {
    throw new Error(`비밀번호는 ${MIN_LENGTH}~${MAX_LENGTH}자여야 합니다`);
  }
  process.stdout.write(`${await hashPassword(password)}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});

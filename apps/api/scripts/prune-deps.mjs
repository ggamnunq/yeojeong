// Docker 빌드 전용: pnpm deploy 결과물에서 실행할 때 쓰지 않는 패키지를 지운다.
// @prisma/client가 선택적 peer로 prisma CLI와 typescript를 끌고 오기 때문에 필요하다.
import { existsSync, readFileSync, readdirSync, realpathSync, rmSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';

const root = process.argv[2];
const store = join(root, 'node_modules', '.pnpm');
const visited = new Set();

function visit(pkgDir, nodeModulesDir) {
  const real = realpathSync(pkgDir);
  if (visited.has(real)) return;
  visited.add(real);

  const pkg = JSON.parse(readFileSync(join(real, 'package.json'), 'utf8'));
  const optionalPeers = pkg.peerDependenciesMeta ?? {};
  const deps = [
    ...Object.keys(pkg.dependencies ?? {}),
    ...Object.keys(pkg.optionalDependencies ?? {}),
    ...Object.keys(pkg.peerDependencies ?? {}).filter((name) => !optionalPeers[name]?.optional),
  ];

  // pnpm은 패키지의 의존성을 패키지와 같은 node_modules 폴더에 형제로 링크한다
  const siblings = nodeModulesDir ?? (pkg.name.startsWith('@') ? dirname(dirname(real)) : dirname(real));
  for (const name of deps) {
    const dep = join(siblings, name);
    if (existsSync(dep)) visit(dep);
  }
}

visit(root, join(root, 'node_modules'));

const used = new Set(
  [...visited].filter((p) => p.startsWith(store + sep)).map((p) => relative(store, p).split(sep)[0]),
);
let removed = 0;
for (const entry of readdirSync(store)) {
  if (entry === 'node_modules' || entry.endsWith('.yaml') || used.has(entry)) continue;
  rmSync(join(store, entry), { recursive: true, force: true });
  removed++;
}
console.log(`prune-deps: kept ${used.size}, removed ${removed}`);

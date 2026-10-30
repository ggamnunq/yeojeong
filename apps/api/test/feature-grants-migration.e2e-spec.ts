import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { PrismaClient } from './../src/generated/prisma/client.js';
import {
  createFixturePrisma,
  reachableDatabaseUrl,
} from './expenses-fixtures.js';

// 마이그레이션 20261030100000_create_feature_grants의 복사 문장(card_import_grants → feature_grants CARD_IMPORT)을
// 실제 DB에서 그대로 다시 돌려 본다(마이그레이션 파일에서 읽는다 — 문장을 고치면 이 테스트도 같이 본다).
// 증명: 옛 행의 사용자·부여 시각·부여자·메모가 그대로 옮겨진다 · 이미 있는 CARD_IMPORT 행은 덮어쓰지 않는다 · 다시 돌려도 안전하다
const databaseUrl = await reachableDatabaseUrl();

const MIGRATION = fileURLToPath(
  new URL(
    '../prisma/migrations/20261030100000_create_feature_grants/migration.sql',
    import.meta.url,
  ),
);

/** "-- CopyCardImportGrants" 주석 다음 문장(세미콜론까지) */
function copyStatement(): string {
  const sql = readFileSync(MIGRATION, 'utf8');
  const start = sql.indexOf('-- CopyCardImportGrants');
  if (start < 0) throw new Error('복사 문장을 찾지 못했다');
  const body = sql.slice(sql.indexOf('\n', start) + 1);
  return body.slice(0, body.indexOf(';') + 1);
}

describe.skipIf(!databaseUrl)(
  'feature_grants migration copy (e2e, real DB)',
  () => {
    let prisma: PrismaClient;
    const userIds: string[] = [];

    beforeAll(() => {
      prisma = createFixturePrisma(databaseUrl as string);
    });

    afterAll(async () => {
      await prisma.featureGrant.deleteMany({
        where: { userId: { in: userIds } },
      });
      await prisma.cardImportGrant.deleteMany({
        where: { userId: { in: userIds } },
      });
      await prisma.user.deleteMany({ where: { id: { in: userIds } } });
      await prisma.$disconnect();
    });

    async function createUser(nickname: string) {
      const user = await prisma.user.create({
        data: { kakaoId: `test-${randomUUID()}`, nickname },
      });
      userIds.push(user.id);
      return user.id;
    }

    it('copies legacy card_import_grants rows as CARD_IMPORT grants, keeps existing ones, and is idempotent', async () => {
      const statement = copyStatement();
      expect(statement).toMatch(/^INSERT INTO "feature_grants"/);
      expect(statement).toMatch(/ON CONFLICT .* DO NOTHING;$/);

      const actor = randomUUID();
      const legacy = await createUser('옛권한');
      const already = await createUser('이미있음');
      const grantedAt = new Date('2026-10-30T01:02:03.000Z');
      await prisma.cardImportGrant.create({
        data: { userId: legacy, grantedBy: actor, note: '옛 메모', grantedAt },
      });
      await prisma.cardImportGrant.create({
        data: { userId: already, grantedBy: actor, note: '옛 메모' },
      });
      // 이미 새 표에 있는 권한(복사 전에 새 화면에서 준 경우)은 그대로 둔다
      await prisma.featureGrant.create({
        data: {
          userId: already,
          feature: 'CARD_IMPORT',
          grantedBy: actor,
          note: '새 메모',
        },
      });

      await prisma.$executeRawUnsafe(statement);
      // 다시 돌려도 바뀌지 않는다
      await prisma.$executeRawUnsafe(statement);

      const rows = await prisma.featureGrant.findMany({
        where: { userId: { in: [legacy, already] } },
        select: {
          userId: true,
          feature: true,
          grantedAt: true,
          grantedBy: true,
          note: true,
        },
        orderBy: { note: 'asc' },
      });
      expect(rows).toHaveLength(2);
      expect(rows.find((r) => r.userId === legacy)).toEqual({
        userId: legacy,
        feature: 'CARD_IMPORT',
        grantedAt,
        grantedBy: actor,
        note: '옛 메모',
      });
      expect(rows.find((r) => r.userId === already)?.note).toBe('새 메모');
      // 옛 표는 지우지 않는다(옛 리비전이 아직 돌 수 있다)
      expect(
        await prisma.cardImportGrant.count({
          where: { userId: { in: [legacy, already] } },
        }),
      ).toBe(2);
    });
  },
);

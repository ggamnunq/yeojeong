import 'dotenv/config';
import { defineConfig } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    // Prisma CLI(migrate, studio 등)가 쓰는 연결. 런타임(PrismaService)은 항상 DATABASE_URL을 쓴다.
    // 운영 Supabase는 트랜잭션 풀러(6543)라 마이그레이션을 못 하므로 세션 풀러(5432)를 DIRECT_URL로 준다.
    // 로컬은 DATABASE_URL 하나로 충분하다. 빈 문자열도 미설정으로 본다.
    url: process.env['DIRECT_URL'] || process.env['DATABASE_URL'],
  },
});

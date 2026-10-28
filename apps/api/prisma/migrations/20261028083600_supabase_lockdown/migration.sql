-- Supabase 권한 잠금 (Data API를 꺼 둔 데 더한 2중 방어)
--
-- Supabase는 public 스키마에 anon·authenticated 역할의 USAGE와, 앞으로 만들 테이블·시퀀스·함수의
-- 기본 권한(default privileges)을 열어 둔다. 여정은 Data API(PostgREST)를 쓰지 않고 API 서버(postgres 역할)로만
-- DB에 접근하므로 이 두 역할에게서 public 스키마 권한을 모두 거둔다.
--
-- - anon 역할이 없는 DB(로컬 Docker, shadow DB)에서는 아무것도 하지 않는다.
-- - auth·storage·graphql_public 등 Supabase 내부 스키마와 역할 자체는 건드리지 않는다.
-- - service_role은 건드리지 않는다.
-- - 기본 권한은 postgres 역할 기준으로만 바꾼다(마이그레이션과 앱이 이 역할로 객체를 만든다).
--   supabase_admin의 기본 권한도 anon·authenticated에 열려 있지만, postgres는 그 역할의 멤버가 아니라 바꿀 수 없다.
--   대신 아래에서 스키마 USAGE를 막아 두었으므로 그 역할이 만든 객체가 생겨도 anon·authenticated는 닿지 못한다.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon')
     OR NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    RAISE NOTICE 'anon/authenticated 역할이 없어 Supabase 권한 잠금을 건너뜀';
    RETURN;
  END IF;

  -- 이미 있는 객체(_prisma_migrations 포함)
  REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated;
  REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated;
  REVOKE ALL ON ALL ROUTINES IN SCHEMA public FROM anon, authenticated;

  -- 스키마 자체. PUBLIC(모든 역할)에도 USAGE가 열려 있어서 anon·authenticated가 그걸로 들어올 수 있으므로 같이 닫는다.
  -- postgres는 DB 소유자(pg_database_owner)이자 명시적 USAGE가 있고, service_role도 명시적 USAGE가 있어 영향이 없다.
  REVOKE ALL ON SCHEMA public FROM anon, authenticated;
  REVOKE USAGE ON SCHEMA public FROM PUBLIC;

  -- 앞으로 postgres 역할이 public 스키마에 만들 객체
  ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
    REVOKE ALL ON TABLES FROM anon, authenticated;
  ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
    REVOKE ALL ON SEQUENCES FROM anon, authenticated;
  ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
    REVOKE ALL ON ROUTINES FROM anon, authenticated;
END
$$;

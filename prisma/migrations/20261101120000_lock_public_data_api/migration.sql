-- The app reaches PostgreSQL only through its own server connection (Prisma). Better Auth sessions are not
-- Supabase Auth sessions, so nothing may be reachable through Supabase's public Data API (PostgREST).
-- Row Level Security is enabled without policies (deny by default for anon / authenticated) and the
-- Data API roles lose their table privileges. The owning role bypasses RLS, so the app is unaffected.
-- Any table added later must repeat this (see test/integration/data-api-lock.test.ts).

DO $$
DECLARE
  t record;
BEGIN
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t.tablename);
  END LOOP;

  -- These roles exist on Supabase only.
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;
    REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon;
    REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON ALL TABLES IN SCHEMA public FROM authenticated;
    REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM authenticated;
    REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM authenticated;
  END IF;
END
$$;

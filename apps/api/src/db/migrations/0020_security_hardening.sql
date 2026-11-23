-- Security hardening from the security audit.
-- 1. Supabase's rls_auto_enable() helper is SECURITY DEFINER and was callable by anyone over the public REST API
--    (/rest/v1/rpc/rls_auto_enable). Nobody but the platform needs it. Owned by the platform role, so a failure here is not fatal.
DO $$
BEGIN
  IF to_regprocedure('public.rls_auto_enable()') IS NOT NULL THEN
    EXECUTE 'REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM PUBLIC, anon, authenticated';
  END IF;
EXCEPTION WHEN insufficient_privilege THEN
  RAISE NOTICE 'rls_auto_enable() belongs to another role; revoke its public execute rights in the Supabase SQL editor instead';
END $$;

-- 2. Our own helper functions pin their search_path so a look-alike object in another schema can never be picked up.
DO $$
BEGIN
  IF to_regprocedure('public.app_user_id()') IS NOT NULL THEN
    EXECUTE 'ALTER FUNCTION public.app_user_id() SET search_path = pg_catalog, public';
  END IF;
  IF to_regprocedure('public.admin_audit_immutable()') IS NOT NULL THEN
    EXECUTE 'ALTER FUNCTION public.admin_audit_immutable() SET search_path = pg_catalog, public';
  END IF;
EXCEPTION WHEN insufficient_privilege THEN
  RAISE NOTICE 'could not pin search_path on a helper function (not the owner)';
END $$;

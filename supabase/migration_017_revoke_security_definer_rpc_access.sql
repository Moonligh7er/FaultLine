-- ============================================================
-- Migration 017: Revoke EXECUTE on SECURITY DEFINER trigger
-- functions from anon + authenticated
-- ============================================================
-- After Supabase relocated the PostGIS extension out of public
-- (resolving DEFERRED #9h), the security advisor surfaced two
-- previously-quiet lints flagging SECURITY DEFINER functions
-- callable as anon/authenticated via PostgREST RPC.
--
-- Both functions are trigger handlers, not RPCs:
--   • handle_new_user()   — fires on auth.users INSERT to seed
--                            user_profiles / award_points
--   • rls_auto_enable()   — Supabase-managed event trigger that
--                            auto-enables RLS on new public tables
--
-- Removing direct anon/authenticated EXECUTE access closes the
-- /rest/v1/rpc/<name> path; trigger invocations still run because
-- those execute in the trigger's owner context (postgres),
-- unaffected by REVOKE on other roles.
-- ============================================================

REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM anon, authenticated, public;

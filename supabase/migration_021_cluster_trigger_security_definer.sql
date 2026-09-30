-- ============================================================
-- Migration 021: Run the auto-cluster trigger as its owner
-- ============================================================
-- Every client INSERT into `reports` (anon or authenticated) was
-- failing with:
--   new row violates row-level security policy for table "report_clusters"
--
-- Cause: trigger_auto_cluster → auto_cluster_on_insert() →
-- assign_report_to_cluster() writes to report_clusters,
-- cluster_reports, and reports. None of those functions were
-- SECURITY DEFINER, so the writes ran as the inserting client
-- role, and those tables only grant SELECT via RLS. The failing
-- trigger rolled back the whole report insert.
--
-- Fix: make the trigger handler SECURITY DEFINER. It runs as its
-- owner (postgres, BYPASSRLS), so the nested
-- assign_report_to_cluster() call also runs as postgres. Clients
-- still can't write to the cluster tables directly — RLS on those
-- tables is unchanged.
--
-- Following migration 017's convention, revoke direct EXECUTE on
-- the SECURITY DEFINER trigger handler so it isn't exposed at
-- /rest/v1/rpc. Trigger invocation is unaffected.
-- ============================================================

ALTER FUNCTION public.auto_cluster_on_insert() SECURITY DEFINER;
ALTER FUNCTION public.auto_cluster_on_insert() SET search_path = public, extensions;

REVOKE EXECUTE ON FUNCTION public.auto_cluster_on_insert() FROM anon, authenticated, public;

-- ------------------------------------------------------------
-- Verification (run after applying; each should return true)
-- ------------------------------------------------------------
-- SELECT prosecdef FROM pg_proc WHERE proname = 'auto_cluster_on_insert';
-- SELECT NOT has_function_privilege('anon', 'public.auto_cluster_on_insert()', 'execute');

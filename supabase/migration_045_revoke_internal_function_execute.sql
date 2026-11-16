-- Migration 045: trigger functions and internal guards are never called through the API.
REVOKE EXECUTE ON FUNCTION public.sync_vote_counts() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.assert_city_member(uuid, boolean) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.guard_report_write() FROM PUBLIC, anon, authenticated;

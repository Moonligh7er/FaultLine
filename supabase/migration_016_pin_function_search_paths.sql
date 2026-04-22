-- ============================================================
-- Migration 016: Pin search_path on all custom functions
-- ============================================================
-- Mitigates the Supabase advisor's `function_search_path_mutable`
-- warning on 16 public functions. Without an explicit search_path,
-- a caller who has CREATE privilege on any schema earlier in the
-- resolution order could shadow functions the SQL references (e.g.
-- ST_Contains from PostGIS), causing the function to execute a
-- hijacked version.
--
-- Pinning to `public, extensions` makes resolution deterministic.
-- No behavioral change for normal callers.
-- ============================================================

ALTER FUNCTION public.set_cluster_point()                                                 SET search_path = public, extensions;
ALTER FUNCTION public.set_report_point()                                                  SET search_path = public, extensions;
ALTER FUNCTION public.increment_upvote(report_id uuid)                                    SET search_path = public, extensions;
ALTER FUNCTION public.increment_confirm(report_id uuid)                                   SET search_path = public, extensions;
ALTER FUNCTION public.get_nearby_reports(lat double precision, lng double precision, radius_km double precision) SET search_path = public, extensions;
ALTER FUNCTION public.handle_new_user()                                                   SET search_path = public, extensions;
ALTER FUNCTION public.reject_honeypot()                                                   SET search_path = public, extensions;
ALTER FUNCTION public.enforce_report_rate_limit()                                         SET search_path = public, extensions;
ALTER FUNCTION public.get_nearby_clusters(lat double precision, lng double precision, radius_km double precision) SET search_path = public, extensions;
ALTER FUNCTION public.auto_cluster_on_insert()                                            SET search_path = public, extensions;
ALTER FUNCTION public.cleanup_submission_log()                                            SET search_path = public, extensions;
ALTER FUNCTION public.assign_report_to_cluster(p_report_id uuid, p_cluster_radius_m double precision) SET search_path = public, extensions;
ALTER FUNCTION public.find_authority_by_point(lat double precision, lng double precision) SET search_path = public, extensions;
ALTER FUNCTION public.get_clusters_ready_for_escalation()                                 SET search_path = public, extensions;
ALTER FUNCTION public.award_points(p_user_id uuid, p_points integer)                      SET search_path = public, extensions;
ALTER FUNCTION public.escalate_cluster(p_cluster_id uuid, p_method text, p_recipient text, p_subject text, p_body text) SET search_path = public, extensions;
ALTER FUNCTION public.get_cluster_summary(p_cluster_id uuid)                              SET search_path = public, extensions;

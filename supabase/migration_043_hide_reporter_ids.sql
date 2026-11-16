-- Migration 043: reporter identity and notice details stay private
--
-- 1. reports.user_id (and the _hp honeypot field) can't be read through the
--    API by anyone: a public user_id let anyone group a person's reports and
--    track them by place and time. Ownership checks use owns_report() and
--    my_reports() (SECURITY DEFINER), which are unaffected.
-- 2. get_nearby_reports returns rows with user_id blanked, public reports
--    only, radius capped at 50 km.
-- 3. escalation_log is admin-only. The public notice record (when and how an
--    authority was told) comes from public_escalations(), without subject,
--    body or recipient: the subject carries the reply-matching reference.
-- Apply only after the web app and mobile app stop selecting reports.* /
-- user_id and reading escalation_log directly.

-- ── 1. Column grants on reports ─────────────────────────────────────────────
DO $$
DECLARE cols text;
BEGIN
  SELECT string_agg(quote_ident(column_name), ', ' ORDER BY ordinal_position) INTO cols
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'reports' AND column_name NOT IN ('user_id', '_hp');
  EXECUTE 'REVOKE SELECT ON public.reports FROM anon, authenticated';
  EXECUTE format('GRANT SELECT (%s) ON public.reports TO anon, authenticated', cols);
END $$;

-- ── 2. Nearby reports ───────────────────────────────────────────────────────
DO $$
DECLARE cols text;
BEGIN
  SELECT string_agg(CASE WHEN column_name IN ('user_id', '_hp') THEN format('NULL::%s AS %I', data_type, column_name)
                         ELSE format('r.%I', column_name) END, ', ' ORDER BY ordinal_position) INTO cols
  FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'reports';
  EXECUTE format($f$
    CREATE OR REPLACE FUNCTION public.get_nearby_reports(lat double precision, lng double precision, radius_km double precision DEFAULT 5)
    RETURNS SETOF public.reports LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $body$
      SELECT %s
      FROM public.reports r
      WHERE r.report_subject = 'public_infrastructure'
        AND extensions.ST_DWithin(r.location_point,
              extensions.ST_SetSRID(extensions.ST_MakePoint(lng, lat), 4326)::extensions.geography,
              least(greatest(coalesce(radius_km, 5), 0), 50) * 1000)
      ORDER BY r.created_at DESC
      LIMIT 100
    $body$;$f$, cols);
END $$;

-- ── 3. Notice record ────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Escalation log viewable by everyone" ON public.escalation_log;
DROP POLICY IF EXISTS "Escalation log viewable by admins" ON public.escalation_log;
CREATE POLICY "Escalation log viewable by admins" ON public.escalation_log FOR SELECT TO authenticated USING (public.is_admin());
REVOKE SELECT ON public.escalation_log FROM anon;

CREATE OR REPLACE FUNCTION public.public_escalations(
  p_cluster_id uuid DEFAULT NULL, p_authority_id uuid DEFAULT NULL, p_since timestamptz DEFAULT NULL,
  p_limit integer DEFAULT 100, p_offset integer DEFAULT 0)
RETURNS TABLE (id uuid, cluster_id uuid, authority_id uuid, method text, status text, sent_at timestamptz,
               delivered_at timestamptz, external_ticket_id text, external_status text,
               last_status_check_at timestamptz, bounced_at timestamptz, bounce_type text, created_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT e.id, e.cluster_id, e.authority_id, e.method, e.status, e.sent_at, e.delivered_at, e.external_ticket_id,
         e.external_status, e.last_status_check_at, e.bounced_at, e.bounce_type, e.created_at
  FROM public.escalation_log e
  WHERE (p_cluster_id IS NULL OR e.cluster_id = p_cluster_id)
    AND (p_authority_id IS NULL OR e.authority_id = p_authority_id)
    AND (p_since IS NULL OR e.sent_at >= p_since)
  ORDER BY e.sent_at DESC NULLS LAST
  LIMIT least(greatest(coalesce(p_limit, 100), 1), 500) OFFSET least(greatest(coalesce(p_offset, 0), 0), 10000);
$$;
GRANT EXECUTE ON FUNCTION public.public_escalations(uuid, uuid, timestamptz, integer, integer) TO anon, authenticated;

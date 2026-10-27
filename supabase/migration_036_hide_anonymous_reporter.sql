-- ============================================================
-- Migration 036: Anonymous reports don't expose the reporter's account
-- ============================================================
-- reports is publicly readable, and a signed-in user who ticked
-- "anonymous" still had their user_id stored on the row — anyone could
-- link the report to the account. Now:
--   * BEFORE INSERT/UPDATE: when is_anonymous, the account link moves to
--     the private report_owners table and reports.user_id is cleared.
--   * owns_report(id) answers "is this mine?" for the caller only (it
--     never reveals who owns a report), used by RLS and the vote guards.
--   * my_reports() returns the caller's own reports, anonymous included.
--   * Clustering counts distinct reporters including anonymous owners;
--     the per-user rate limit still counts anonymous reports.
-- Trigger is named zz_* so it runs after the other BEFORE INSERT triggers
-- (rate limit, honeypot) that still need NEW.user_id.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.report_owners (
  report_id UUID PRIMARY KEY
    REFERENCES public.reports(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED,
  user_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_report_owners_user_id ON public.report_owners (user_id);
ALTER TABLE public.report_owners ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.report_owners FROM anon, authenticated;

-- ── move the link on insert / when a report becomes anonymous ───────────
CREATE OR REPLACE FUNCTION public.hide_anonymous_owner()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.is_anonymous AND NEW.user_id IS NOT NULL THEN
    INSERT INTO public.report_owners (report_id, user_id)
    VALUES (NEW.id, NEW.user_id)
    ON CONFLICT (report_id) DO UPDATE SET user_id = EXCLUDED.user_id;
    NEW.user_id := NULL;
  ELSIF TG_OP = 'UPDATE' AND NOT NEW.is_anonymous AND OLD.is_anonymous AND NEW.user_id IS NULL THEN
    -- Owner made it public again: restore the visible link.
    DELETE FROM public.report_owners WHERE report_id = NEW.id RETURNING user_id INTO NEW.user_id;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.hide_anonymous_owner() FROM anon, authenticated, public;

DROP TRIGGER IF EXISTS zz_hide_anonymous_owner ON public.reports;
CREATE TRIGGER zz_hide_anonymous_owner
  BEFORE INSERT OR UPDATE OF is_anonymous, user_id ON public.reports
  FOR EACH ROW EXECUTE FUNCTION public.hide_anonymous_owner();

-- Backfill (0 rows at time of writing; safe if any exist).
INSERT INTO public.report_owners (report_id, user_id)
SELECT id, user_id FROM public.reports WHERE is_anonymous AND user_id IS NOT NULL
ON CONFLICT (report_id) DO NOTHING;
UPDATE public.reports SET user_id = NULL WHERE is_anonymous AND user_id IS NOT NULL;

-- ── ownership helpers ───────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.owns_report(p_report_id UUID)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT auth.uid() IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.reports r WHERE r.id = p_report_id AND r.user_id = auth.uid()
    UNION ALL
    SELECT 1 FROM public.report_owners o WHERE o.report_id = p_report_id AND o.user_id = auth.uid()
  );
$$;
REVOKE EXECUTE ON FUNCTION public.owns_report(UUID) FROM public;
GRANT EXECUTE ON FUNCTION public.owns_report(UUID) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.my_reports()
RETURNS SETOF public.reports
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT r.* FROM public.reports r
  WHERE auth.uid() IS NOT NULL AND (
    r.user_id = auth.uid()
    OR r.id IN (SELECT o.report_id FROM public.report_owners o WHERE o.user_id = auth.uid())
  )
  ORDER BY r.created_at DESC;
$$;
REVOKE EXECUTE ON FUNCTION public.my_reports() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.my_reports() TO authenticated;

-- ── owner policies work for anonymous reports too ───────────────────────
DROP POLICY IF EXISTS "Users can update own reports" ON public.reports;
CREATE POLICY "Users can update own reports" ON public.reports
  FOR UPDATE TO authenticated
  USING (public.owns_report(id))
  WITH CHECK (user_id IS NULL OR user_id = auth.uid());

DROP POLICY IF EXISTS "Users can delete own reports" ON public.reports;
CREATE POLICY "Users can delete own reports" ON public.reports
  FOR DELETE TO authenticated
  USING (public.owns_report(id));

-- ── vote guards: no voting on your own report, anonymous or not ─────────
CREATE OR REPLACE FUNCTION public.increment_upvote(report_id uuid)
RETURNS void
LANGUAGE plpgsql
SET search_path TO 'public', 'extensions'
AS $function$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  IF public.owns_report(report_id) THEN
    RAISE EXCEPTION 'Cannot upvote your own report';
  END IF;
  UPDATE reports SET upvote_count = upvote_count + 1, updated_at = NOW()
  WHERE id = report_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.increment_confirm(report_id uuid)
RETURNS void
LANGUAGE plpgsql
SET search_path TO 'public', 'extensions'
AS $function$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  IF public.owns_report(report_id) THEN
    RAISE EXCEPTION 'Cannot confirm your own report';
  END IF;
  UPDATE reports SET confirm_count = confirm_count + 1, updated_at = NOW()
  WHERE id = report_id;
END;
$function$;

-- ── rate limit counts anonymous reports too (needs report_owners) ───────
CREATE OR REPLACE FUNCTION public.enforce_report_rate_limit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  recent_count INTEGER;
BEGIN
  IF NEW.user_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT COUNT(*) INTO recent_count
  FROM reports r
  WHERE r.created_at > NOW() - INTERVAL '1 hour'
    AND (r.user_id = NEW.user_id
         OR r.id IN (SELECT o.report_id FROM report_owners o WHERE o.user_id = NEW.user_id));

  IF recent_count >= 10 THEN
    RAISE EXCEPTION 'Rate limit exceeded: maximum 10 reports per hour'
      USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$function$;
REVOKE EXECUTE ON FUNCTION public.enforce_report_rate_limit() FROM anon, authenticated, public;

-- ── clustering: distinct reporters include anonymous owners ─────────────
CREATE OR REPLACE FUNCTION public.assign_report_to_cluster(p_report_id uuid, p_cluster_radius_m double precision DEFAULT 50)
RETURNS uuid
LANGUAGE plpgsql
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_report RECORD;
  v_cluster RECORD;
  v_cluster_id UUID;
  v_unique_reporters INTEGER;
  v_max_hazard TEXT;
BEGIN
  SELECT * INTO v_report FROM reports WHERE id = p_report_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Report not found: %', p_report_id;
  END IF;

  SELECT rc.* INTO v_cluster
  FROM report_clusters rc
  WHERE rc.category = v_report.category
    AND rc.status NOT IN ('resolved', 'closed')
    AND ST_DWithin(
      rc.centroid_point,
      ST_SetSRID(ST_MakePoint(v_report.longitude, v_report.latitude), 4326)::geography,
      p_cluster_radius_m
    )
  ORDER BY ST_Distance(
    rc.centroid_point,
    ST_SetSRID(ST_MakePoint(v_report.longitude, v_report.latitude), 4326)::geography
  )
  LIMIT 1;

  IF v_cluster.id IS NOT NULL THEN
    v_cluster_id := v_cluster.id;

    INSERT INTO cluster_reports (cluster_id, report_id)
    VALUES (v_cluster_id, p_report_id)
    ON CONFLICT DO NOTHING;

    -- Unique reporters, counting anonymous reports by their private owner.
    SELECT COUNT(DISTINCT COALESCE(r.user_id, o.user_id)) INTO v_unique_reporters
    FROM cluster_reports cr
    JOIN reports r ON r.id = cr.report_id
    LEFT JOIN report_owners o ON o.report_id = r.id
    WHERE cr.cluster_id = v_cluster_id
      AND COALESCE(r.user_id, o.user_id) IS NOT NULL;

    SELECT r.hazard_level INTO v_max_hazard
    FROM cluster_reports cr
    JOIN reports r ON r.id = cr.report_id
    WHERE cr.cluster_id = v_cluster_id
    ORDER BY
      CASE r.hazard_level
        WHEN 'extremely_dangerous' THEN 5
        WHEN 'dangerous' THEN 4
        WHEN 'significant' THEN 3
        WHEN 'moderate' THEN 2
        WHEN 'minor' THEN 1
        ELSE 0
      END DESC
    LIMIT 1;

    UPDATE report_clusters
    SET report_count = report_count + 1,
        unique_reporters = COALESCE(v_unique_reporters, unique_reporters),
        max_hazard_level = COALESCE(v_max_hazard, max_hazard_level),
        last_reported_at = NOW(),
        updated_at = NOW(),
        status = CASE
          WHEN status = 'unconfirmed' AND COALESCE(v_unique_reporters, 0) >= 3 THEN 'confirmed'
          ELSE status
        END
    WHERE id = v_cluster_id;

  ELSE
    INSERT INTO report_clusters (
      category, centroid_latitude, centroid_longitude,
      max_hazard_level, authority_id, city, state, address
    ) VALUES (
      v_report.category, v_report.latitude, v_report.longitude,
      v_report.hazard_level, v_report.authority_id,
      v_report.city, v_report.state, v_report.address
    )
    RETURNING id INTO v_cluster_id;

    INSERT INTO cluster_reports (cluster_id, report_id)
    VALUES (v_cluster_id, p_report_id);
  END IF;

  UPDATE reports SET
    submission_reference = v_cluster_id::text,
    updated_at = NOW()
  WHERE id = p_report_id;

  RETURN v_cluster_id;
END;
$function$;

NOTIFY pgrst, 'reload schema';

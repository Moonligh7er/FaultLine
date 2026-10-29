-- Migration 038: city accounts (the paid city-side product)
--
-- A city account belongs to one authority. City staff sign in with their own
-- Supabase account and are linked through city_members. Access rules:
--   * the owner must accept the terms and make an explicit auto-renew choice
--     (no pre-selected default) before the dashboard opens;
--   * free while the pilot runs, or for as long as Fault Line has waived the fee;
--   * after the pilot: auto-renew on  -> annual invoice (net 30) at the price
--                                         locked at sign-up; unpaid past due -> suspended
--                      auto-renew off -> access ends; the city can subscribe any time.
-- Every notice (sign-up terms, renewal reminders, status changes) is logged in
-- city_account_events so there is a record of what each city was told and when.
-- Public data (reports, grades, backlog) never depends on payment.

-- ── Tables ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.city_accounts (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  authority_id           uuid NOT NULL UNIQUE REFERENCES public.authorities(id),
  slug                   text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9][a-z0-9-]{1,59}$'),
  display_name           text NOT NULL,
  tier                   text NOT NULL CHECK (tier IN ('town', 'city', 'regional', 'metro')),
  population             integer CHECK (population IS NULL OR population >= 0),
  status                 text NOT NULL DEFAULT 'pilot' CHECK (status IN ('pilot', 'active', 'suspended', 'ended')),
  pilot_ends_at          timestamptz,
  fee_waived             boolean NOT NULL DEFAULT false,
  fee_waiver_note        text,
  auto_renew             boolean,
  auto_renew_set_at      timestamptz,
  auto_renew_set_by      uuid,
  terms_version          text,
  terms_accepted_at      timestamptz,
  terms_accepted_by      uuid,
  -- Published price on the day the city signed up; Stripe prices are immutable,
  -- so the stored price id is the lock.
  locked_lookup_key      text,
  locked_price_id        text,
  locked_price_cents     integer,
  quoted_price_cents     integer,              -- metro: custom quote
  billing_email          text,
  po_number              text,
  stripe_customer_id     text UNIQUE,
  stripe_subscription_id text UNIQUE,
  current_period_end     timestamptz,
  suspended_at           timestamptz,
  suspended_reason       text,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.city_members (
  city_account_id uuid NOT NULL REFERENCES public.city_accounts(id) ON DELETE CASCADE,
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role            text NOT NULL DEFAULT 'staff' CHECK (role IN ('owner', 'staff')),
  created_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (city_account_id, user_id)
);
CREATE INDEX IF NOT EXISTS city_members_user_idx ON public.city_members(user_id);

-- Invites are claimed by signing in with the invited address (Supabase has
-- already verified it), so no invite token ever travels by email.
CREATE TABLE IF NOT EXISTS public.city_invites (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  city_account_id uuid NOT NULL REFERENCES public.city_accounts(id) ON DELETE CASCADE,
  email           text NOT NULL CHECK (email = lower(email)),
  role            text NOT NULL DEFAULT 'staff' CHECK (role IN ('owner', 'staff')),
  invited_by      text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  accepted_at     timestamptz,
  UNIQUE (city_account_id, email)
);

CREATE TABLE IF NOT EXISTS public.city_account_events (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  city_account_id uuid NOT NULL REFERENCES public.city_accounts(id) ON DELETE CASCADE,
  kind            text NOT NULL,
  dedupe_key      text,
  detail          jsonb NOT NULL DEFAULT '{}'::jsonb,
  actor           text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (city_account_id, dedupe_key)
);
CREATE INDEX IF NOT EXISTS city_account_events_city_idx ON public.city_account_events(city_account_id, created_at DESC);

-- Stripe webhook idempotency.
CREATE TABLE IF NOT EXISTS public.stripe_events (
  id          text PRIMARY KEY,
  type        text NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now()
);

-- Contractor attribution for the recurrence scorecard (entered by city staff).
ALTER TABLE public.report_clusters ADD COLUMN IF NOT EXISTS contractor_name text
  CHECK (contractor_name IS NULL OR length(contractor_name) BETWEEN 1 AND 120);

CREATE OR REPLACE FUNCTION public.touch_city_account() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END $$;
DROP TRIGGER IF EXISTS city_accounts_touch ON public.city_accounts;
CREATE TRIGGER city_accounts_touch BEFORE UPDATE ON public.city_accounts
  FOR EACH ROW EXECUTE FUNCTION public.touch_city_account();

-- ── Access helpers ──────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.city_role(p_city uuid) RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT role FROM public.city_members WHERE city_account_id = p_city AND user_id = auth.uid();
$$;

-- Paid features open? (Members only; public pages never call this.)
CREATE OR REPLACE FUNCTION public.city_access_open(p_city uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.city_accounts c
    WHERE c.id = p_city
      AND c.terms_accepted_at IS NOT NULL
      AND (c.fee_waived OR c.auto_renew IS NOT NULL)
      AND (
        c.fee_waived
        OR (c.status = 'pilot' AND c.pilot_ends_at > now())
        OR c.status = 'active'
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.assert_city_member(p_city uuid, p_need_open boolean DEFAULT true)
RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF public.is_admin() THEN RETURN; END IF;
  IF public.city_role(p_city) IS NULL THEN
    RAISE EXCEPTION 'not a member of this city account' USING ERRCODE = '42501';
  END IF;
  IF p_need_open AND NOT public.city_access_open(p_city) THEN
    RAISE EXCEPTION 'city account is not active' USING ERRCODE = 'P0402';
  END IF;
END $$;

-- ── RLS ─────────────────────────────────────────────────────────────────────
ALTER TABLE public.city_accounts       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.city_members        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.city_invites        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.city_account_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stripe_events       ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS city_accounts_read ON public.city_accounts;
CREATE POLICY city_accounts_read ON public.city_accounts FOR SELECT TO authenticated
  USING (public.is_admin() OR public.city_role(id) IS NOT NULL);
DROP POLICY IF EXISTS city_members_read ON public.city_members;
CREATE POLICY city_members_read ON public.city_members FOR SELECT TO authenticated
  USING (public.is_admin() OR public.city_role(city_account_id) IS NOT NULL);
DROP POLICY IF EXISTS city_invites_read ON public.city_invites;
CREATE POLICY city_invites_read ON public.city_invites FOR SELECT TO authenticated
  USING (public.is_admin() OR public.city_role(city_account_id) = 'owner');
DROP POLICY IF EXISTS city_events_read ON public.city_account_events;
CREATE POLICY city_events_read ON public.city_account_events FOR SELECT TO authenticated
  USING (public.is_admin() OR public.city_role(city_account_id) = 'owner');
-- No write policies: every write goes through the RPCs below or the service role.

-- ── Membership ──────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.claim_city_invites() RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_email text := lower(coalesce(auth.jwt() ->> 'email', '')); v_n integer := 0; r record;
BEGIN
  IF auth.uid() IS NULL OR v_email = '' THEN RETURN 0; END IF;
  FOR r IN SELECT * FROM public.city_invites WHERE email = v_email AND accepted_at IS NULL LOOP
    INSERT INTO public.city_members (city_account_id, user_id, role)
      VALUES (r.city_account_id, auth.uid(), r.role)
      ON CONFLICT (city_account_id, user_id) DO UPDATE SET role =
        CASE WHEN public.city_members.role = 'owner' THEN 'owner' ELSE EXCLUDED.role END;
    UPDATE public.city_invites SET accepted_at = now() WHERE id = r.id;
    INSERT INTO public.city_account_events (city_account_id, kind, detail, actor)
      VALUES (r.city_account_id, 'member_joined', jsonb_build_object('role', r.role), v_email);
    v_n := v_n + 1;
  END LOOP;
  RETURN v_n;
END $$;

CREATE OR REPLACE FUNCTION public.my_city_accounts() RETURNS TABLE (
  id uuid, slug text, display_name text, role text, status text, tier text,
  pilot_ends_at timestamptz, fee_waived boolean, auto_renew boolean,
  terms_accepted_at timestamptz, access_open boolean
) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT c.id, c.slug, c.display_name, m.role, c.status, c.tier, c.pilot_ends_at,
         c.fee_waived, c.auto_renew, c.terms_accepted_at, public.city_access_open(c.id)
  FROM public.city_members m JOIN public.city_accounts c ON c.id = m.city_account_id
  WHERE m.user_id = auth.uid()
  ORDER BY c.display_name;
$$;

-- Owner accepts the terms and makes the renewal choice (explicit, no default).
CREATE OR REPLACE FUNCTION public.city_accept_terms(p_city uuid, p_terms_version text, p_auto_renew boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE c public.city_accounts;
BEGIN
  IF public.city_role(p_city) IS DISTINCT FROM 'owner' THEN
    RAISE EXCEPTION 'only the city account owner can accept the terms' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO c FROM public.city_accounts WHERE id = p_city FOR UPDATE;
  IF NOT c.fee_waived AND p_auto_renew IS NULL THEN
    RAISE EXCEPTION 'choose whether the subscription renews automatically';
  END IF;
  UPDATE public.city_accounts SET
    terms_version = p_terms_version, terms_accepted_at = now(), terms_accepted_by = auth.uid(),
    auto_renew = CASE WHEN c.fee_waived THEN coalesce(p_auto_renew, false) ELSE p_auto_renew END,
    auto_renew_set_at = now(), auto_renew_set_by = auth.uid()
  WHERE id = p_city;
  INSERT INTO public.city_account_events (city_account_id, kind, detail, actor)
  VALUES (p_city, 'terms_accepted', jsonb_build_object(
    'terms_version', p_terms_version, 'auto_renew', p_auto_renew, 'fee_waived', c.fee_waived,
    'pilot_ends_at', c.pilot_ends_at, 'locked_lookup_key', c.locked_lookup_key,
    'locked_price_cents', c.locked_price_cents), auth.jwt() ->> 'email');
END $$;

-- Owner turns auto-renew on or off at any time (the web action mirrors it to Stripe).
CREATE OR REPLACE FUNCTION public.city_set_auto_renew(p_city uuid, p_on boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF public.city_role(p_city) IS DISTINCT FROM 'owner' AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'only the city account owner can change renewal' USING ERRCODE = '42501';
  END IF;
  IF p_on IS NULL THEN RAISE EXCEPTION 'auto-renew must be on or off'; END IF;
  UPDATE public.city_accounts SET auto_renew = p_on, auto_renew_set_at = now(), auto_renew_set_by = auth.uid()
  WHERE id = p_city;
  INSERT INTO public.city_account_events (city_account_id, kind, detail, actor)
  VALUES (p_city, 'auto_renew_changed', jsonb_build_object('auto_renew', p_on), auth.jwt() ->> 'email');
END $$;

-- Billing contact / PO number (owner).
CREATE OR REPLACE FUNCTION public.city_set_billing(p_city uuid, p_billing_email text, p_po_number text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF public.city_role(p_city) IS DISTINCT FROM 'owner' AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'only the city account owner can change billing details' USING ERRCODE = '42501';
  END IF;
  IF p_billing_email IS NOT NULL AND p_billing_email !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN
    RAISE EXCEPTION 'invalid billing email';
  END IF;
  UPDATE public.city_accounts SET billing_email = lower(nullif(btrim(p_billing_email), '')),
    po_number = nullif(left(btrim(coalesce(p_po_number, '')), 60), '')
  WHERE id = p_city;
END $$;

-- ── Dashboard data (members, paid features open) ────────────────────────────
-- Report rows never include user_id or anything that identifies a reporter.
CREATE OR REPLACE FUNCTION public.city_dashboard(p_city uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_auth uuid; v jsonb;
BEGIN
  PERFORM public.assert_city_member(p_city);
  SELECT authority_id INTO v_auth FROM public.city_accounts WHERE id = p_city;
  WITH r AS (
    SELECT * FROM public.reports WHERE authority_id = v_auth AND status <> 'draft'
  ), open_r AS (
    SELECT * FROM r WHERE status IN ('submitted', 'acknowledged', 'in_progress')
  ), esc AS (
    SELECT e.sent_at, cl.status, cl.updated_at, cl.resolved_at
    FROM public.escalation_log e JOIN public.report_clusters cl ON cl.id = e.cluster_id
    WHERE e.authority_id = v_auth AND e.sent_at IS NOT NULL
  )
  SELECT jsonb_build_object(
    'totals', (SELECT jsonb_build_object(
        'all', count(*),
        'open', count(*) FILTER (WHERE status IN ('submitted', 'acknowledged', 'in_progress')),
        'acknowledged', count(*) FILTER (WHERE status = 'acknowledged'),
        'in_progress', count(*) FILTER (WHERE status = 'in_progress'),
        'resolved', count(*) FILTER (WHERE status IN ('resolved', 'closed')),
        'last_30_days', count(*) FILTER (WHERE created_at > now() - interval '30 days')) FROM r),
    'by_category', coalesce((SELECT jsonb_agg(x ORDER BY x.open DESC, x.total DESC) FROM (
        SELECT category, count(*) AS total,
               count(*) FILTER (WHERE status IN ('submitted', 'acknowledged', 'in_progress')) AS open
        FROM r GROUP BY category) x), '[]'::jsonb),
    'open_by_severity', coalesce((SELECT jsonb_object_agg(hazard_level, n) FROM (
        SELECT hazard_level, count(*) AS n FROM open_r GROUP BY hazard_level) x), '{}'::jsonb),
    'weighted_backlog', (SELECT coalesce(sum(CASE hazard_level
        WHEN 'extremely_dangerous' THEN 5 WHEN 'dangerous' THEN 4 WHEN 'significant' THEN 3
        WHEN 'moderate' THEN 2 ELSE 1 END), 0) FROM open_r),
    'median_days_to_resolve', (SELECT round((percentile_cont(0.5) WITHIN GROUP (
        ORDER BY extract(epoch FROM (resolved_at - created_at)) / 86400))::numeric, 1)
        FROM r WHERE resolved_at IS NOT NULL AND created_at > now() - interval '365 days'),
    'escalations_90d', (SELECT count(*) FROM esc WHERE sent_at > now() - interval '90 days'),
    'by_area', coalesce((SELECT jsonb_agg(x ORDER BY x.open DESC) FROM (
        SELECT coalesce(nullif(zip, ''), 'unknown') AS zip, count(*) AS total,
               count(*) FILTER (WHERE status IN ('submitted', 'acknowledged', 'in_progress')) AS open
        FROM r GROUP BY 1 ORDER BY 3 DESC LIMIT 25) x), '[]'::jsonb),
    'monthly', coalesce((SELECT jsonb_agg(x ORDER BY x.month) FROM (
        SELECT to_char(date_trunc('month', created_at), 'YYYY-MM') AS month, count(*) AS reported,
               count(*) FILTER (WHERE resolved_at IS NOT NULL) AS resolved
        FROM r WHERE created_at > date_trunc('month', now()) - interval '11 months' GROUP BY 1) x), '[]'::jsonb),
    'recent', coalesce((SELECT jsonb_agg(x ORDER BY x.created_at DESC) FROM (
        SELECT id, category, status, hazard_level, size_rating, address, zip, latitude, longitude,
               confirm_count, cluster_id, created_at, resolved_at
        FROM open_r ORDER BY created_at DESC LIMIT 100) x), '[]'::jsonb)
  ) INTO v;
  RETURN v;
END $$;

-- Recurrence scorecard: a fix "reopens" when a new report of the same
-- category lands within 25 m of the cluster within 180 days of its resolution
-- (the methodology's recurrence window).
CREATE OR REPLACE FUNCTION public.city_scorecard(p_city uuid, p_days integer DEFAULT 365)
RETURNS TABLE (contractor text, fixes bigint, reopened bigint, reopen_rate numeric, median_days_to_fix numeric)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_auth uuid;
BEGIN
  PERFORM public.assert_city_member(p_city);
  SELECT c.authority_id INTO v_auth FROM public.city_accounts c WHERE c.id = p_city;
  RETURN QUERY
  WITH fixed AS (
    SELECT cl.id, coalesce(cl.contractor_name, 'Unassigned') AS who, cl.category AS cat,
           cl.centroid_point AS pt, cl.resolved_at AS fixed_at, cl.first_reported_at AS first_at
    FROM public.report_clusters cl
    WHERE cl.authority_id = v_auth AND cl.resolved_at IS NOT NULL
      AND cl.resolved_at > now() - make_interval(days => greatest(30, least(p_days, 1095)))
  ), flagged AS (
    SELECT f.*, EXISTS (
      SELECT 1 FROM public.reports r
      WHERE r.category = f.cat AND r.created_at > f.fixed_at
        AND r.created_at <= f.fixed_at + interval '180 days'
        AND f.pt IS NOT NULL AND r.location_point IS NOT NULL
        AND extensions.ST_DWithin(r.location_point::extensions.geography, f.pt::extensions.geography, 25)
    ) AS did_reopen
    FROM fixed f
  )
  SELECT g.who, count(*), count(*) FILTER (WHERE g.did_reopen),
         round(100.0 * count(*) FILTER (WHERE g.did_reopen) / count(*), 1),
         round((percentile_cont(0.5) WITHIN GROUP (ORDER BY extract(epoch FROM (g.fixed_at - g.first_at)) / 86400))::numeric, 1)
  FROM flagged g GROUP BY g.who ORDER BY count(*) DESC;
END $$;

CREATE OR REPLACE FUNCTION public.city_set_contractor(p_cluster uuid, p_name text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_city uuid;
BEGIN
  SELECT c.id INTO v_city FROM public.report_clusters cl
    JOIN public.city_accounts c ON c.authority_id = cl.authority_id WHERE cl.id = p_cluster;
  IF v_city IS NULL THEN RAISE EXCEPTION 'cluster is not in a city account'; END IF;
  PERFORM public.assert_city_member(v_city);
  UPDATE public.report_clusters SET contractor_name = nullif(left(btrim(coalesce(p_name, '')), 120), '')
  WHERE id = p_cluster;
END $$;

-- Resolved clusters available for contractor tagging.
CREATE OR REPLACE FUNCTION public.city_resolved_clusters(p_city uuid)
RETURNS TABLE (id uuid, category text, address text, resolved_at timestamptz, contractor_name text, report_count integer)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_auth uuid;
BEGIN
  PERFORM public.assert_city_member(p_city);
  SELECT c.authority_id INTO v_auth FROM public.city_accounts c WHERE c.id = p_city;
  RETURN QUERY SELECT cl.id, cl.category, cl.address, cl.resolved_at, cl.contractor_name, cl.report_count
    FROM public.report_clusters cl
    WHERE cl.authority_id = v_auth AND cl.resolved_at IS NOT NULL
    ORDER BY cl.resolved_at DESC LIMIT 200;
END $$;

-- Pre-deployment: ~200 m cells with reports in 2+ years or 3+ reports whose
-- usual months fall in the next three months.
CREATE OR REPLACE FUNCTION public.city_predeployment(p_city uuid)
RETURNS TABLE (lat double precision, lng double precision, category text, address text, reports bigint,
               years_recurring bigint, typical_months integer[], confidence numeric, priority text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_auth uuid; v_now integer := extract(month FROM now())::integer;
BEGIN
  PERFORM public.assert_city_member(p_city);
  SELECT c.authority_id INTO v_auth FROM public.city_accounts c WHERE c.id = p_city;
  RETURN QUERY
  WITH cells AS (
    SELECT round((r.latitude / 0.002)::numeric) * 0.002 AS clat, round((r.longitude / 0.002)::numeric) * 0.002 AS clng,
           r.category AS cat, max(r.address) AS addr, count(*) AS n,
           count(DISTINCT extract(year FROM r.created_at)) AS yrs,
           array_agg(DISTINCT extract(month FROM r.created_at)::integer) AS months
    FROM public.reports r
    WHERE r.authority_id = v_auth AND r.status <> 'draft'
    GROUP BY 1, 2, 3
  )
  SELECT x.clat::double precision, x.clng::double precision, x.cat, x.addr, x.n, x.yrs, x.months,
         round(least(0.95, 0.4 + x.yrs * 0.15 + x.n * 0.05)::numeric, 2) AS conf,
         CASE WHEN x.yrs >= 3 THEN 'high' WHEN x.n >= 5 THEN 'moderate' ELSE 'watch' END
  FROM cells x
  WHERE (x.yrs >= 2 OR x.n >= 3)
    AND (x.n >= 5 OR EXISTS (SELECT 1 FROM unnest(x.months) m WHERE ((m - v_now + 12) % 12) <= 3))
  ORDER BY conf DESC, x.n DESC LIMIT 100;
END $$;

-- Paged export rows (no reporter identity).
CREATE OR REPLACE FUNCTION public.city_export_rows(p_city uuid, p_after timestamptz DEFAULT NULL, p_limit integer DEFAULT 5000)
RETURNS TABLE (id uuid, category text, status text, hazard_level text, size_rating text, address text, city text,
               zip text, latitude double precision, longitude double precision, confirm_count integer,
               upvote_count integer, cluster_id uuid, created_at timestamptz, resolved_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_auth uuid;
BEGIN
  PERFORM public.assert_city_member(p_city);
  SELECT c.authority_id INTO v_auth FROM public.city_accounts c WHERE c.id = p_city;
  RETURN QUERY SELECT r.id, r.category, r.status, r.hazard_level, r.size_rating, r.address, r.city, r.zip,
      r.latitude, r.longitude, r.confirm_count, r.upvote_count, r.cluster_id, r.created_at, r.resolved_at
    FROM public.reports r
    WHERE r.authority_id = v_auth AND r.status <> 'draft' AND (p_after IS NULL OR r.created_at > p_after)
    ORDER BY r.created_at LIMIT least(greatest(p_limit, 1), 5000);
END $$;

-- ── Public city page (anyone; no payment check, by design) ──────────────────
-- Grade inputs follow methodology v0.1 (90-day window, four thresholds).
-- The letter grade itself needs peer-group normalization, which isn't built,
-- so the page shows the inputs and threshold progress only.
CREATE OR REPLACE FUNCTION public.city_public_page(p_slug text) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE c public.city_accounts; v jsonb;
BEGIN
  SELECT * INTO c FROM public.city_accounts WHERE slug = lower(p_slug);
  IF NOT FOUND THEN RETURN NULL; END IF;
  WITH w AS (
    SELECT * FROM public.reports WHERE authority_id = c.authority_id AND status <> 'draft'
      AND created_at > now() - interval '90 days'
  ), allr AS (
    SELECT * FROM public.reports WHERE authority_id = c.authority_id AND status <> 'draft'
  ), esc AS (
    SELECT DISTINCT e.cluster_id, cl.status, cl.resolved_at FROM public.escalation_log e
      JOIN public.report_clusters cl ON cl.id = e.cluster_id
    WHERE e.authority_id = c.authority_id AND e.sent_at > now() - interval '90 days'
  )
  SELECT jsonb_build_object(
    'name', c.display_name,
    'slug', c.slug,
    'state', (SELECT a.state FROM public.authorities a WHERE a.id = c.authority_id),
    'methodology_version', '0.1',
    'thresholds', jsonb_build_object(
      'volume', jsonb_build_object('have', (SELECT count(*) FROM w), 'need', 100),
      'reporters', jsonb_build_object('have', (SELECT count(DISTINCT coalesce(w.user_id::text, w.id::text)) FROM w), 'need', 10),
      'categories', jsonb_build_object('have', (SELECT count(DISTINCT w.category) FROM w), 'need', 3),
      'escalations', jsonb_build_object('have', (SELECT count(*) FROM esc), 'need', 30)),
    'inputs', jsonb_build_object(
      'fix_rate_pct', (SELECT CASE WHEN count(*) = 0 THEN NULL ELSE round(100.0 * count(*) FILTER (WHERE esc.status IN ('resolved', 'closed')) / count(*), 1) END FROM esc),
      'open_backlog', (SELECT count(*) FROM allr WHERE status IN ('submitted', 'acknowledged', 'in_progress')),
      'open_dangerous', (SELECT count(*) FROM allr WHERE status IN ('submitted', 'acknowledged', 'in_progress') AND hazard_level IN ('dangerous', 'extremely_dangerous'))),
    'monthly', coalesce((SELECT jsonb_agg(x ORDER BY x.month) FROM (
        SELECT to_char(date_trunc('month', allr.created_at), 'YYYY-MM') AS month, count(*) AS reported,
               count(*) FILTER (WHERE allr.resolved_at IS NOT NULL) AS resolved,
               round((percentile_cont(0.5) WITHIN GROUP (ORDER BY extract(epoch FROM (allr.resolved_at - allr.created_at)) / 86400))::numeric, 1) AS median_days_to_resolve
        FROM allr WHERE created_at > date_trunc('month', now()) - interval '11 months' GROUP BY 1) x), '[]'::jsonb)
  ) INTO v;
  RETURN v;
END $$;

-- ── Grants ──────────────────────────────────────────────────────────────────
REVOKE ALL ON FUNCTION public.city_role(uuid), public.city_access_open(uuid), public.assert_city_member(uuid, boolean),
  public.claim_city_invites(), public.my_city_accounts(), public.city_accept_terms(uuid, text, boolean),
  public.city_set_auto_renew(uuid, boolean), public.city_set_billing(uuid, text, text), public.city_dashboard(uuid),
  public.city_scorecard(uuid, integer), public.city_set_contractor(uuid, text), public.city_resolved_clusters(uuid),
  public.city_predeployment(uuid), public.city_export_rows(uuid, timestamptz, integer), public.city_public_page(text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.city_role(uuid), public.city_access_open(uuid), public.claim_city_invites(),
  public.my_city_accounts(), public.city_accept_terms(uuid, text, boolean), public.city_set_auto_renew(uuid, boolean),
  public.city_set_billing(uuid, text, text), public.city_dashboard(uuid), public.city_scorecard(uuid, integer),
  public.city_set_contractor(uuid, text), public.city_resolved_clusters(uuid), public.city_predeployment(uuid),
  public.city_export_rows(uuid, timestamptz, integer)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.city_public_page(text) TO anon, authenticated;

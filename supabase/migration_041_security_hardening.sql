-- Migration 041: security hardening (2026-11-16 audit)
--
-- 1. Least-privilege table grants: anon/authenticated lose TRUNCATE,
--    REFERENCES and TRIGGER everywhere, and lose every write (and read) that
--    no RLS policy allows them anyway, so a policy mistake can't open a table.
-- 2. Reports: server-owned columns can't be set or changed by clients
--    (status, counts, cluster, authority, timestamps, foreign media URLs);
--    signed-out reports are rate-limited per IP and globally.
-- 3. Votes: counts maintained by a trigger on report_votes (one per user);
--    the old increment RPCs become no-ops; votes are private to the voter.
-- 4. Profiles: push tokens are never readable; points/badges/counters can't
--    be edited by their owner; new display names no longer derive from email.
-- 5. Feedback readable by admins only; AI cache writable only for your own
--    report; award_points not callable from the API.
-- 6. Atomic AI limits (per-user count + per-user daily cost + org ceiling,
--    reserved before the call), a generic server-side rate limiter, smoke-test
--    artifact tracking, and service-only access to the Resend webhook secret.

-- ── 1. Grants ───────────────────────────────────────────────────────────────
REVOKE TRUNCATE, REFERENCES, TRIGGER ON ALL TABLES IN SCHEMA public FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE TRUNCATE, REFERENCES, TRIGGER ON TABLES FROM anon, authenticated;

DO $$
DECLARE t record; v_cmd text;
BEGIN
  FOR t IN SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
           WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p') LOOP
    FOREACH v_cmd IN ARRAY ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE'] LOOP
      -- anon keeps a privilege only if some policy for anon/public allows the command
      IF NOT EXISTS (SELECT 1 FROM pg_policies p WHERE p.schemaname = 'public' AND p.tablename = t.relname
                     AND p.cmd IN (v_cmd, 'ALL') AND p.roles && ARRAY['public', 'anon']::name[]) THEN
        EXECUTE format('REVOKE %s ON public.%I FROM anon', v_cmd, t.relname);
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_policies p WHERE p.schemaname = 'public' AND p.tablename = t.relname
                     AND p.cmd IN (v_cmd, 'ALL') AND p.roles && ARRAY['public', 'authenticated']::name[]) THEN
        EXECUTE format('REVOKE %s ON public.%I FROM authenticated', v_cmd, t.relname);
      END IF;
    END LOOP;
  END LOOP;
END $$;

-- Only these writes are open to signed-out callers.
REVOKE INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public FROM anon;
GRANT INSERT ON public.reports, public.feedback TO anon;

-- ── 2. Reports ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.anon_rate_log (
  id         bigserial PRIMARY KEY,
  bucket     text NOT NULL,
  ip_hash    text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS anon_rate_log_idx ON public.anon_rate_log (bucket, ip_hash, created_at);
ALTER TABLE public.anon_rate_log ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.anon_rate_log FROM anon, authenticated;

-- Client IP as seen by the API gateway, hashed (never stored raw).
CREATE OR REPLACE FUNCTION public.request_ip_hash() RETURNS text
LANGUAGE plpgsql STABLE SET search_path = '' AS $$
DECLARE h jsonb := coalesce(nullif(current_setting('request.headers', true), ''), '{}')::jsonb; ip text;
BEGIN
  ip := coalesce(h ->> 'cf-connecting-ip', h ->> 'x-real-ip', split_part(h ->> 'x-forwarded-for', ',', 1), 'unknown');
  RETURN encode(extensions.digest(btrim(ip) || ':fault-line', 'sha256'), 'hex');
END $$;

CREATE OR REPLACE FUNCTION public.anon_rate_ok(p_bucket text, p_per_ip integer, p_global integer, p_window interval)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_ip text := public.request_ip_hash();
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('anon_rate:' || p_bucket));
  IF (SELECT count(*) FROM public.anon_rate_log WHERE bucket = p_bucket AND ip_hash = v_ip AND created_at > now() - p_window) >= p_per_ip
     OR (SELECT count(*) FROM public.anon_rate_log WHERE bucket = p_bucket AND created_at > now() - p_window) >= p_global THEN
    RETURN false;
  END IF;
  INSERT INTO public.anon_rate_log (bucket, ip_hash) VALUES (p_bucket, v_ip);
  RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.anon_rate_ok(text, integer, integer, interval) FROM PUBLIC, anon, authenticated;

-- Any http(s) URL inside report media must point at our own storage bucket
-- (otherwise a report could make every viewer's device fetch an attacker's URL).
CREATE OR REPLACE FUNCTION public.media_urls_ok(p jsonb) RETURNS boolean
LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT coalesce(bool_and(v NOT LIKE 'http%' OR v LIKE 'https://dzewklljiksyivsfpunt.supabase.co/storage/v1/object/public/report-media/%'), true)
  FROM (
    SELECT e #>> '{}' AS v FROM jsonb_array_elements(CASE WHEN jsonb_typeof(p) = 'array' THEN p ELSE '[]'::jsonb END) e
      WHERE jsonb_typeof(e) = 'string'
    UNION ALL
    SELECT kv.value FROM jsonb_array_elements(CASE WHEN jsonb_typeof(p) = 'array' THEN p ELSE '[]'::jsonb END) e,
      LATERAL jsonb_each_text(CASE WHEN jsonb_typeof(e) = 'object' THEN e ELSE '{}'::jsonb END) kv
  ) x;
$$;

-- Runs first (a0_) on every write made directly by a client. SECURITY
-- INVOKER on purpose: inside trusted SECURITY DEFINER code (clustering,
-- vote counts, admin RPCs) current_user is the function owner, so only
-- statements sent straight from the API as anon/authenticated are guarded.
CREATE OR REPLACE FUNCTION public.guard_report_write() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF current_user NOT IN ('anon', 'authenticated') THEN RETURN NEW; END IF;

  IF NOT public.media_urls_ok(NEW.media) OR NOT public.media_urls_ok(NEW.resolved_media) THEN
    RAISE EXCEPTION 'media must be uploaded to Fault Line storage' USING ERRCODE = '22023';
  END IF;

  IF TG_OP = 'INSERT' THEN
    NEW.status := 'submitted';
    NEW.upvote_count := 0;
    NEW.confirm_count := 0;
    NEW.cluster_id := NULL;
    NEW.parent_cluster_id := NULL;
    NEW.submission_method := NULL;
    NEW.submission_reference := NULL;
    NEW.resolved_at := NULL;
    NEW.resolved_media := NULL;
    NEW.created_at := now();
    NEW.updated_at := now();
    NEW.authority_id := (SELECT a.id FROM public.find_authority_by_point(NEW.latitude, NEW.longitude, NEW.category) a LIMIT 1);
    RETURN NEW;
  END IF;

  -- UPDATE by the report's owner: content edits only.
  NEW.upvote_count := OLD.upvote_count;
  NEW.confirm_count := OLD.confirm_count;
  NEW.cluster_id := OLD.cluster_id;
  NEW.parent_cluster_id := OLD.parent_cluster_id;
  NEW.authority_id := OLD.authority_id;
  NEW.submission_method := OLD.submission_method;
  NEW.submission_reference := OLD.submission_reference;
  NEW.created_at := OLD.created_at;
  NEW.latitude := OLD.latitude;
  NEW.longitude := OLD.longitude;
  NEW.category := OLD.category;
  -- The reporter may reopen a repair that didn't hold, nothing else.
  IF NEW.status IS DISTINCT FROM OLD.status AND NOT (NEW.status = 'in_progress' AND OLD.status IN ('resolved', 'closed')) THEN
    NEW.status := OLD.status;
  END IF;
  IF NEW.status = OLD.status THEN NEW.resolved_at := OLD.resolved_at; END IF;
  NEW.updated_at := now();
  RETURN NEW;
END $$;

-- Signed-out reports: per-IP and global hourly caps (signed-in users keep the
-- per-account limit).
CREATE OR REPLACE FUNCTION public.enforce_report_rate_limit() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'extensions' AS $function$
DECLARE
  recent_count INTEGER;
BEGIN
  IF auth.uid() IS NULL THEN
    IF coalesce(current_setting('role', true), '') = 'anon'
       AND NOT public.anon_rate_ok('report_insert', 5, 120, interval '1 hour') THEN
      RAISE EXCEPTION 'Rate limit exceeded: too many reports from this connection' USING ERRCODE = 'P0001';
    END IF;
    RETURN NEW;
  END IF;
  SELECT COUNT(*) INTO recent_count
  FROM reports r
  WHERE r.created_at > NOW() - INTERVAL '1 hour'
    AND (r.user_id = auth.uid()
         OR r.id IN (SELECT o.report_id FROM report_owners o WHERE o.user_id = auth.uid()));
  IF recent_count >= 10 THEN
    RAISE EXCEPTION 'Rate limit exceeded: maximum 10 reports per hour'
      USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS a0_guard_report_write ON public.reports;
CREATE TRIGGER a0_guard_report_write BEFORE INSERT OR UPDATE ON public.reports
  FOR EACH ROW EXECUTE FUNCTION public.guard_report_write();

-- ── 3. Votes ────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.sync_vote_counts() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE rid uuid := coalesce(NEW.report_id, OLD.report_id);
BEGIN
  UPDATE public.reports r SET
    upvote_count  = (SELECT count(*) FROM public.report_votes v WHERE v.report_id = rid AND v.vote_type = 'upvote'),
    confirm_count = (SELECT count(*) FROM public.report_votes v WHERE v.report_id = rid AND v.vote_type = 'confirm')
  WHERE r.id = rid;
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS report_votes_sync_counts ON public.report_votes;
CREATE TRIGGER report_votes_sync_counts AFTER INSERT OR DELETE ON public.report_votes
  FOR EACH ROW EXECUTE FUNCTION public.sync_vote_counts();

-- Old clients still call these after inserting a vote; counts now come from the trigger.
CREATE OR REPLACE FUNCTION public.increment_upvote(report_id uuid) RETURNS void
LANGUAGE sql SET search_path = '' AS $$ SELECT NULL::void $$;
CREATE OR REPLACE FUNCTION public.increment_confirm(report_id uuid) RETURNS void
LANGUAGE sql SET search_path = '' AS $$ SELECT NULL::void $$;

DROP POLICY IF EXISTS "Votes are viewable by everyone" ON public.report_votes;
DROP POLICY IF EXISTS "Users can view own votes" ON public.report_votes;
CREATE POLICY "Users can view own votes" ON public.report_votes FOR SELECT TO authenticated USING (auth.uid() = user_id);
REVOKE SELECT ON public.report_votes FROM anon;
-- A vote must be on a report the voter can see, and can't be on their own report.
DROP POLICY IF EXISTS "Authenticated users can vote" ON public.report_votes;
CREATE POLICY "Authenticated users can vote" ON public.report_votes FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id AND vote_type IN ('upvote', 'confirm') AND NOT public.owns_report(report_id));
UPDATE public.reports r SET
  upvote_count  = (SELECT count(*) FROM public.report_votes v WHERE v.report_id = r.id AND v.vote_type = 'upvote'),
  confirm_count = (SELECT count(*) FROM public.report_votes v WHERE v.report_id = r.id AND v.vote_type = 'confirm');

-- ── 4. Profiles ─────────────────────────────────────────────────────────────
REVOKE SELECT, INSERT, UPDATE ON public.profiles FROM anon, authenticated;
GRANT SELECT (id, display_name, avatar_url, total_reports, total_upvotes, total_confirms, points, badges, created_at, updated_at)
  ON public.profiles TO anon, authenticated;
GRANT UPDATE (display_name, avatar_url, push_token) ON public.profiles TO authenticated;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_display_name_len CHECK (display_name IS NULL OR length(display_name) <= 60) NOT VALID;

CREATE OR REPLACE FUNCTION public.handle_new_user() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'extensions' AS $function$
BEGIN
  -- Never derive a public name from the email address.
  INSERT INTO profiles (id, display_name)
  VALUES (NEW.id, coalesce(nullif(left(btrim(NEW.raw_user_meta_data ->> 'display_name'), 60), ''),
                           'Neighbor ' || upper(substr(md5(NEW.id::text), 1, 5))));
  RETURN NEW;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.award_points(uuid, integer) FROM PUBLIC, anon, authenticated;

-- ── 5. Feedback, AI cache ───────────────────────────────────────────────────
DROP POLICY IF EXISTS "Feedback is viewable by everyone" ON public.feedback;
DROP POLICY IF EXISTS "Feedback viewable by admins" ON public.feedback;
CREATE POLICY "Feedback viewable by admins" ON public.feedback FOR SELECT TO authenticated USING (public.is_admin());
REVOKE SELECT ON public.feedback FROM anon;
ALTER TABLE public.feedback ADD CONSTRAINT feedback_sizes CHECK (
  length(coalesce(message, '')) <= 5000 AND length(coalesce(subject, '')) <= 200 AND
  length(coalesce(name, '')) <= 120 AND length(coalesce(email, '')) <= 254) NOT VALID;

DROP POLICY IF EXISTS "AI cache insertable by authenticated" ON public.ai_cache;
DROP POLICY IF EXISTS "AI cache insertable by report owner" ON public.ai_cache;
CREATE POLICY "AI cache insertable by report owner" ON public.ai_cache FOR INSERT TO authenticated
  WITH CHECK (public.owns_report(report_id));

-- ── 6a. Atomic AI limits ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.ai_user_usage_daily (
  user_id     uuid NOT NULL,
  day         date NOT NULL,
  cost_micros bigint NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, day)
);
ALTER TABLE public.ai_user_usage_daily ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ai_user_usage_daily FROM anon, authenticated;

INSERT INTO public.app_settings (key, value, updated_by)
VALUES ('ai_user_daily_cap_usd', '0.5'::jsonb, 'migration_041')
ON CONFLICT (key) DO NOTHING;

-- Reserve the worst-case cost of one call before making it. One transaction
-- under a per-user lock: count limit, per-user daily cost, org ceiling.
CREATE OR REPLACE FUNCTION public.ai_reserve(p_user uuid, p_bucket text, p_max_hour integer, p_max_day integer, p_reserve_micros bigint)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE d date := (now() AT TIME ZONE 'utc')::date;
        org_cap bigint := coalesce((SELECT (value #>> '{}')::numeric FROM public.app_settings WHERE key = 'ai_daily_ceiling_usd'), 5) * 1000000;
        user_cap bigint := coalesce((SELECT (value #>> '{}')::numeric FROM public.app_settings WHERE key = 'ai_user_daily_cap_usd'), 0.5) * 1000000;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('ai:' || p_user::text));
  PERFORM pg_advisory_xact_lock(hashtext('ai:org'));
  IF (SELECT count(*) FROM public.edge_rate_limit_log WHERE user_id = p_user AND bucket = p_bucket AND created_at > now() - interval '1 hour') >= p_max_hour
     OR (SELECT count(*) FROM public.edge_rate_limit_log WHERE user_id = p_user AND bucket = p_bucket AND created_at > now() - interval '1 day') >= p_max_day
     OR coalesce((SELECT cost_micros FROM public.ai_user_usage_daily WHERE user_id = p_user AND day = d), 0) + p_reserve_micros > user_cap
     OR coalesce((SELECT cost_micros FROM public.ai_usage_daily WHERE day = d), 0) + p_reserve_micros > org_cap THEN
    RETURN false;
  END IF;
  INSERT INTO public.edge_rate_limit_log (user_id, bucket) VALUES (p_user, p_bucket);
  INSERT INTO public.ai_user_usage_daily (user_id, day, cost_micros) VALUES (p_user, d, p_reserve_micros)
    ON CONFLICT (user_id, day) DO UPDATE SET cost_micros = public.ai_user_usage_daily.cost_micros + EXCLUDED.cost_micros;
  INSERT INTO public.ai_usage_daily (day, cost_micros, calls) VALUES (d, p_reserve_micros, 1)
    ON CONFLICT (day) DO UPDATE SET cost_micros = public.ai_usage_daily.cost_micros + EXCLUDED.cost_micros,
                                    calls = public.ai_usage_daily.calls + 1;
  RETURN true;
END $$;

-- Replace the reservation with the real cost (never below zero).
CREATE OR REPLACE FUNCTION public.ai_settle(p_user uuid, p_reserved_micros bigint, p_actual_micros bigint)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE d date := (now() AT TIME ZONE 'utc')::date; delta bigint := greatest(p_actual_micros, 0) - p_reserved_micros;
BEGIN
  UPDATE public.ai_user_usage_daily SET cost_micros = greatest(cost_micros + delta, 0) WHERE user_id = p_user AND day = d;
  UPDATE public.ai_usage_daily SET cost_micros = greatest(cost_micros + delta, 0) WHERE day = d;
END $$;
REVOKE ALL ON FUNCTION public.ai_reserve(uuid, text, integer, integer, bigint), public.ai_settle(uuid, bigint, bigint) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ai_reserve(uuid, text, integer, integer, bigint), public.ai_settle(uuid, bigint, bigint) TO service_role;

-- ── 6b. Generic server-side rate limiter (web app, service role only) ───────
CREATE TABLE IF NOT EXISTS public.server_rate_log (
  id         bigserial PRIMARY KEY,
  bucket     text NOT NULL,
  key_hash   text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS server_rate_log_idx ON public.server_rate_log (bucket, key_hash, created_at);
ALTER TABLE public.server_rate_log ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.server_rate_log FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.rate_limit_hit(p_bucket text, p_key text, p_max integer, p_window_seconds integer)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE k text := encode(extensions.digest(p_key, 'sha256'), 'hex');
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext(p_bucket || ':' || k));
  IF (SELECT count(*) FROM public.server_rate_log WHERE bucket = p_bucket AND key_hash = k
      AND created_at > now() - make_interval(secs => p_window_seconds)) >= p_max THEN
    RETURN false;
  END IF;
  INSERT INTO public.server_rate_log (bucket, key_hash) VALUES (p_bucket, k);
  RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.rate_limit_hit(text, text, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rate_limit_hit(text, text, integer, integer) TO service_role;

-- ── 6c. Smoke-test artifacts and webhook secret ─────────────────────────────
CREATE TABLE IF NOT EXISTS public.smoke_artifacts (
  kind       text NOT NULL,
  id         uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (kind, id)
);
ALTER TABLE public.smoke_artifacts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.smoke_artifacts FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.set_resend_webhook_secret(p_secret text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE sid uuid;
BEGIN
  IF p_secret IS NULL OR p_secret !~ '^whsec_' THEN RAISE EXCEPTION 'not a webhook signing secret'; END IF;
  SELECT id INTO sid FROM vault.secrets WHERE name = 'resend_webhook_secret';
  IF sid IS NULL THEN PERFORM vault.create_secret(p_secret, 'resend_webhook_secret');
  ELSE PERFORM vault.update_secret(sid, p_secret); END IF;
END $$;
CREATE OR REPLACE FUNCTION public.get_resend_webhook_secret() RETURNS text
LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'resend_webhook_secret';
$$;
REVOKE ALL ON FUNCTION public.set_resend_webhook_secret(text), public.get_resend_webhook_secret() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_resend_webhook_secret(text), public.get_resend_webhook_secret() TO service_role;

-- Housekeeping for the new logs.
SELECT cron.unschedule('security-logs-prune') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'security-logs-prune');
SELECT cron.schedule('security-logs-prune', '20 4 * * *', $$
  DELETE FROM public.anon_rate_log WHERE created_at < now() - interval '2 days';
  DELETE FROM public.server_rate_log WHERE created_at < now() - interval '2 days';
  DELETE FROM public.edge_rate_limit_log WHERE created_at < now() - interval '3 days';
  DELETE FROM public.ai_user_usage_daily WHERE day < (now() AT TIME ZONE 'utc')::date - 30;
$$);

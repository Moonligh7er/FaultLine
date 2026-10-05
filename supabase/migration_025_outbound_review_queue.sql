-- ============================================================
-- Migration 025: Outbound review queue (human approval, toggleable)
-- ============================================================
-- Everything Fault Line sends to an authority — cluster escalations
-- (escalate-clusters) and per-report submissions (send-report-email) —
-- now lands in public.outbound_messages first. Nothing leaves until a
-- row is 'approved'; the dispatch-outbound edge function sends approved
-- rows (triggered immediately on approval, plus a cron sweep).
--
-- app_settings.auto_send = true skips review (rows are created
-- 'approved'). Default false for beta.
--
-- Admin identity lives in the DB (admin_users) so RLS and RPCs can check
-- it without the web app holding a service-role key.
--
-- Each row gets a short `ref` (e.g. FL-7Q3K9M) that dispatch puts in the
-- email subject as [FL-7Q3K9M]; inbound replies are matched on it.
-- ============================================================

-- ---------- Admins ----------
CREATE TABLE public.admin_users (
  email      text PRIMARY KEY CHECK (email = lower(email)),
  created_at timestamptz NOT NULL DEFAULT NOW()
);
ALTER TABLE public.admin_users ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.admin_users FROM anon, authenticated;
INSERT INTO public.admin_users (email) VALUES
  ('moonligh7er@gmail.com'),
  ('moonlit-social-labs@proton.me');

CREATE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.admin_users
    WHERE email = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;
REVOKE ALL ON FUNCTION public.is_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_admin() TO anon, authenticated, service_role;

-- ---------- Settings ----------
CREATE TABLE public.app_settings (
  key        text PRIMARY KEY,
  value      jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT NOW(),
  updated_by text
);
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.app_settings FROM anon, authenticated;
CREATE POLICY "Admins read settings" ON public.app_settings
  FOR SELECT TO authenticated USING (public.is_admin());
GRANT SELECT ON public.app_settings TO authenticated;

INSERT INTO public.app_settings (key, value) VALUES
  ('auto_send', 'false'::jsonb),           -- skip human review of outbound messages
  ('auto_apply_replies', 'false'::jsonb),  -- apply status changes suggested by inbound replies
  ('reply_to', 'null'::jsonb);             -- Reply-To address for outbound email (null = env REPLY_TO / FROM)

CREATE FUNCTION public.get_setting(p_key text)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$ SELECT value FROM public.app_settings WHERE key = p_key; $$;
REVOKE ALL ON FUNCTION public.get_setting(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_setting(text) TO service_role;

CREATE FUNCTION public.set_setting(p_key text, p_value jsonb)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501'; END IF;
  IF p_key NOT IN ('auto_send', 'auto_apply_replies', 'reply_to') THEN
    RAISE EXCEPTION 'unknown setting %', p_key USING ERRCODE = '22023';
  END IF;
  UPDATE public.app_settings
  SET value = p_value, updated_at = NOW(), updated_by = auth.jwt() ->> 'email'
  WHERE key = p_key;
END;
$$;
REVOKE ALL ON FUNCTION public.set_setting(text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_setting(text, jsonb) TO authenticated;

-- ---------- Outbox ----------
CREATE FUNCTION public.new_outbound_ref()
RETURNS text
LANGUAGE sql VOLATILE SET search_path = ''
AS $$
  -- 6 chars from an unambiguous alphabet (no 0/O/1/I): ~887M combinations.
  SELECT 'FL-' || string_agg(substr('23456789ABCDEFGHJKLMNPQRSTUVWXYZ', 1 + floor(random() * 32)::int, 1), '')
  FROM generate_series(1, 6);
$$;

CREATE TABLE public.outbound_messages (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ref           text NOT NULL UNIQUE DEFAULT public.new_outbound_ref(),
  kind          text NOT NULL CHECK (kind IN ('cluster_escalation', 'report_submission')),
  cluster_id    uuid REFERENCES public.report_clusters(id) ON DELETE CASCADE,
  report_id     uuid REFERENCES public.reports(id) ON DELETE CASCADE,
  authority_id  uuid REFERENCES public.authorities(id) ON DELETE SET NULL,
  methods       jsonb NOT NULL DEFAULT '[]'::jsonb,  -- prioritized submission methods (snapshot)
  recipient     text,                                -- first method endpoint, for display
  subject       text NOT NULL,                       -- without the [ref] tag (added at send)
  body          text NOT NULL,
  payload       jsonb NOT NULL DEFAULT '{}'::jsonb,  -- structured summary for API submissions
  status        text NOT NULL DEFAULT 'pending_review'
                CHECK (status IN ('pending_review', 'approved', 'sending', 'sent', 'failed', 'rejected')),
  created_by    uuid,
  reviewed_by   text,
  reviewed_at   timestamptz,
  review_note   text,
  sent_method   text,
  sent_recipient text,
  external_id   text,
  attempts      jsonb,
  error         text,
  sent_at       timestamptz,
  created_at    timestamptz NOT NULL DEFAULT NOW(),
  updated_at    timestamptz NOT NULL DEFAULT NOW(),
  CHECK (cluster_id IS NOT NULL OR report_id IS NOT NULL)
);
-- One live message per cluster / per report. A rejection sticks (no daily
-- re-queue); a failure frees the slot so it can be retried.
CREATE UNIQUE INDEX outbound_one_per_cluster ON public.outbound_messages (cluster_id)
  WHERE kind = 'cluster_escalation' AND status <> 'failed';
CREATE UNIQUE INDEX outbound_one_per_report ON public.outbound_messages (report_id)
  WHERE kind = 'report_submission' AND status <> 'failed';
CREATE INDEX outbound_by_status ON public.outbound_messages (status, created_at);

ALTER TABLE public.outbound_messages ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.outbound_messages FROM anon, authenticated;
CREATE POLICY "Admins read outbound" ON public.outbound_messages
  FOR SELECT TO authenticated USING (public.is_admin());
GRANT SELECT ON public.outbound_messages TO authenticated;

-- ---------- Dispatch trigger ----------
-- Fires dispatch-outbound now (async via pg_net) using the Vault cron secret.
CREATE FUNCTION public.trigger_outbound_dispatch()
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  PERFORM net.http_post(
    url := 'https://dzewklljiksyivsfpunt.supabase.co/functions/v1/dispatch-outbound',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'cron_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  );
END;
$$;
REVOKE ALL ON FUNCTION public.trigger_outbound_dispatch() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.trigger_outbound_dispatch() TO service_role;

-- ---------- Review ----------
CREATE FUNCTION public.review_outbound(p_id uuid, p_approve boolean, p_note text DEFAULT NULL)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE v_status text;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501'; END IF;

  UPDATE public.outbound_messages
  SET status = CASE WHEN p_approve THEN 'approved' ELSE 'rejected' END,
      reviewed_by = auth.jwt() ->> 'email',
      reviewed_at = NOW(),
      review_note = p_note,
      updated_at = NOW()
  WHERE id = p_id AND status = 'pending_review'
  RETURNING status INTO v_status;

  IF v_status IS NULL THEN
    RAISE EXCEPTION 'message is not awaiting review' USING ERRCODE = '22023';
  END IF;
  IF v_status = 'approved' THEN
    PERFORM public.trigger_outbound_dispatch();
  END IF;
  RETURN v_status;
END;
$$;
REVOKE ALL ON FUNCTION public.review_outbound(uuid, boolean, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.review_outbound(uuid, boolean, text) TO authenticated;

-- Admin queue: mark a web_form_manual escalation as submitted/failed.
-- (The old direct UPDATE from the web app silently did nothing: escalation_log
-- has no UPDATE policy.)
CREATE FUNCTION public.mark_escalation_handled(p_log_id uuid, p_status text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501'; END IF;
  IF p_status NOT IN ('sent', 'failed') THEN RAISE EXCEPTION 'bad status' USING ERRCODE = '22023'; END IF;
  UPDATE public.escalation_log
  SET status = p_status,
      sent_at = CASE WHEN p_status = 'sent' THEN NOW() ELSE NULL END,
      error_message = CASE WHEN p_status = 'failed' THEN 'Admin marked failed from queue' ELSE NULL END
  WHERE id = p_log_id;
END;
$$;
REVOKE ALL ON FUNCTION public.mark_escalation_handled(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_escalation_handled(uuid, text) TO authenticated;

-- ---------- Sweep ----------
-- Fallback in case an on-approval trigger is lost; also picks up rows that
-- were created already-approved (auto_send).
SELECT cron.schedule(
  'dispatch-outbound-sweep',
  '*/10 * * * *',
  $cmd$
  SELECT net.http_post(
    url := 'https://dzewklljiksyivsfpunt.supabase.co/functions/v1/dispatch-outbound',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'cron_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  );
  $cmd$
);

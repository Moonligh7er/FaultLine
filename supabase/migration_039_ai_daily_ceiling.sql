-- Migration 039: org-wide daily AI spend ceiling
--
-- Per-user rate limits (migration 023) cap one account, not the bill: enough
-- accounts could still run up thousands a month. The AI edge functions now
-- check ai_budget_ok() before every model call and record the call's cost
-- (from the response's token usage) afterwards. Once today's spend reaches
-- app_settings.ai_daily_ceiling_usd, AI features pause until midnight UTC;
-- reporting itself keeps working.

CREATE TABLE IF NOT EXISTS public.ai_usage_daily (
  day         date PRIMARY KEY,
  cost_micros bigint NOT NULL DEFAULT 0,
  calls       integer NOT NULL DEFAULT 0
);
ALTER TABLE public.ai_usage_daily ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ai_usage_admin_read ON public.ai_usage_daily;
CREATE POLICY ai_usage_admin_read ON public.ai_usage_daily FOR SELECT TO authenticated USING (public.is_admin());

INSERT INTO public.app_settings (key, value, updated_by)
VALUES ('ai_daily_ceiling_usd', '5'::jsonb, 'migration_039')
ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.ai_budget_ok() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT coalesce((SELECT cost_micros FROM public.ai_usage_daily WHERE day = (now() AT TIME ZONE 'utc')::date), 0)
       < coalesce((SELECT (value #>> '{}')::numeric FROM public.app_settings WHERE key = 'ai_daily_ceiling_usd'), 5) * 1000000;
$$;

CREATE OR REPLACE FUNCTION public.ai_record_usage(p_cost_micros bigint) RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  INSERT INTO public.ai_usage_daily (day, cost_micros, calls)
  VALUES ((now() AT TIME ZONE 'utc')::date, greatest(p_cost_micros, 0), 1)
  ON CONFLICT (day) DO UPDATE SET cost_micros = public.ai_usage_daily.cost_micros + EXCLUDED.cost_micros,
                                  calls = public.ai_usage_daily.calls + 1;
$$;

REVOKE ALL ON FUNCTION public.ai_budget_ok(), public.ai_record_usage(bigint) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ai_budget_ok(), public.ai_record_usage(bigint) TO service_role;

-- Admins may change the ceiling through set_setting.
CREATE OR REPLACE FUNCTION public.set_setting(p_key text, p_value jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $function$
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501'; END IF;
  IF p_key NOT IN ('auto_send', 'auto_apply_replies', 'reply_to', 'sandbox_mode', 'ai_daily_ceiling_usd') THEN
    RAISE EXCEPTION 'unknown setting %', p_key USING ERRCODE = '22023';
  END IF;
  UPDATE public.app_settings
  SET value = p_value, updated_at = NOW(), updated_by = auth.jwt() ->> 'email'
  WHERE key = p_key;
END;
$function$;

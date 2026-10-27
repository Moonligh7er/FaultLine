-- ============================================================
-- Migration 037: Sandbox mode for outbound delivery
-- ============================================================
-- app_settings.sandbox_mode (default off). While on, dispatch-outbound
-- delivers nothing to real authorities:
--   email      → Resend's test sink (delivered@resend.dev), original
--                recipient named in the subject
--   SeeClickFix → request type + answers are planned (read-only), no POST
--   Open311    → recorded as would-send, no POST
--   web form   → worker dry run (fills + screenshots, never submits)
-- and nothing is written to escalation_log (the public record of notice).
-- Sent rows carry sent_method 'sandbox:…'. Admin-only toggle.
-- ============================================================

INSERT INTO public.app_settings (key, value)
VALUES ('sandbox_mode', 'false'::jsonb)
ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.set_setting(p_key text, p_value jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501'; END IF;
  IF p_key NOT IN ('auto_send', 'auto_apply_replies', 'reply_to', 'sandbox_mode') THEN
    RAISE EXCEPTION 'unknown setting %', p_key USING ERRCODE = '22023';
  END IF;
  UPDATE public.app_settings
  SET value = p_value, updated_at = NOW(), updated_by = auth.jwt() ->> 'email'
  WHERE key = p_key;
END;
$function$;

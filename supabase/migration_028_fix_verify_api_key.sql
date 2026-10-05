-- ============================================================
-- Migration 028: Fix verify_api_key() column ambiguity
-- ============================================================
-- Migration 027's verify_api_key() returns a column named key_id, which
-- collided with api_key_usage.key_id inside the function body ("column
-- reference key_id is ambiguous"), so every call errored. Qualify the
-- table references.
-- ============================================================

CREATE OR REPLACE FUNCTION public.verify_api_key(p_key text)
RETURNS TABLE (key_id uuid, scopes text[], status text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
#variable_conflict use_column
DECLARE v public.api_keys; v_used integer;
BEGIN
  IF p_key IS NULL OR p_key !~ '^flk_[0-9a-f]{48}$' THEN
    RETURN QUERY SELECT NULL::uuid, NULL::text[], 'invalid'::text; RETURN;
  END IF;
  SELECT * INTO v FROM public.api_keys k
  WHERE k.key_hash = encode(extensions.digest(p_key, 'sha256'), 'hex') AND k.revoked_at IS NULL;
  IF v.id IS NULL THEN
    RETURN QUERY SELECT NULL::uuid, NULL::text[], 'invalid'::text; RETURN;
  END IF;
  SELECT count(*) INTO v_used FROM public.api_key_usage u
  WHERE u.key_id = v.id AND u.used_at > NOW() - INTERVAL '1 day';
  IF v_used >= v.daily_limit THEN
    RETURN QUERY SELECT v.id, v.scopes, 'over_limit'::text; RETURN;
  END IF;
  INSERT INTO public.api_key_usage (key_id) VALUES (v.id);
  UPDATE public.api_keys k SET last_used_at = NOW() WHERE k.id = v.id;
  RETURN QUERY SELECT v.id, v.scopes, 'ok'::text;
END;
$$;

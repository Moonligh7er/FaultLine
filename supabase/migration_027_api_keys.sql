-- ============================================================
-- Migration 027: API keys for read access (AI agents, tools, partners)
-- ============================================================
-- Keys look like flk_<48 hex>. Only a SHA-256 hash is stored; the plain key
-- is returned once by create_api_key() and never again.
--
-- Scopes:
--   read:public   — reports, clusters, authorities, escalation record
--                   (the same data the public site shows, in bulk)
--   read:internal — also the outbound queue and inbound replies
--
-- The web app's /api/v1 routes call verify_api_key() (usage-counted,
-- daily-capped) and, for internal data, the api_internal_* functions,
-- which re-verify the key and scope inside the database.
-- ============================================================

CREATE TABLE public.api_keys (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name         text NOT NULL,
  key_prefix   text NOT NULL,                 -- 'flk_' + first 8 hex, for recognition
  key_hash     text NOT NULL UNIQUE,          -- sha256 hex of the full key
  scopes       text[] NOT NULL DEFAULT ARRAY['read:public']
               CHECK (scopes <@ ARRAY['read:public', 'read:internal'] AND cardinality(scopes) > 0),
  daily_limit  integer NOT NULL DEFAULT 5000 CHECK (daily_limit > 0),
  created_by   text,
  created_at   timestamptz NOT NULL DEFAULT NOW(),
  last_used_at timestamptz,
  revoked_at   timestamptz
);
ALTER TABLE public.api_keys ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.api_keys FROM anon, authenticated;
CREATE POLICY "Admins read api keys" ON public.api_keys
  FOR SELECT TO authenticated USING (public.is_admin());
-- Never expose the hash, even to admins.
GRANT SELECT (id, name, key_prefix, scopes, daily_limit, created_by, created_at, last_used_at, revoked_at)
  ON public.api_keys TO authenticated;

CREATE TABLE public.api_key_usage (
  key_id  uuid NOT NULL REFERENCES public.api_keys(id) ON DELETE CASCADE,
  used_at timestamptz NOT NULL DEFAULT NOW()
);
CREATE INDEX api_key_usage_lookup ON public.api_key_usage (key_id, used_at DESC);
ALTER TABLE public.api_key_usage ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.api_key_usage FROM anon, authenticated;

CREATE FUNCTION public.create_api_key(p_name text, p_internal boolean DEFAULT false, p_daily_limit integer DEFAULT 5000)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE v_key text;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501'; END IF;
  IF coalesce(trim(p_name), '') = '' THEN RAISE EXCEPTION 'name required' USING ERRCODE = '22023'; END IF;
  v_key := 'flk_' || encode(extensions.gen_random_bytes(24), 'hex');
  INSERT INTO public.api_keys (name, key_prefix, key_hash, scopes, daily_limit, created_by)
  VALUES (
    trim(p_name),
    left(v_key, 12),
    encode(extensions.digest(v_key, 'sha256'), 'hex'),
    CASE WHEN p_internal THEN ARRAY['read:public', 'read:internal'] ELSE ARRAY['read:public'] END,
    p_daily_limit,
    auth.jwt() ->> 'email'
  );
  RETURN v_key; -- shown once; only the hash is kept
END;
$$;
REVOKE ALL ON FUNCTION public.create_api_key(text, boolean, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_api_key(text, boolean, integer) TO authenticated;

CREATE FUNCTION public.revoke_api_key(p_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501'; END IF;
  UPDATE public.api_keys SET revoked_at = NOW() WHERE id = p_id AND revoked_at IS NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.revoke_api_key(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.revoke_api_key(uuid) TO authenticated;

-- Validates a key, records one use, enforces the daily cap.
-- status: 'ok' | 'invalid' | 'over_limit'
CREATE FUNCTION public.verify_api_key(p_key text)
RETURNS TABLE (key_id uuid, scopes text[], status text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE v public.api_keys; v_used integer;
BEGIN
  IF p_key IS NULL OR p_key !~ '^flk_[0-9a-f]{48}$' THEN
    RETURN QUERY SELECT NULL::uuid, NULL::text[], 'invalid'; RETURN;
  END IF;
  SELECT * INTO v FROM public.api_keys
  WHERE key_hash = encode(extensions.digest(p_key, 'sha256'), 'hex') AND revoked_at IS NULL;
  IF v.id IS NULL THEN
    RETURN QUERY SELECT NULL::uuid, NULL::text[], 'invalid'; RETURN;
  END IF;
  SELECT count(*) INTO v_used FROM public.api_key_usage
  WHERE key_id = v.id AND used_at > NOW() - INTERVAL '1 day';
  IF v_used >= v.daily_limit THEN
    RETURN QUERY SELECT v.id, v.scopes, 'over_limit'; RETURN;
  END IF;
  INSERT INTO public.api_key_usage (key_id) VALUES (v.id);
  UPDATE public.api_keys SET last_used_at = NOW() WHERE id = v.id;
  RETURN QUERY SELECT v.id, v.scopes, 'ok';
END;
$$;
REVOKE ALL ON FUNCTION public.verify_api_key(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.verify_api_key(text) TO anon, authenticated, service_role;

-- Internal-scope reads. Each re-checks the key + scope itself (no usage
-- charge — the route already called verify_api_key for this request).
CREATE FUNCTION public.api_key_has_scope(p_key text, p_scope text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.api_keys
    WHERE key_hash = encode(extensions.digest(coalesce(p_key, ''), 'sha256'), 'hex')
      AND revoked_at IS NULL AND p_scope = ANY (scopes)
  );
$$;
REVOKE ALL ON FUNCTION public.api_key_has_scope(text, text) FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.api_internal_outbound(p_key text, p_status text DEFAULT NULL, p_limit integer DEFAULT 100)
RETURNS SETOF public.outbound_messages
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  IF NOT public.api_key_has_scope(p_key, 'read:internal') THEN
    RAISE EXCEPTION 'scope read:internal required' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY SELECT * FROM public.outbound_messages
    WHERE p_status IS NULL OR status = p_status
    ORDER BY created_at DESC LIMIT least(greatest(p_limit, 1), 500);
END;
$$;
REVOKE ALL ON FUNCTION public.api_internal_outbound(text, text, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.api_internal_outbound(text, text, integer) TO anon, authenticated;

CREATE FUNCTION public.api_internal_inbound(p_key text, p_status text DEFAULT NULL, p_limit integer DEFAULT 100)
RETURNS SETOF public.inbound_messages
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  IF NOT public.api_key_has_scope(p_key, 'read:internal') THEN
    RAISE EXCEPTION 'scope read:internal required' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY SELECT * FROM public.inbound_messages
    WHERE p_status IS NULL OR status = p_status
    ORDER BY received_at DESC LIMIT least(greatest(p_limit, 1), 500);
END;
$$;
REVOKE ALL ON FUNCTION public.api_internal_inbound(text, text, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.api_internal_inbound(text, text, integer) TO anon, authenticated;

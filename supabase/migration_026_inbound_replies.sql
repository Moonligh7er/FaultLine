-- ============================================================
-- Migration 026: Inbound replies from authorities
-- ============================================================
-- Outbound emails carry an [FL-XXXXXX] tag (outbound_messages.ref) in the
-- subject and Reply-To an address on the receiving subdomain. Resend
-- receives replies there and calls the inbound-email edge function, which
-- fetches the message from Resend's API, matches the tag, guesses a status
-- from the wording, and stores it here.
--
-- Status changes from replies are applied by an admin (review_inbound), or
-- automatically when app_settings.auto_apply_replies is on.
-- ============================================================

CREATE TABLE public.inbound_messages (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  resend_email_id  text NOT NULL UNIQUE,
  from_address     text,
  to_addresses     text[],
  subject          text,
  text_body        text,
  reply_excerpt    text,          -- new text only, quoted history stripped
  received_at      timestamptz NOT NULL DEFAULT NOW(),
  ref              text,          -- [FL-XXXXXX] found in subject/body
  outbound_id      uuid REFERENCES public.outbound_messages(id) ON DELETE SET NULL,
  cluster_id       uuid REFERENCES public.report_clusters(id) ON DELETE SET NULL,
  report_id        uuid REFERENCES public.reports(id) ON DELETE SET NULL,
  suggested_status text CHECK (suggested_status IN ('acknowledged', 'in_progress', 'resolved')),
  status           text NOT NULL DEFAULT 'pending_review'
                   CHECK (status IN ('unmatched', 'pending_review', 'applied', 'dismissed')),
  applied_status   text,
  reviewed_by      text,
  reviewed_at      timestamptz
);
CREATE INDEX inbound_by_status ON public.inbound_messages (status, received_at DESC);

ALTER TABLE public.inbound_messages ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.inbound_messages FROM anon, authenticated;
CREATE POLICY "Admins read inbound" ON public.inbound_messages
  FOR SELECT TO authenticated USING (public.is_admin());
GRANT SELECT ON public.inbound_messages TO authenticated;

-- Applies a status to the cluster and every report in it (or one report).
CREATE FUNCTION public.apply_inbound_status(p_inbound_id uuid, p_status text, p_by text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE v public.inbound_messages;
BEGIN
  IF p_status NOT IN ('acknowledged', 'in_progress', 'resolved') THEN
    RAISE EXCEPTION 'bad status %', p_status USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v FROM public.inbound_messages WHERE id = p_inbound_id FOR UPDATE;
  IF v.id IS NULL OR v.status NOT IN ('pending_review') THEN
    RAISE EXCEPTION 'reply is not awaiting review' USING ERRCODE = '22023';
  END IF;

  IF v.cluster_id IS NOT NULL THEN
    UPDATE public.report_clusters
    SET status = p_status,
        resolved_at = CASE WHEN p_status = 'resolved' THEN NOW() ELSE resolved_at END,
        updated_at = NOW()
    WHERE id = v.cluster_id;
    UPDATE public.reports r
    SET status = p_status,
        resolved_at = CASE WHEN p_status = 'resolved' THEN NOW() ELSE r.resolved_at END,
        updated_at = NOW()
    FROM public.cluster_reports cr
    WHERE cr.cluster_id = v.cluster_id AND cr.report_id = r.id
      AND r.status NOT IN ('resolved', 'closed', 'rejected');
  ELSIF v.report_id IS NOT NULL THEN
    UPDATE public.reports
    SET status = p_status,
        resolved_at = CASE WHEN p_status = 'resolved' THEN NOW() ELSE resolved_at END,
        updated_at = NOW()
    WHERE id = v.report_id;
  END IF;

  UPDATE public.inbound_messages
  SET status = 'applied', applied_status = p_status, reviewed_by = p_by, reviewed_at = NOW()
  WHERE id = p_inbound_id;
END;
$$;
REVOKE ALL ON FUNCTION public.apply_inbound_status(uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_inbound_status(uuid, text, text) TO service_role;

-- Admin decision on a reply: apply a status (defaults to the suggestion) or dismiss.
CREATE FUNCTION public.review_inbound(p_id uuid, p_apply boolean, p_status text DEFAULT NULL)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE v_suggested text; v_status text;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501'; END IF;
  IF NOT p_apply THEN
    UPDATE public.inbound_messages
    SET status = 'dismissed', reviewed_by = auth.jwt() ->> 'email', reviewed_at = NOW()
    WHERE id = p_id AND status IN ('pending_review', 'unmatched')
    RETURNING status INTO v_status;
    IF v_status IS NULL THEN RAISE EXCEPTION 'reply is not awaiting review' USING ERRCODE = '22023'; END IF;
    RETURN v_status;
  END IF;
  SELECT suggested_status INTO v_suggested FROM public.inbound_messages WHERE id = p_id;
  PERFORM public.apply_inbound_status(p_id, coalesce(p_status, v_suggested), auth.jwt() ->> 'email');
  RETURN 'applied';
END;
$$;
REVOKE ALL ON FUNCTION public.review_inbound(uuid, boolean, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.review_inbound(uuid, boolean, text) TO authenticated;

-- Migration 044: admin marks a hand-submitted web form (outbound row in
-- manual_pending with no escalation_log row, e.g. a single report) as sent
-- or failed. Used by the fault-line-web admin queue.
CREATE OR REPLACE FUNCTION public.mark_outbound_manual(p_id uuid, p_status text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501'; END IF;
  IF p_status NOT IN ('sent', 'failed') THEN RAISE EXCEPTION 'status must be sent or failed'; END IF;
  UPDATE public.outbound_messages
     SET status = p_status, sent_at = CASE WHEN p_status = 'sent' THEN now() ELSE sent_at END,
         sent_method = coalesce(sent_method, 'web_form_manual'),
         reviewed_by = auth.jwt() ->> 'email', reviewed_at = now(), updated_at = now()
   WHERE id = p_id AND status = 'manual_pending';
  IF NOT FOUND THEN RAISE EXCEPTION 'no manual web form waiting with that id'; END IF;
END $$;
REVOKE ALL ON FUNCTION public.mark_outbound_manual(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_outbound_manual(uuid, text) TO authenticated;

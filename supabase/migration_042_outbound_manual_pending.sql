-- Migration 042: web-form submissions waiting for a human are not "sent"
--
-- When a web form can't be submitted automatically, dispatch-outbound used
-- to mark the outbox row 'sent' and write escalation_log as if the authority
-- had been notified. Now the outbox row is 'manual_pending' and the
-- escalation_log row is 'pending' (no sent_at, cluster untouched) until an
-- admin submits the form and marks it from the queue. Only then does it
-- count as notice: outbox → 'sent', and a cluster escalation moves the
-- cluster to 'submitted' (what escalate_cluster() does for other channels).

ALTER TABLE public.outbound_messages DROP CONSTRAINT IF EXISTS outbound_messages_status_check;
ALTER TABLE public.outbound_messages ADD CONSTRAINT outbound_messages_status_check
  CHECK (status = ANY (ARRAY['pending_review', 'approved', 'sending', 'sent', 'failed', 'rejected', 'manual_pending']));

CREATE OR REPLACE FUNCTION public.mark_escalation_handled(p_log_id uuid, p_status text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE v_log public.escalation_log%ROWTYPE; v_out public.outbound_messages%ROWTYPE;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501'; END IF;
  IF p_status NOT IN ('sent', 'failed') THEN RAISE EXCEPTION 'bad status' USING ERRCODE = '22023'; END IF;

  SELECT * INTO v_log FROM public.escalation_log WHERE id = p_log_id FOR UPDATE;
  IF NOT FOUND THEN RETURN; END IF;

  UPDATE public.escalation_log
  SET status = p_status,
      sent_at = CASE WHEN p_status = 'sent' THEN NOW() ELSE NULL END,
      error_message = CASE WHEN p_status = 'failed' THEN 'Admin marked failed from queue' ELSE NULL END
  WHERE id = p_log_id;

  -- The outbox row waiting on this form (subject is "[FL-XXXXXX] ...").
  UPDATE public.outbound_messages o
  SET status = p_status,
      sent_at = CASE WHEN p_status = 'sent' THEN NOW() ELSE o.sent_at END,
      error = CASE WHEN p_status = 'failed' THEN 'Web form: admin marked failed' ELSE o.error END,
      updated_at = NOW()
  WHERE o.status = 'manual_pending'
    AND o.ref = substring(v_log.subject FROM '^\[(FL-[0-9A-Z]{6})\]')
  RETURNING * INTO v_out;

  IF p_status = 'sent' AND v_log.status = 'pending' AND v_out.kind = 'cluster_escalation' THEN
    UPDATE public.report_clusters
    SET status = 'submitted',
        submitted_at = NOW(),
        escalated_at = NOW(),
        submission_method = v_log.method,
        updated_at = NOW()
    WHERE id = v_log.cluster_id;
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.mark_escalation_handled(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_escalation_handled(uuid, text) TO authenticated;

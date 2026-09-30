-- ============================================================
-- Migration 022: Allow report-media uploads (mobile + web)
-- ============================================================
-- storage.objects had no policies at all, so every client upload
-- to the public `report-media` bucket was rejected by RLS — no
-- report from either client could carry a photo.
--
-- Upload flow (both clients, after this migration):
--   1. client generates the report UUID
--   2. uploads media to  reports/<uuid>/...  (thumbs under reports/<uuid>/thumbs/)
--   3. inserts the report row with that id and the media URLs
-- Media is attached in the INSERT, so no post-insert UPDATE is
-- needed (guests have no UPDATE rights on reports).
--
-- Guardrails on the INSERT policy:
--   • bucket must be report-media
--   • path must be reports/<uuid>/...
--   • cannot add files under a report older than 1 hour
-- The bucket itself enforces the 5 MB cap and MIME whitelist.
-- No UPDATE / DELETE policies: uploads are immutable to clients.
-- Reads go through the bucket's public URL, so no SELECT policy.
--
-- Also widen the bucket MIME list to match the web client's
-- ALLOWED_MIME (jpeg, png, gif, webp) plus mobile video (mp4).
-- ============================================================

CREATE POLICY "Report media uploads to reports/<uuid>/"
  ON storage.objects
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (
    bucket_id = 'report-media'
    AND (storage.foldername(name))[1] = 'reports'
    AND (storage.foldername(name))[2] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    AND NOT EXISTS (
      SELECT 1 FROM public.reports r
      WHERE r.id::text = (storage.foldername(name))[2]
        AND r.created_at < NOW() - INTERVAL '1 hour'
    )
  );

UPDATE storage.buckets
SET allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'video/mp4']
WHERE id = 'report-media';

-- ------------------------------------------------------------
-- Verification
-- ------------------------------------------------------------
-- SELECT policyname, cmd, roles FROM pg_policies
--   WHERE schemaname = 'storage' AND tablename = 'objects';
-- SELECT allowed_mime_types FROM storage.buckets WHERE id = 'report-media';

-- ============================================================
-- Report Clustering & Escalation System
-- ============================================================

-- ============================================================
-- REPORT CLUSTERS
-- Groups nearby reports of the same category into a single "issue"
-- ============================================================
CREATE TABLE report_clusters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category TEXT NOT NULL,
  centroid_latitude DOUBLE PRECISION NOT NULL,
  centroid_longitude DOUBLE PRECISION NOT NULL,
  centroid_point GEOGRAPHY(POINT, 4326),
  radius_meters REAL DEFAULT 50,
  report_count INTEGER DEFAULT 1,
  unique_reporters INTEGER DEFAULT 1,
  max_hazard_level TEXT DEFAULT 'minor',
  status TEXT NOT NULL DEFAULT 'unconfirmed'
    CHECK (status IN ('unconfirmed', 'confirmed', 'submitted', 'acknowledged', 'in_progress', 'resolved', 'closed')),
  authority_id UUID REFERENCES authorities(id),
  submitted_at TIMESTAMPTZ,
  submission_method TEXT,
  submission_reference TEXT,
  escalated_at TIMESTAMPTZ,
  city TEXT,
  state TEXT,
  address TEXT,
  first_reported_at TIMESTAMPTZ DEFAULT NOW(),
  last_reported_at TIMESTAMPTZ DEFAULT NOW(),
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_clusters_point ON report_clusters USING GIST(centroid_point);
CREATE INDEX idx_clusters_status ON report_clusters(status);
CREATE INDEX idx_clusters_state ON report_clusters(state);
CREATE INDEX idx_clusters_category ON report_clusters(category);

-- Auto-set geography point on cluster
CREATE OR REPLACE FUNCTION set_cluster_point()
RETURNS TRIGGER AS $$
BEGIN
  NEW.centroid_point := ST_SetSRID(ST_MakePoint(NEW.centroid_longitude, NEW.centroid_latitude), 4326)::geography;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_cluster_location_point
  BEFORE INSERT OR UPDATE ON report_clusters
  FOR EACH ROW EXECUTE FUNCTION set_cluster_point();

-- ============================================================
-- LINK TABLE: which reports belong to which cluster
-- ============================================================
CREATE TABLE cluster_reports (
  cluster_id UUID NOT NULL REFERENCES report_clusters(id) ON DELETE CASCADE,
  report_id UUID NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
  added_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (cluster_id, report_id)
);

-- ============================================================
-- ESCALATION LOG
-- Tracks every time we contact an authority about a cluster
-- ============================================================
CREATE TABLE escalation_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cluster_id UUID NOT NULL REFERENCES report_clusters(id),
  authority_id UUID REFERENCES authorities(id),
  method TEXT NOT NULL, -- 'email', 'api', 'web_form'
  recipient TEXT,       -- email address, API endpoint, etc.
  subject TEXT,
  body TEXT,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'sent', 'failed', 'acknowledged')),
  sent_at TIMESTAMPTZ,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- CORE FUNCTION: Assign a new report to an existing cluster
-- or create a new cluster
-- ============================================================
-- cluster_radius_m: how close reports must be to group together (default 50m)
-- Returns the cluster_id
CREATE OR REPLACE FUNCTION assign_report_to_cluster(
  p_report_id UUID,
  p_cluster_radius_m DOUBLE PRECISION DEFAULT 50
)
RETURNS UUID AS $$
DECLARE
  v_report RECORD;
  v_cluster RECORD;
  v_cluster_id UUID;
  v_unique_reporters INTEGER;
  v_hazard_priority INTEGER;
  v_current_priority INTEGER;
  v_max_hazard TEXT;
BEGIN
  -- Get the report
  SELECT * INTO v_report FROM reports WHERE id = p_report_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Report not found: %', p_report_id;
  END IF;

  -- Find an existing cluster within radius + same category
  SELECT rc.* INTO v_cluster
  FROM report_clusters rc
  WHERE rc.category = v_report.category
    AND rc.status NOT IN ('resolved', 'closed')
    AND ST_DWithin(
      rc.centroid_point,
      ST_SetSRID(ST_MakePoint(v_report.longitude, v_report.latitude), 4326)::geography,
      p_cluster_radius_m
    )
  ORDER BY ST_Distance(
    rc.centroid_point,
    ST_SetSRID(ST_MakePoint(v_report.longitude, v_report.latitude), 4326)::geography
  )
  LIMIT 1;

  IF v_cluster.id IS NOT NULL THEN
    -- Add report to existing cluster
    v_cluster_id := v_cluster.id;

    INSERT INTO cluster_reports (cluster_id, report_id)
    VALUES (v_cluster_id, p_report_id)
    ON CONFLICT DO NOTHING;

    -- Count unique reporters in this cluster
    SELECT COUNT(DISTINCT r.user_id) INTO v_unique_reporters
    FROM cluster_reports cr
    JOIN reports r ON r.id = cr.report_id
    WHERE cr.cluster_id = v_cluster_id
      AND r.user_id IS NOT NULL;

    -- Determine highest hazard level across all reports in cluster
    SELECT r.hazard_level INTO v_max_hazard
    FROM cluster_reports cr
    JOIN reports r ON r.id = cr.report_id
    WHERE cr.cluster_id = v_cluster_id
    ORDER BY
      CASE r.hazard_level
        WHEN 'extremely_dangerous' THEN 5
        WHEN 'dangerous' THEN 4
        WHEN 'significant' THEN 3
        WHEN 'moderate' THEN 2
        WHEN 'minor' THEN 1
        ELSE 0
      END DESC
    LIMIT 1;

    -- Update cluster stats
    UPDATE report_clusters
    SET report_count = report_count + 1,
        unique_reporters = COALESCE(v_unique_reporters, unique_reporters),
        max_hazard_level = COALESCE(v_max_hazard, max_hazard_level),
        last_reported_at = NOW(),
        updated_at = NOW(),
        -- Auto-confirm when 3+ unique reporters
        status = CASE
          WHEN status = 'unconfirmed' AND COALESCE(v_unique_reporters, 0) >= 3 THEN 'confirmed'
          ELSE status
        END
    WHERE id = v_cluster_id;

  ELSE
    -- Create a new cluster
    INSERT INTO report_clusters (
      category, centroid_latitude, centroid_longitude,
      max_hazard_level, authority_id, city, state, address
    ) VALUES (
      v_report.category, v_report.latitude, v_report.longitude,
      v_report.hazard_level, v_report.authority_id,
      v_report.city, v_report.state, v_report.address
    )
    RETURNING id INTO v_cluster_id;

    INSERT INTO cluster_reports (cluster_id, report_id)
    VALUES (v_cluster_id, p_report_id);
  END IF;

  -- Link the report back to its cluster
  UPDATE reports SET
    submission_reference = v_cluster_id::text,
    updated_at = NOW()
  WHERE id = p_report_id;

  RETURN v_cluster_id;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- AUTO-TRIGGER: Assign cluster when a report is created
-- ============================================================
CREATE OR REPLACE FUNCTION auto_cluster_on_insert()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM assign_report_to_cluster(NEW.id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_auto_cluster
  AFTER INSERT ON reports
  FOR EACH ROW EXECUTE FUNCTION auto_cluster_on_insert();

-- ============================================================
-- ESCALATION CHECK: Find clusters ready to email officials
-- Called on a schedule (e.g., daily via pg_cron or Supabase Edge Function)
--
-- Rules:
--   1. Cluster is "confirmed" (3+ unique reporters)
--   2. Cluster has 10+ total reports AND is at least 30 days old
--   3. Has not already been submitted/escalated
-- ============================================================
CREATE OR REPLACE FUNCTION get_clusters_ready_for_escalation()
RETURNS SETOF report_clusters AS $$
BEGIN
  RETURN QUERY
    SELECT *
    FROM report_clusters
    WHERE status = 'confirmed'
      AND report_count >= 10
      AND first_reported_at <= NOW() - INTERVAL '30 days'
      AND submitted_at IS NULL
    ORDER BY report_count DESC, max_hazard_level DESC;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- MARK CLUSTER AS ESCALATED
-- ============================================================
CREATE OR REPLACE FUNCTION escalate_cluster(
  p_cluster_id UUID,
  p_method TEXT,
  p_recipient TEXT,
  p_subject TEXT,
  p_body TEXT
)
RETURNS UUID AS $$
DECLARE
  v_log_id UUID;
  v_cluster RECORD;
BEGIN
  SELECT * INTO v_cluster FROM report_clusters WHERE id = p_cluster_id;

  -- Create escalation log entry
  INSERT INTO escalation_log (cluster_id, authority_id, method, recipient, subject, body, status, sent_at)
  VALUES (p_cluster_id, v_cluster.authority_id, p_method, p_recipient, p_subject, p_body, 'sent', NOW())
  RETURNING id INTO v_log_id;

  -- Update cluster status
  UPDATE report_clusters
  SET status = 'submitted',
      submitted_at = NOW(),
      escalated_at = NOW(),
      submission_method = p_method,
      updated_at = NOW()
  WHERE id = p_cluster_id;

  RETURN v_log_id;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- HELPER: Get cluster summary for email generation
-- ============================================================
CREATE OR REPLACE FUNCTION get_cluster_summary(p_cluster_id UUID)
RETURNS TABLE (
  cluster_id UUID,
  category TEXT,
  address TEXT,
  city TEXT,
  state TEXT,
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  report_count INTEGER,
  unique_reporters INTEGER,
  max_hazard TEXT,
  first_reported DATE,
  last_reported DATE,
  days_open INTEGER,
  authority_name TEXT,
  sample_descriptions TEXT[]
) AS $$
BEGIN
  RETURN QUERY
    SELECT
      rc.id,
      rc.category,
      rc.address,
      rc.city,
      rc.state,
      rc.centroid_latitude,
      rc.centroid_longitude,
      rc.report_count,
      rc.unique_reporters,
      rc.max_hazard_level,
      rc.first_reported_at::date,
      rc.last_reported_at::date,
      EXTRACT(DAY FROM NOW() - rc.first_reported_at)::integer,
      a.name,
      ARRAY(
        SELECT r.description
        FROM cluster_reports cr2
        JOIN reports r ON r.id = cr2.report_id
        WHERE cr2.cluster_id = rc.id
          AND r.description IS NOT NULL
          AND r.description != ''
        LIMIT 5
      )
    FROM report_clusters rc
    LEFT JOIN authorities a ON a.id = rc.authority_id
    WHERE rc.id = p_cluster_id;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- RLS for new tables
-- ============================================================
ALTER TABLE report_clusters ENABLE ROW LEVEL SECURITY;
ALTER TABLE cluster_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE escalation_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Clusters viewable by everyone" ON report_clusters FOR SELECT USING (true);
CREATE POLICY "Cluster reports viewable by everyone" ON cluster_reports FOR SELECT USING (true);
CREATE POLICY "Escalation log viewable by everyone" ON escalation_log FOR SELECT USING (true);

-- ============================================================
-- Civic Infrastructure Reporter - Supabase Database Schema
-- ============================================================

-- Enable PostGIS for geospatial queries
CREATE EXTENSION IF NOT EXISTS postgis;

-- ============================================================
-- PROFILES
-- ============================================================
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT,
  avatar_url TEXT,
  total_reports INTEGER DEFAULT 0,
  total_upvotes INTEGER DEFAULT 0,
  total_confirms INTEGER DEFAULT 0,
  points INTEGER DEFAULT 0,
  badges JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO profiles (id, display_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1)));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ============================================================
-- AUTHORITIES
-- ============================================================
CREATE TABLE authorities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  level TEXT NOT NULL CHECK (level IN ('federal', 'state', 'county', 'city', 'town')),
  state TEXT NOT NULL,
  city TEXT,
  county TEXT,
  submission_methods JSONB DEFAULT '[]'::jsonb,
  boundary_geojson JSONB,
  response_time_avg_days REAL,
  fix_rate_percent REAL,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_authorities_state ON authorities(state);
CREATE INDEX idx_authorities_city ON authorities(state, city);
CREATE INDEX idx_authorities_level ON authorities(level);

-- ============================================================
-- REPORTS
-- ============================================================
CREATE TABLE reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id),
  category TEXT NOT NULL,
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  address TEXT,
  city TEXT,
  state TEXT,
  zip TEXT,
  description TEXT,
  size_rating TEXT NOT NULL CHECK (size_rating IN ('small', 'medium', 'large', 'massive')),
  hazard_level TEXT NOT NULL CHECK (hazard_level IN ('minor', 'moderate', 'significant', 'dangerous', 'extremely_dangerous')),
  media JSONB DEFAULT '[]'::jsonb,
  vehicle_damage JSONB,
  status TEXT NOT NULL DEFAULT 'submitted' CHECK (status IN ('draft', 'submitted', 'acknowledged', 'in_progress', 'resolved', 'closed', 'rejected')),
  authority_id UUID REFERENCES authorities(id),
  submission_method TEXT,
  submission_reference TEXT,
  upvote_count INTEGER DEFAULT 0,
  confirm_count INTEGER DEFAULT 0,
  is_anonymous BOOLEAN DEFAULT FALSE,
  sensor_detected BOOLEAN DEFAULT FALSE,
  offline_queued BOOLEAN DEFAULT FALSE,
  location_point GEOGRAPHY(POINT, 4326),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  resolved_at TIMESTAMPTZ
);

-- Auto-populate geography point
CREATE OR REPLACE FUNCTION set_report_point()
RETURNS TRIGGER AS $$
BEGIN
  NEW.location_point := ST_SetSRID(ST_MakePoint(NEW.longitude, NEW.latitude), 4326)::geography;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_report_location_point
  BEFORE INSERT OR UPDATE ON reports
  FOR EACH ROW EXECUTE FUNCTION set_report_point();

CREATE INDEX idx_reports_location ON reports USING GIST(location_point);
CREATE INDEX idx_reports_status ON reports(status);
CREATE INDEX idx_reports_category ON reports(category);
CREATE INDEX idx_reports_state ON reports(state);
CREATE INDEX idx_reports_city ON reports(state, city);
CREATE INDEX idx_reports_user ON reports(user_id);
CREATE INDEX idx_reports_created ON reports(created_at DESC);

-- ============================================================
-- REPORT VOTES (upvotes & confirms)
-- ============================================================
CREATE TABLE report_votes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id UUID NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id),
  vote_type TEXT NOT NULL CHECK (vote_type IN ('upvote', 'confirm')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(report_id, user_id, vote_type)
);

CREATE INDEX idx_report_votes_report ON report_votes(report_id);

-- ============================================================
-- RPC FUNCTIONS
-- ============================================================

-- Get nearby reports within a radius (km)
CREATE OR REPLACE FUNCTION get_nearby_reports(lat DOUBLE PRECISION, lng DOUBLE PRECISION, radius_km DOUBLE PRECISION DEFAULT 5)
RETURNS SETOF reports AS $$
BEGIN
  RETURN QUERY
    SELECT *
    FROM reports
    WHERE ST_DWithin(
      location_point,
      ST_SetSRID(ST_MakePoint(lng, lat), 4326)::geography,
      radius_km * 1000
    )
    ORDER BY created_at DESC
    LIMIT 100;
END;
$$ LANGUAGE plpgsql;

-- Increment upvote count
CREATE OR REPLACE FUNCTION increment_upvote(report_id UUID)
RETURNS VOID AS $$
BEGIN
  UPDATE reports SET upvote_count = upvote_count + 1, updated_at = NOW()
  WHERE id = report_id;
END;
$$ LANGUAGE plpgsql;

-- Increment confirm count
CREATE OR REPLACE FUNCTION increment_confirm(report_id UUID)
RETURNS VOID AS $$
BEGIN
  UPDATE reports SET confirm_count = confirm_count + 1, updated_at = NOW()
  WHERE id = report_id;
END;
$$ LANGUAGE plpgsql;

-- Find authority by geographic point (boundary lookup)
CREATE OR REPLACE FUNCTION find_authority_by_point(lat DOUBLE PRECISION, lng DOUBLE PRECISION)
RETURNS SETOF authorities AS $$
BEGIN
  RETURN QUERY
    SELECT *
    FROM authorities
    WHERE boundary_geojson IS NOT NULL
      AND is_active = TRUE
      AND ST_Contains(
        ST_SetSRID(ST_GeomFromGeoJSON(boundary_geojson::text), 4326),
        ST_SetSRID(ST_MakePoint(lng, lat), 4326)
      )
    ORDER BY
      CASE level
        WHEN 'town' THEN 1
        WHEN 'city' THEN 2
        WHEN 'county' THEN 3
        WHEN 'state' THEN 4
        WHEN 'federal' THEN 5
      END
    LIMIT 1;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE report_votes ENABLE ROW LEVEL SECURITY;
ALTER TABLE authorities ENABLE ROW LEVEL SECURITY;

-- Profiles: users can read all, update own
CREATE POLICY "Profiles are viewable by everyone" ON profiles FOR SELECT USING (true);
CREATE POLICY "Users can update own profile" ON profiles FOR UPDATE USING (auth.uid() = id);

-- Reports: everyone can read, authenticated can insert, owners can update
CREATE POLICY "Reports are viewable by everyone" ON reports FOR SELECT USING (true);
CREATE POLICY "Authenticated users can create reports" ON reports FOR INSERT WITH CHECK (true);
CREATE POLICY "Users can update own reports" ON reports FOR UPDATE USING (auth.uid() = user_id);

-- Votes: everyone can read, authenticated can insert own
CREATE POLICY "Votes are viewable by everyone" ON report_votes FOR SELECT USING (true);
CREATE POLICY "Authenticated users can vote" ON report_votes FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Authorities: everyone can read
CREATE POLICY "Authorities are viewable by everyone" ON authorities FOR SELECT USING (true);

CREATE EXTENSION IF NOT EXISTS postgis;

CREATE TABLE IF NOT EXISTS regions (
  id text PRIMARY KEY,
  name text NOT NULL,
  fixture boolean NOT NULL DEFAULT false,
  geometry geometry(MultiPolygon, 4326) NOT NULL,
  provenance jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS pois (
  id text PRIMARY KEY,
  name text NOT NULL,
  category text NOT NULL CHECK (category IN ('chest', 'oddity', 'puzzle', 'quest')),
  region_id text NOT NULL REFERENCES regions(id) ON DELETE CASCADE,
  subregion text NOT NULL DEFAULT '',
  location geometry(Point, 4326) NOT NULL,
  floor text NOT NULL DEFAULT 'Surface',
  entrance text NOT NULL DEFAULT '',
  entrance_location geometry(Point, 4326),
  nearest_landmark text NOT NULL DEFAULT '',
  requirements jsonb NOT NULL DEFAULT '[]'::jsonb,
  navigation_steps jsonb NOT NULL DEFAULT '[]'::jsonb,
  solution_steps jsonb NOT NULL DEFAULT '[]'::jsonb,
  common_mistake text NOT NULL DEFAULT '',
  provenance jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS pois_location_gix ON pois USING GIST (location);
CREATE INDEX IF NOT EXISTS pois_region_category_idx ON pois (region_id, category);

CREATE TABLE IF NOT EXISTS player_progress (
  poi_id text PRIMARY KEY REFERENCES pois(id) ON DELETE CASCADE,
  status text NOT NULL CHECK (status IN ('completed', 'not_completed', 'uncertain')),
  updated_at timestamptz NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS analysis_cache (
  cache_key text PRIMARY KEY,
  result jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT NOW()
);

INSERT INTO settings (key, value)
VALUES (
  'global',
  '{"language":"en","ai_model":"google/gemma-4-26b-a4b-it:free","game_patch":"official-live","kb_version":"official-map-v1"}'::jsonb
)
ON CONFLICT (key) DO NOTHING;

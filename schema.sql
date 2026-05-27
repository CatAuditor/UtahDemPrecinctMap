-- Run once per client database to set up the schema.
-- Works with Neon, Supabase, or any PostgreSQL >= 14.

CREATE TABLE IF NOT EXISTS candidates (
  id             SERIAL PRIMARY KEY,
  name           TEXT    NOT NULL,
  photo_url      TEXT,
  bio            TEXT,
  website        TEXT,
  volunteer_url  TEXT,
  donate_url     TEXT,
  office         TEXT,           -- e.g. "State House", "State Senate", "U.S. Congress"
  district_type  TEXT NOT NULL,  -- 'house' | 'senate' | 'congress' | 'school_board' | 'precinct'
  district_value TEXT NOT NULL,  -- district number or precinct ID as stored in GIS data
  active         BOOLEAN  DEFAULT true,
  display_order  INTEGER  DEFAULT 0,
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  updated_at     TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS candidates_district_idx
  ON candidates (district_type, district_value, active);

CREATE TABLE IF NOT EXISTS volunteer_signups (
  id                 SERIAL PRIMARY KEY,
  first_name         TEXT NOT NULL,
  last_name          TEXT,
  email              TEXT NOT NULL,
  phone              TEXT,
  precinct_name      TEXT,
  precinct_id        TEXT,
  county             TEXT,
  house_district     TEXT,
  senate_district    TEXT,
  congress_district  TEXT,
  address_input      TEXT,
  source_url         TEXT,
  webhook_sent       BOOLEAN DEFAULT false,
  webhook_status     TEXT,
  created_at         TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS volunteer_email_idx ON volunteer_signups (email);
CREATE INDEX IF NOT EXISTS volunteer_created_idx ON volunteer_signups (created_at DESC);

-- 0001_core: identity, profile, consent, privacy, companion, memory, conversations, journal, mood, plan, safety.
-- Forward-only. Personal content columns end in _enc and hold AES-256-GCM ciphertext (see crypto/envelope.ts).
-- Isolation: every per-user table has row-level security keyed on app_user_id(). The API connects as the table
-- owner and runs user work inside a transaction that does SET LOCAL ROLE saathi_app plus set_config('app.user_id').
-- saathi_app has no BYPASSRLS. Auth/scheduler work runs as the owner and is the only code touching the system tables.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'saathi_app') THEN
    CREATE ROLE saathi_app NOLOGIN NOBYPASSRLS;
  END IF;
END $$;
-- Allow the connecting (owner) role to SET ROLE saathi_app. Ignored if it already can.
DO $$
BEGIN
  EXECUTE format('GRANT saathi_app TO %I', current_user);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;
GRANT USAGE ON SCHEMA public TO saathi_app;

CREATE OR REPLACE FUNCTION app_user_id() RETURNS uuid
LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('app.user_id', true), '')::uuid $$;

-- ---------------------------------------------------------------- identity
CREATE TABLE users (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_hash       bytea UNIQUE,            -- HMAC of the E.164 number, for sign-in lookup
  phone_enc        bytea,                   -- encrypted E.164, for masked display and (later) outbound calls
  google_hash      bytea UNIQUE,            -- HMAC of the Google subject
  dek_wrapped      bytea NOT NULL,          -- per-user data key wrapped by DATA_KEK
  nickname         text NOT NULL DEFAULT '' CHECK (char_length(nickname) <= 24),
  language         text NOT NULL DEFAULT 'en' CHECK (language IN ('en','hinglish','hi')),
  timezone         text NOT NULL DEFAULT 'Asia/Kolkata',
  city             text,
  age_confirmed_18 boolean NOT NULL DEFAULT false,
  dob_year         int CHECK (dob_year IS NULL OR dob_year BETWEEN 1900 AND 2100),
  subscription     text NOT NULL DEFAULT 'basic' CHECK (subscription IN ('basic','plus')),
  onboarded_at     timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),
  deletion_requested_at timestamptz,        -- account removal within 30 days (PRD 5.2)
  deleted_at       timestamptz,
  CHECK (phone_hash IS NOT NULL OR google_hash IS NOT NULL)
);
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
CREATE POLICY own ON users FOR ALL TO saathi_app USING (id = app_user_id()) WITH CHECK (id = app_user_id());
GRANT SELECT, UPDATE ON users TO saathi_app;
-- Columns the app role may not change itself.
REVOKE UPDATE ON users FROM saathi_app;
GRANT UPDATE (nickname, language, timezone, city, age_confirmed_18, dob_year, onboarded_at, deletion_requested_at) ON users TO saathi_app;

-- System tables: owner only. saathi_app gets no grants.
CREATE TABLE otp_challenges (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  target_hash bytea NOT NULL,
  code_hash   text NOT NULL,
  expires_at  timestamptz NOT NULL,
  attempts    int NOT NULL DEFAULT 0,
  consumed_at timestamptz,
  ip_hash     text,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX otp_target_idx ON otp_challenges (target_hash, created_at DESC);

CREATE TABLE refresh_tokens (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  family_id   uuid NOT NULL,
  token_hash  text NOT NULL UNIQUE,
  device_label text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  expires_at  timestamptz NOT NULL,
  revoked_at  timestamptz,
  replaced_by uuid
);
CREATE INDEX refresh_user_idx ON refresh_tokens (user_id);
CREATE INDEX refresh_family_idx ON refresh_tokens (family_id);

-- ---------------------------------------------------------------- consent, privacy, companion
CREATE TABLE consents (
  user_id        uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  version        int NOT NULL DEFAULT 1,
  accepted_at    timestamptz,
  remember       boolean NOT NULL DEFAULT false,
  notifications  boolean NOT NULL DEFAULT false,
  calls          boolean NOT NULL DEFAULT false,
  health_data    boolean NOT NULL DEFAULT false,
  location       text NOT NULL DEFAULT 'off' CHECK (location IN ('off','city','precise')),
  improve_models boolean NOT NULL DEFAULT false,
  updated_at     timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE privacy_settings (
  user_id               uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  lock_screen_previews  boolean NOT NULL DEFAULT false,
  discreet_mode         boolean NOT NULL DEFAULT false,
  app_lock              text NOT NULL DEFAULT 'off' CHECK (app_lock IN ('off','biometric','pin')),
  quick_hide            boolean NOT NULL DEFAULT true,
  transcript_retention_days int NOT NULL DEFAULT 90 CHECK (transcript_retention_days IN (0,7,30,90,36500)),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE companions (
  user_id     uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  name        text NOT NULL DEFAULT 'Saathi' CHECK (char_length(name) BETWEEN 1 AND 24),
  look        text NOT NULL DEFAULT 'asha' CHECK (look IN ('orb','asha','dev','noor','kabir')),
  voice       text NOT NULL DEFAULT 'warm' CHECK (voice IN ('warm','steady','bright')),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE trusted_contacts (
  user_id    uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  data_enc   bytea NOT NULL,                 -- {name, phone, relation}
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------- memory
CREATE TABLE memories (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  theme        text NOT NULL CHECK (theme IN ('People','Work and study','Sleep','What helps','Feelings','Plans')),
  text_enc     bytea NOT NULL,
  sensitive    boolean NOT NULL DEFAULT false,
  source       text NOT NULL CHECK (source IN ('chat','call','journal','onboarding')),
  source_id    uuid,
  hidden       boolean NOT NULL DEFAULT false,
  created_at   timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz
);
CREATE INDEX memories_user_idx ON memories (user_id, hidden, created_at DESC);

-- ---------------------------------------------------------------- conversations
CREATE TABLE conversations (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  mode        text NOT NULL CHECK (mode IN ('voice','video','text','sit','checkin','walk')),
  started_at  timestamptz NOT NULL DEFAULT now(),
  ended_at    timestamptz,
  summary_enc bytea,
  risk_max    smallint NOT NULL DEFAULT 0 CHECK (risk_max BETWEEN 0 AND 3),
  continued_from uuid REFERENCES conversations(id) ON DELETE SET NULL
);
CREATE INDEX conversations_user_idx ON conversations (user_id, started_at DESC);

CREATE TABLE messages (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  role            text NOT NULL CHECK (role IN ('user','ai','system')),
  text_enc        bytea NOT NULL,
  risk_level      smallint NOT NULL DEFAULT 0 CHECK (risk_level BETWEEN 0 AND 3),
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX messages_conv_idx ON messages (conversation_id, created_at);
CREATE INDEX messages_user_created_idx ON messages (user_id, created_at);

-- ---------------------------------------------------------------- journal, mood, plan, wins
CREATE TABLE journal_entries (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  mode        text NOT NULL CHECK (mode IN ('written','spoken')),
  prompt_enc  bytea,
  text_enc    bytea NOT NULL,
  mood        smallint NOT NULL DEFAULT 2 CHECK (mood BETWEEN 0 AND 4),
  shared      boolean NOT NULL DEFAULT false,   -- "Saathi can learn from this"
  analysis_enc bytea,                           -- present only while a review is pending; deleted on Done / keep-private
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX journal_user_idx ON journal_entries (user_id, created_at DESC);

CREATE TABLE mood_logs (
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  day        date NOT NULL,
  value      smallint NOT NULL CHECK (value BETWEEN 0 AND 4),
  source     text NOT NULL CHECK (source IN ('tap','checkin','journal')),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, day)               -- latest wins for the day
);

CREATE TABLE plan_items (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  day        date NOT NULL,
  label_enc  bytea NOT NULL,
  source     text NOT NULL CHECK (source IN ('ai','user','journal','checkin')),
  done       boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX plan_user_day_idx ON plan_items (user_id, day);

CREATE TABLE wins (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind       text NOT NULL CHECK (kind IN ('walk','event','plan','calm','checkin','other')),
  label_enc  bytea NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX wins_user_idx ON wins (user_id, created_at DESC);

CREATE TABLE letters (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  week_start date NOT NULL,
  body_enc   bytea NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, week_start)
);

-- ---------------------------------------------------------------- safety
CREATE TABLE safety_plans (
  user_id    uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  data_enc   bytea NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Level, time and mode only (PRD 6.4 step 4). Append-only for the app role: it can write but never read these back.
CREATE TABLE safety_events (
  id         bigserial PRIMARY KEY,
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  level      smallint NOT NULL CHECK (level BETWEEN 0 AND 3),
  mode       text NOT NULL,
  source     text NOT NULL CHECK (source IN ('prefilter','classifier','output_check','journal','user_action')),
  action     text CHECK (action IN ('helpline','contact','safe','emergency')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX safety_events_user_idx ON safety_events (user_id, created_at DESC);

-- ---------------------------------------------------------------- notifications, devices, calm sessions
CREATE TABLE notification_prefs (
  user_id        uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  quiet_cards    boolean NOT NULL DEFAULT true,
  push           boolean NOT NULL DEFAULT false,
  calls          boolean NOT NULL DEFAULT false,
  sunday_letter  boolean NOT NULL DEFAULT false,
  checkin_time   text NOT NULL DEFAULT 'evening' CHECK (checkin_time IN ('morning','evening','off')),
  quiet_start    time NOT NULL DEFAULT '22:00',
  quiet_end      time NOT NULL DEFAULT '08:00',
  follow_up_after_hard_day boolean NOT NULL DEFAULT false,
  updated_at     timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE devices (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  platform    text NOT NULL CHECK (platform IN ('web','ios','android')),
  token_enc   bytea NOT NULL,                 -- push subscription JSON or device token
  token_hash  bytea NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, token_hash)
);

CREATE TABLE calm_sessions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  item_id       text NOT NULL,
  started_at    timestamptz NOT NULL DEFAULT now(),
  completed_pct smallint NOT NULL DEFAULT 0 CHECK (completed_pct BETWEEN 0 AND 100),
  bg_sound      text,
  timer_minutes int
);
CREATE INDEX calm_sessions_user_idx ON calm_sessions (user_id, started_at DESC);

CREATE TABLE event_interests (
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  event_id   text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, event_id)
);

CREATE TABLE usage_daily (
  user_id       uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  day           date NOT NULL,
  voice_seconds int NOT NULL DEFAULT 0,
  turns         int NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, day)
);

CREATE TABLE audit_log (
  id         bigserial PRIMARY KEY,
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  action     text NOT NULL,
  before     jsonb,
  after      jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_user_idx ON audit_log (user_id, created_at DESC);

-- ---------------------------------------------------------------- RLS for every per-user table
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'consents','privacy_settings','companions','trusted_contacts','memories','conversations','messages',
    'journal_entries','mood_logs','plan_items','wins','letters','safety_plans','notification_prefs','devices',
    'calm_sessions','event_interests','usage_daily'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY own ON %I FOR ALL TO saathi_app USING (user_id = app_user_id()) WITH CHECK (user_id = app_user_id())', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I TO saathi_app', t);
  END LOOP;
END $$;

-- safety_events: insert-only for the app role (audit trail it cannot read or rewrite).
ALTER TABLE safety_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY insert_own ON safety_events FOR INSERT TO saathi_app WITH CHECK (user_id = app_user_id());
GRANT INSERT ON safety_events TO saathi_app;
GRANT USAGE ON SEQUENCE safety_events_id_seq TO saathi_app;

-- audit_log: the app role may append and read its own entries, never edit or delete them.
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY insert_own ON audit_log FOR INSERT TO saathi_app WITH CHECK (user_id = app_user_id());
CREATE POLICY read_own ON audit_log FOR SELECT TO saathi_app USING (user_id = app_user_id());
GRANT INSERT, SELECT ON audit_log TO saathi_app;
GRANT USAGE ON SEQUENCE audit_log_id_seq TO saathi_app;

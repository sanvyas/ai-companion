-- Admin portal and developer platform (docs/ADMIN.md). Everything here is owner-only: the app role (saathi_app)
-- gets no grants, and row security is on so a hosted Data API role also sees nothing.

-- ---------------------------------------------------------------- admin accounts, sessions, audit
CREATE TABLE admin_users (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email           text NOT NULL UNIQUE CHECK (email = lower(email)),
  name            text NOT NULL,
  role            text NOT NULL CHECK (role IN ('owner','engineer','support','viewer')),
  password_hash   text NOT NULL,                 -- scrypt$N$r$p$salt$hash
  totp_secret_enc bytea,                         -- sealed with the platform key
  totp_enabled    boolean NOT NULL DEFAULT false,
  totp_last_step  bigint,                        -- replay guard: a code is accepted once
  active          boolean NOT NULL DEFAULT true,
  failed_logins   int NOT NULL DEFAULT 0,
  locked_until    timestamptz,
  last_login_at   timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE admin_sessions (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash   bytea NOT NULL UNIQUE,            -- sha256 of the cookie value
  admin_id     uuid NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
  csrf_token   text NOT NULL,
  mfa_done     boolean NOT NULL DEFAULT false,   -- password accepted but the second factor still pending
  created_at   timestamptz NOT NULL DEFAULT now(),
  expires_at   timestamptz NOT NULL,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  ip           text,
  user_agent   text,
  revoked_at   timestamptz
);
CREATE INDEX admin_sessions_admin_idx ON admin_sessions (admin_id);

CREATE TABLE admin_audit (
  id          bigserial PRIMARY KEY,
  admin_id    uuid REFERENCES admin_users(id) ON DELETE SET NULL,
  admin_email text NOT NULL,
  action      text NOT NULL,
  target      text,
  before      jsonb,
  after       jsonb,
  ip          text,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX admin_audit_idx ON admin_audit (created_at DESC);
CREATE FUNCTION admin_audit_immutable() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'admin_audit is append-only'; END $$;
CREATE TRIGGER admin_audit_no_change BEFORE UPDATE OR DELETE ON admin_audit FOR EACH ROW EXECUTE FUNCTION admin_audit_immutable();

-- ---------------------------------------------------------------- runtime settings, flags, secrets
CREATE TABLE app_settings (
  key        text PRIMARY KEY,
  value      jsonb NOT NULL,
  updated_by text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE feature_flags (
  key         text PRIMARY KEY,
  description text NOT NULL DEFAULT '',
  enabled     boolean NOT NULL DEFAULT false,
  rollout_pct int NOT NULL DEFAULT 100 CHECK (rollout_pct BETWEEN 0 AND 100),
  updated_by  text,
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE flag_overrides (
  key     text NOT NULL REFERENCES feature_flags(key) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  enabled boolean NOT NULL,
  PRIMARY KEY (key, user_id)
);

CREATE TABLE integration_secrets (
  provider       text NOT NULL,
  name           text NOT NULL,
  ciphertext     bytea NOT NULL,                 -- sealed with the platform key; never returned by any API
  last4          text NOT NULL,
  updated_by     text,
  updated_at     timestamptz NOT NULL DEFAULT now(),
  last_test_at   timestamptz,
  last_test_ok   boolean,
  last_test_note text,
  PRIMARY KEY (provider, name)
);

-- ---------------------------------------------------------------- prompts and evals
CREATE TABLE prompt_versions (
  id           bigserial PRIMARY KEY,
  key          text NOT NULL,
  version      int NOT NULL,
  body         text NOT NULL,
  note         text NOT NULL DEFAULT '',
  status       text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','active','archived')),
  created_by   text NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  published_by text,
  published_at timestamptz,
  eval_run_id  bigint,
  UNIQUE (key, version)
);
CREATE UNIQUE INDEX prompt_active_idx ON prompt_versions (key) WHERE status = 'active';

CREATE TABLE eval_cases (
  id     bigserial PRIMARY KEY,
  suite  text NOT NULL,
  label  text NOT NULL,
  input  text NOT NULL,
  expect jsonb NOT NULL,
  active boolean NOT NULL DEFAULT true,
  UNIQUE (suite, label)
);
CREATE TABLE eval_runs (
  id                bigserial PRIMARY KEY,
  suite             text NOT NULL,
  prompt_key        text,
  prompt_version_id bigint,
  model             text,
  started_by        text,
  passed            int NOT NULL DEFAULT 0,
  failed            int NOT NULL DEFAULT 0,
  total             int NOT NULL DEFAULT 0,
  results           jsonb NOT NULL DEFAULT '[]',
  cost_inr          numeric,
  created_at        timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------- cost
CREATE TABLE pricing_rates (
  id          bigserial PRIMARY KEY,
  provider    text NOT NULL,                     -- same string usage_events.provider holds, e.g. anthropic:claude-sonnet-5-5
  unit        text NOT NULL CHECK (unit IN ('input_mtok','output_mtok','cache_read_mtok','cache_write_mtok','per_1k_chars','per_hour','per_message')),
  rate        numeric NOT NULL CHECK (rate >= 0),
  currency    text NOT NULL CHECK (currency IN ('INR','USD')),
  source_note text NOT NULL DEFAULT '',
  verified    boolean NOT NULL DEFAULT false,
  updated_by  text,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider, unit)
);

ALTER TABLE usage_events
  ADD COLUMN model       text,
  ADD COLUMN in_tokens   int,
  ADD COLUMN out_tokens  int,
  ADD COLUMN cache_read  int,
  ADD COLUMN cache_write int,
  ADD COLUMN chars       int,
  ADD COLUMN seconds     numeric,
  ADD COLUMN cost_inr    numeric;               -- NULL = no rate was set when this was recorded
CREATE INDEX usage_events_provider_idx ON usage_events (provider, created_at);

-- ---------------------------------------------------------------- product analytics (consent gated, no content)
CREATE TABLE analytics_events (
  id          bigserial PRIMARY KEY,
  created_at  timestamptz NOT NULL DEFAULT now(),
  anon_id     text NOT NULL,                     -- keyed hash of the user id, not reversible from here
  session_id  text NOT NULL,
  name        text NOT NULL,
  screen      text,
  el          text,
  duration_ms int,
  props       jsonb NOT NULL DEFAULT '{}',
  app_version text,
  platform    text
);
CREATE INDEX analytics_events_time_idx ON analytics_events (created_at);
CREATE INDEX analytics_events_name_idx ON analytics_events (name, created_at);

-- ---------------------------------------------------------------- errors (aggregated by fingerprint)
CREATE TABLE error_log (
  id          bigserial PRIMARY KEY,
  fingerprint text NOT NULL UNIQUE,
  source      text NOT NULL,                     -- api, worker, web
  route       text,
  code        text,
  message     text NOT NULL,
  count       int NOT NULL DEFAULT 1,
  first_seen  timestamptz NOT NULL DEFAULT now(),
  last_seen   timestamptz NOT NULL DEFAULT now(),
  resolved    boolean NOT NULL DEFAULT false
);
CREATE INDEX error_log_seen_idx ON error_log (last_seen DESC);

-- ---------------------------------------------------------------- safety review (metadata only: no message text is stored here or shown)
CREATE TABLE safety_reviews (
  event_id    bigint PRIMARY KEY REFERENCES safety_events(id) ON DELETE CASCADE,
  reviewed_by text NOT NULL,
  note        text NOT NULL DEFAULT '',
  reviewed_at timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------- users: suspension (last_active_at already exists, migration 0006)
ALTER TABLE users ADD COLUMN suspended_at timestamptz;
ALTER TABLE consents ADD COLUMN analytics boolean NOT NULL DEFAULT false;

-- Row security on, no policies: only the owning role (the API) reads or writes these.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['admin_users','admin_sessions','admin_audit','app_settings','feature_flags','flag_overrides','integration_secrets','prompt_versions','eval_cases','eval_runs','pricing_rates','analytics_events','error_log','safety_reviews'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
  END LOOP;
END $$;

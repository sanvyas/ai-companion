-- 0002: global catalogues (read-only for the app role), helplines remote config, jobs, idempotency, provider usage.

CREATE TABLE helplines (
  id          text PRIMARY KEY,
  name        text NOT NULL,
  description text NOT NULL,
  number      text NOT NULL,          -- display
  tel         text NOT NULL,          -- dial string
  kind        text NOT NULL CHECK (kind IN ('crisis','emergency','youth','ngo')),
  city        text,                   -- NULL = nationwide
  languages   text[] NOT NULL DEFAULT '{}',
  hours       text NOT NULL DEFAULT '24x7',
  sort        int NOT NULL DEFAULT 100,
  active      boolean NOT NULL DEFAULT true,
  verified_at date                    -- PRD 6.4: verified quarterly. NULL or older than 100 days is reported as stale to ops
);
GRANT SELECT ON helplines TO saathi_app;

CREATE TABLE calm_items (
  id          text PRIMARY KEY,
  kind        text NOT NULL CHECK (kind IN ('meditation','sleep')),
  category    text NOT NULL,
  title       text NOT NULL,
  minutes     int NOT NULL,
  description text NOT NULL,
  tint        text NOT NULL DEFAULT '#DCEBE6',
  lines       jsonb,                  -- transcript; NULL = opens the breathing overlay
  default_bg  text,
  audio_url   text,                   -- recorded narration once produced
  sort        int NOT NULL DEFAULT 100,
  active      boolean NOT NULL DEFAULT true
);
GRANT SELECT ON calm_items TO saathi_app;

CREATE TABLE events (
  id               text PRIMARY KEY,
  city             text NOT NULL,
  title            text NOT NULL,
  venue            text NOT NULL,
  starts_at        timestamptz NOT NULL,
  beginner_friendly boolean NOT NULL DEFAULT true,
  group_size       text,
  category         text NOT NULL,
  price            text NOT NULL DEFAULT 'Free',
  lat              double precision,
  lng              double precision,
  organiser        text,
  details          jsonb NOT NULL DEFAULT '{}',   -- like, stay, how, tags, why
  active           boolean NOT NULL DEFAULT true
);
CREATE INDEX events_city_idx ON events (city, starts_at);
GRANT SELECT ON events TO saathi_app;

-- System-only tables below: owner access only.
CREATE TABLE jobs (
  id          bigserial PRIMARY KEY,
  kind        text NOT NULL,
  dedupe_key  text NOT NULL UNIQUE,    -- deterministic: running a scheduler twice changes nothing
  user_id     uuid REFERENCES users(id) ON DELETE CASCADE,
  run_at      timestamptz NOT NULL,
  payload     jsonb NOT NULL DEFAULT '{}',
  status      text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','running','done','failed','skipped')),
  attempts    int NOT NULL DEFAULT 0,
  locked_at   timestamptz,
  last_error  text,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX jobs_due_idx ON jobs (run_at) WHERE status = 'pending';

CREATE TABLE notification_log (
  id         bigserial PRIMARY KEY,
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind       text NOT NULL,
  channel    text NOT NULL CHECK (channel IN ('push','call','card')),
  outcome    text NOT NULL CHECK (outcome IN ('sent','opened','ignored','skipped_quiet','skipped_cap','skipped_pref','failed')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX notification_log_user_idx ON notification_log (user_id, created_at DESC);

CREATE TABLE idempotency_keys (
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  key        text NOT NULL,
  method     text NOT NULL,
  path       text NOT NULL,
  status     int NOT NULL,
  response   jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, key)
);

CREATE TABLE usage_events (
  id         bigserial PRIMARY KEY,
  user_id    uuid REFERENCES users(id) ON DELETE SET NULL,
  provider   text NOT NULL,
  kind       text NOT NULL,
  units      int NOT NULL DEFAULT 0,       -- tokens, seconds or messages depending on kind
  latency_ms int,
  ok         boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX usage_events_idx ON usage_events (created_at);

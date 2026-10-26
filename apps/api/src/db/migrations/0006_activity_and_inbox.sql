-- 0006: activity tracking for the quiet-week rule and in-app quiet cards (PRD 8.2, 8.8).
ALTER TABLE users ADD COLUMN last_active_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE users ADD COLUMN quiet_week_sent_at timestamptz;
GRANT UPDATE (last_active_at) ON users TO saathi_app;

-- A soft card on Today, no buzz.
CREATE TABLE inbox_cards (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind         text NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  expires_at   timestamptz NOT NULL,
  dismissed_at timestamptz,
  UNIQUE (user_id, kind, created_at)
);
CREATE INDEX inbox_user_idx ON inbox_cards (user_id, created_at DESC);
ALTER TABLE inbox_cards ENABLE ROW LEVEL SECURITY;
CREATE POLICY own ON inbox_cards FOR ALL TO saathi_app USING (user_id = app_user_id()) WITH CHECK (user_id = app_user_id());
GRANT SELECT, UPDATE ON inbox_cards TO saathi_app;

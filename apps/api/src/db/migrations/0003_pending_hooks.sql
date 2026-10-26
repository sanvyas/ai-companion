-- 0003: "Next time we talk" hook from the journal review. Used at most once, then deleted (PRD 8.5.3).
CREATE TABLE pending_hooks (
  user_id    uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  hook_enc   bytea NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE pending_hooks ENABLE ROW LEVEL SECURITY;
CREATE POLICY own ON pending_hooks FOR ALL TO saathi_app USING (user_id = app_user_id()) WITH CHECK (user_id = app_user_id());
GRANT SELECT, INSERT, UPDATE, DELETE ON pending_hooks TO saathi_app;

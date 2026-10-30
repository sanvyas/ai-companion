-- 0017: "Month", the third design's way of showing progress. What someone did each day is worked out from tables that already
-- exist (check-ins, journal, talks, walks, calm, plan steps, things they made). Only what cannot be known otherwise is kept
-- here: a friend they called, a game they played, a day they simply showed up, and whether something helped when they felt a
-- certain way (which is what "what works for you" learns from). All new, nothing existing changes, and v1 and v2 never read it.
CREATE TABLE activity_log (
  id         bigserial PRIMARY KEY,
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind       text NOT NULL CHECK (kind IN ('walk','friend','out','sleep','talk','breathe','journal','play','step','show')),
  feeling    text CHECK (feeling IN ('anxious','low','tired','lonely','okay')),
  helped     boolean,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX activity_log_user_idx ON activity_log (user_id, created_at DESC);

ALTER TABLE activity_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY own ON activity_log FOR ALL TO saathi_app USING (user_id = app_user_id()) WITH CHECK (user_id = app_user_id());
GRANT SELECT, INSERT, UPDATE, DELETE ON activity_log TO saathi_app;
GRANT USAGE ON SEQUENCE activity_log_id_seq TO saathi_app;

-- The switch for the third design. Off: it is reached with ?ui=3 only, on a device that asks for it.
INSERT INTO feature_flags (key, description, enabled, rollout_pct, updated_by)
VALUES ('ui.v3', 'Show the third design (mood check-in first, adaptive Home, Month). Off: reach it with ?ui=3 only.', false, 100, 'migration')
ON CONFLICT (key) DO NOTHING;

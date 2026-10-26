-- 0004: idempotency keys are per user, so they get RLS and a grant like other per-user tables.
ALTER TABLE idempotency_keys ENABLE ROW LEVEL SECURITY;
CREATE POLICY own ON idempotency_keys FOR ALL TO saathi_app USING (user_id = app_user_id()) WITH CHECK (user_id = app_user_id());
GRANT SELECT, INSERT ON idempotency_keys TO saathi_app;

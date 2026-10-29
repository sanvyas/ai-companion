-- 0015: the switch for the new design. Off, so everyone keeps seeing the screens they know until it is turned on in the
-- admin portal (Feature flags > ui.v2). Insert only, nothing existing changes, and v1 code ignores the row.
INSERT INTO feature_flags (key, description, enabled, rollout_pct, updated_by)
VALUES ('ui.v2', 'Show the new design (garden home, five tabs, new sign-up). Off: the previous screens.', false, 100, 'migration')
ON CONFLICT (key) DO NOTHING;

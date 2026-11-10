-- 0019: the third design ("final UI") becomes the default for everyone. It can still be switched off at any time in the
-- admin portal (Feature flags > ui.v3), and ?ui=1 or ?ui=2 still brings back an earlier design on a device.
UPDATE feature_flags
   SET enabled = true, rollout_pct = 100, updated_by = 'migration 0019 (requested by the founder)', updated_at = now()
 WHERE key = 'ui.v3';
UPDATE feature_flags SET description = 'Show the third design (mood check-in first, adaptive Home, Month). Off: people see the earlier design unless they open ?ui=3.' WHERE key = 'ui.v3';

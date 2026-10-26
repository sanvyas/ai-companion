-- 0005: a win can be earned once per source (a plan item, a calm session, a walk), so repeating a tap cannot inflate them.
ALTER TABLE wins ADD COLUMN source_id uuid;
CREATE UNIQUE INDEX wins_once_idx ON wins (user_id, kind, source_id) WHERE source_id IS NOT NULL;

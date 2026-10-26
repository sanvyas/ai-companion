-- 0007: the optional "a bit better / same / worse" tap after a conversation (PRD 2 success metrics, 8.3.1).
ALTER TABLE conversations ADD COLUMN feeling text CHECK (feeling IN ('better','same','worse'));

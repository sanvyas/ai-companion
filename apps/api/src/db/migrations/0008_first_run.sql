-- 0008: the very first conversation uses the intro script (PRD 8.3.1): the companion speaks first and explains itself.
ALTER TABLE conversations ADD COLUMN first_run boolean NOT NULL DEFAULT false;

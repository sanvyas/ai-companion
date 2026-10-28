-- 0014: how a person's message read, on a scale from -2 (heavy) to +2 (light), kept beside the message.
-- It is derived from the words by the app (never the words themselves) and is used to shape the plan, stories and
-- calm narration around how the last few days have felt. Expand-only and nullable: nothing existing changes, and old
-- code simply never writes it. It is deleted with the message and the account.
ALTER TABLE messages ADD COLUMN IF NOT EXISTS valence smallint CHECK (valence BETWEEN -2 AND 2);

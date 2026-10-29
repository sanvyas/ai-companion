-- 0016: the garden. How big it is is worked out from what a person did (check-ins, journal, talks, calm, walks, plan steps),
-- so it needs no table of its own. These are only the things a person chooses to do in it: plant, pick, mend, hang, and
-- keep a few small things. All new tables, nothing existing changes, and v1 never reads them.

-- Breathing exercises were never recorded. One row per finished session, no content.
CREATE TABLE breaths (
  id         bigserial PRIMARY KEY,
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX breaths_user_idx ON breaths (user_id, created_at DESC);

-- What they planted. "at_days" is how many days they had shown up when it went in (or was last picked); it grows by their
-- days, not the calendar, so a gap costs nothing.
CREATE TABLE garden_plants (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind       text NOT NULL CHECK (kind IN ('marigold','sunflower','jasmine','mango','banyan')),
  slot       smallint NOT NULL CHECK (slot BETWEEN 0 AND 7),
  at_days    int NOT NULL CHECK (at_days >= 0),
  picks      int NOT NULL DEFAULT 0,
  planted_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, slot)
);

-- Rewards from the quiet games: a gold seam in the pot, a flag on the line, a sky. A paper boat leaves only this empty
-- row, so the pond can show it; what was written for it is never sent or kept. Each is paid for by something they did
-- (a hard day they still showed up on, a breathing session, a sleep story). "n" is which sky.
CREATE TABLE garden_keepsakes (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind       text NOT NULL CHECK (kind IN ('seam','flag','sky','boat')),
  n          smallint NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX garden_keepsakes_user_idx ON garden_keepsakes (user_id, kind, created_at);

-- Their rangolis: a small picture, sealed like their other private things. Paper boats are never stored.
CREATE TABLE garden_creations (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind       text NOT NULL CHECK (kind IN ('rangoli')),
  image_enc  bytea NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX garden_creations_user_idx ON garden_creations (user_id, created_at DESC);

-- The good-things jar: one line each, sealed.
CREATE TABLE jar_items (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  text_enc   bytea NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX jar_items_user_idx ON jar_items (user_id, created_at DESC);

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['breaths','garden_plants','garden_keepsakes','garden_creations','jar_items'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY own ON %I FOR ALL TO saathi_app USING (user_id = app_user_id()) WITH CHECK (user_id = app_user_id())', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I TO saathi_app', t);
  END LOOP;
END $$;
GRANT USAGE ON SEQUENCE breaths_id_seq TO saathi_app;

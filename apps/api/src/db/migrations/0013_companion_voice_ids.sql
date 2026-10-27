-- 0013: the companion's voice can now be a named voice from a speech vendor (for example sarvam:priya) as well as
-- the three on-device voices. Drop the old three-value check and replace it with a shape check; the API validates
-- the id against the voice catalogue.
DO $$
DECLARE c text;
BEGIN
  FOR c IN SELECT conname FROM pg_constraint WHERE conrelid = 'companions'::regclass AND contype = 'c' AND pg_get_constraintdef(oid) ILIKE '%voice%'
  LOOP
    EXECUTE format('ALTER TABLE companions DROP CONSTRAINT %I', c);
  END LOOP;
END $$;
ALTER TABLE companions ADD CONSTRAINT companions_voice_shape CHECK (voice ~ '^(warm|steady|bright|[a-z]{3,12}:[a-z0-9_-]{2,30})$');

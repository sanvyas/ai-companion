-- New companions are called Flint. People who already have one keep the name they have.
ALTER TABLE companions ALTER COLUMN name SET DEFAULT 'Flint';

-- What the new voice and language vendors charge. Entered as the vendors' own published prices and marked unverified,
-- so the Cost page shows them but says to check them. Change them under Cost > Prices.
INSERT INTO pricing_rates (provider, unit, rate, currency, source_note, verified, updated_by) VALUES
  ('groq:openai/gpt-oss-20b',  'input_mtok',  0.075, 'USD', 'Groq price page: $0.075 per million input tokens', false, 'seed'),
  ('groq:openai/gpt-oss-20b',  'output_mtok', 0.30,  'USD', 'Groq price page: $0.30 per million output tokens',  false, 'seed'),
  ('groq:openai/gpt-oss-120b', 'input_mtok',  0.15,  'USD', 'Groq price page: $0.15 per million input tokens',  false, 'seed'),
  ('groq:openai/gpt-oss-120b', 'output_mtok', 0.60,  'USD', 'Groq price page: $0.60 per million output tokens', false, 'seed'),
  ('groq',                     'per_hour',    0.04,  'USD', 'Whisper Large v3 Turbo on Groq: $0.04 per hour of audio', false, 'seed'),
  ('google',                   'per_1k_chars', 0.016, 'USD', 'Cloud Text-to-Speech WaveNet voices: $16 per million characters (Standard voices are $4)', false, 'seed')
ON CONFLICT (provider, unit) DO NOTHING;

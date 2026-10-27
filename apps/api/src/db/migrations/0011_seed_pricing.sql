-- Starting prices for the voice and messaging vendors under evaluation. They are NOT verified: each comes from a
-- third-party article, not the vendor's own price page, so they are marked unverified and shown that way in the portal.
-- Replace each with the vendor's own figure. (Anthropic model prices are deliberately not seeded: enter them from
-- Anthropic's price page for the models you use, so nothing is costed from memory.)
INSERT INTO pricing_rates (provider, unit, rate, currency, source_note, verified, updated_by) VALUES
  ('sarvam',     'per_1k_chars', 3.00, 'INR', 'Bulbul v3: ₹30 per 10,000 characters (Sarvam price page, as reported Oct 2026)', false, 'seed'),
  ('sarvam',     'per_hour',    30.00, 'INR', 'Speech to text: ₹30 per hour (Sarvam price page, as reported Oct 2026)',          false, 'seed'),
  ('soniox',     'per_hour',     0.12, 'USD', 'Streaming speech to text, about $0.12 per hour (Soniox’s own comparison page)',   false, 'seed'),
  ('elevenlabs', 'per_1k_chars', 0.05, 'USD', 'Flash v2.5 about $50 per million characters (third-party comparison)',            false, 'seed'),
  ('assemblyai', 'per_hour',     0.45, 'USD', 'Universal streaming about $0.45 per hour (AssemblyAI blog)',                       false, 'seed'),
  ('msg91',      'per_message',  0.20, 'INR', 'SMS code about ₹0.15 to ₹0.25 each plus GST; sources disagree',                   false, 'seed')
ON CONFLICT (provider, unit) DO NOTHING;

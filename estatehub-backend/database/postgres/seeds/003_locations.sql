-- Seed: locations — MySQL seeds 003_locations.sql + 004_fix_location_nulls.sql combined.
-- The app (location.model.js findOrCreate) stores '' instead of NULL for a missing neighborhood/state, so the
-- rows are seeded that way directly and 004's "UPDATE ... SET state = ''" fix-up is not needed.
-- Re-runnable: rows that already exist (case-insensitive) are skipped.
INSERT INTO locations (neighborhood, city, state, country) VALUES
  ('Emirates Hills', 'Dubai',       '',           'United Arab Emirates'),
  ('Downtown Dubai', 'Dubai',       '',           'United Arab Emirates'),
  ('Palm Jumeirah',  'Dubai',       '',           'United Arab Emirates'),
  ('Manhattan',      'New York',    'New York',   'United States'),
  ('Beverly Hills',  'Los Angeles', 'California', 'United States'),
  ('South Beach',    'Miami',       'Florida',    'United States'),
  ('Kensington',     'London',      '',           'United Kingdom'),
  ('Bur Dubai',      'Dubai',       '',           'United Arab Emirates')
ON CONFLICT DO NOTHING;

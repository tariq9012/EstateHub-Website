-- Seed: amenities (same rows as database/seeds/002_amenities.sql). Re-runnable: existing rows are skipped.
-- Icon names are Google "Material Symbols Outlined" identifiers used by the React frontend.
INSERT INTO amenities (name, icon) VALUES
  ('Pool',            'pool'),
  ('Garage',          'garage'),
  ('Waterfront',      'water'),
  ('Central Air',     'ac_unit'),
  ('Gym',             'fitness_center'),
  ('Balcony',         'balcony'),
  ('Elevator',        'elevator'),
  ('Pet Friendly',    'pets'),
  ('Furnished',       'chair'),
  ('Security System', 'security'),
  ('Garden',          'yard'),
  ('Fireplace',       'fireplace')
ON CONFLICT DO NOTHING;

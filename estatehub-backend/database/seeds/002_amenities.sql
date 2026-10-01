-- =====================================================================
-- Seed: amenities
-- Run after schema.sql
-- Icon names correspond to Google "Material Symbols Outlined" identifiers,
-- matching the icon font already used across the React frontend.
-- =====================================================================
USE estatehub_db;

INSERT INTO `amenities` (`name`, `icon`) VALUES
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
  ('Fireplace',       'fireplace');
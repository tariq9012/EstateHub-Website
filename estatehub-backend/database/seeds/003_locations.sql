-- =====================================================================
-- Seed: locations
-- Run after schema.sql
-- A small starter set of city/neighborhood lookups so property forms,
-- search dropdowns, and filters have real values to work with.
-- New locations can (and will) be inserted on demand by the app whenever
-- a property is created with a location not already in this table.
-- =====================================================================
USE estatehub_db;

INSERT INTO `locations` (`neighborhood`, `city`, `state`, `country`) VALUES
  ('Emirates Hills',      'Dubai',      NULL,           'United Arab Emirates'),
  ('Downtown Dubai',      'Dubai',      NULL,           'United Arab Emirates'),
  ('Palm Jumeirah',       'Dubai',      NULL,           'United Arab Emirates'),
  ('Manhattan',           'New York',   'New York',     'United States'),
  ('Beverly Hills',       'Los Angeles','California',   'United States'),
  ('South Beach',         'Miami',      'Florida',      'United States'),
  ('Kensington',          'London',     NULL,            'United Kingdom'),
  ('Bur Dubai',           'Dubai',      NULL,           'United Arab Emirates');
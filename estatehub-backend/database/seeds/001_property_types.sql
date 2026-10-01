-- =====================================================================
-- Seed: property_types
-- Run after schema.sql
-- =====================================================================
USE estatehub_db;

INSERT INTO `property_types` (`name`, `description`) VALUES
  ('Villa',        'Standalone luxury residence, typically with private land'),
  ('Apartment',    'Unit within a multi-unit residential building'),
  ('Condo',        'Privately owned unit within a condominium complex'),
  ('Townhouse',    'Multi-floor home sharing walls with neighboring units'),
  ('Penthouse',    'Premium top-floor apartment or condo unit'),
  ('Land',         'Vacant land or plot for development'),
  ('Commercial',   'Office, retail, or other commercial-use property');
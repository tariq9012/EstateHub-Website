-- =====================================================================
-- Fix: align existing `locations` rows with the app-level convention.
-- The location.model.js findOrCreate() always writes '' (empty string)
-- instead of NULL for a missing neighborhood/state, because MySQL treats
-- every NULL as *distinct* in a UNIQUE index — so NULLs would silently
-- defeat the dedup and let duplicate location rows pile up.
--
-- The seed file (003_locations.sql) was written before this was caught,
-- and used NULL for `state` on the UAE rows. Run this once so those rows
-- match what the app will write going forward, and can be found/reused
-- by findOrCreate() instead of getting duplicated.
-- =====================================================================
USE estatehub_db;

-- MySQL Workbench's "Safe Update Mode" blocks UPDATE/DELETE statements
-- whose WHERE clause doesn't reference a key column, even when the query
-- is correct. Disable it for just this script, then restore the default.
SET SQL_SAFE_UPDATES = 0;

UPDATE locations SET state = '' WHERE state IS NULL;
UPDATE locations SET neighborhood = '' WHERE neighborhood IS NULL;

SET SQL_SAFE_UPDATES = 1;

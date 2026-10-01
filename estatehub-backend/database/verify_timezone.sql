-- Run on a REAL MySQL server, once per session zone, to verify token-expiry semantics.
--   mysql -u root -p estatehub < verify_timezone.sql
-- No tables are created or modified (pure SELECTs), so this is safe to run as many times as you
-- like, in the same session or a new one, in any order -- nothing to reset between runs.
-- Every "is_valid" column should read 1 in BOTH sessions below.

-- Run the block below twice: first with '+00:00', then with '+05:00' (Asia/Karachi).
SET time_zone = '+00:00';   -- then repeat the SELECT below with: SET time_zone = '+05:00';

-- Same expressions the app uses:
--   password_reset_tokens.expires_at is written with DATE_ADD(UTC_TIMESTAMP(), ...) and compared
--   with UTC_TIMESTAMP() (passwordResetToken.model.js).
--   refresh_tokens.expires_at is written with FROM_UNIXTIME(...) and compared with NOW()
--   (refreshToken.model.js).
SELECT
  'reset_30min'   AS label,
  DATE_ADD(UTC_TIMESTAMP(), INTERVAL 30 MINUTE) > UTC_TIMESTAMP() AS is_valid,
  TIMESTAMPDIFF(MINUTE, NOW(), DATE_ADD(UTC_TIMESTAMP(), INTERVAL 30 MINUTE)) AS minutes_left_expect_about_30
UNION ALL
SELECT
  'refresh_30min' AS label,
  FROM_UNIXTIME(UNIX_TIMESTAMP() + 30*60) > NOW() AS is_valid,
  TIMESTAMPDIFF(MINUTE, NOW(), FROM_UNIXTIME(UNIX_TIMESTAMP() + 30*60)) AS minutes_left_expect_about_30;
-- Interpretation: both rows must show is_valid = 1, and minutes_left ~30 for both. If a row shows
-- is_valid = 0, or minutes_left is off by roughly the zone offset (e.g. ~330 or ~-270 instead of
-- ~30), that expression is timezone-sensitive under the current session time_zone.

-- Migration: add password_reset_tokens
-- Safe to run against the EXISTING EstateHub database — does not touch or reset any other table.
-- Mirrors the existing refresh_tokens table's pattern (hashed token, expiry, single-use marker).
--
-- Usage:
--   mysql -u <user> -p <database_name> < database/migrations/001_add_password_reset_tokens.sql

CREATE TABLE IF NOT EXISTS `password_reset_tokens` (
  `reset_token_id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id`        INT UNSIGNED NOT NULL,
  `token_hash`     VARCHAR(255) NOT NULL,
  `expires_at`     TIMESTAMP NOT NULL,
  `used_at`        TIMESTAMP NULL DEFAULT NULL,
  `created_at`     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`reset_token_id`),
  UNIQUE KEY `uq_password_reset_tokens_hash` (`token_hash`),
  KEY `idx_password_reset_tokens_user` (`user_id`),
  CONSTRAINT `fk_password_reset_tokens_user` FOREIGN KEY (`user_id`)
    REFERENCES `users` (`user_id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Operational note: rows here are small and self-limiting (one row per reset request), but if you
-- want periodic cleanup, this is safe to run on a schedule (cron/event scheduler) since it only
-- ever removes tokens that are already unusable:
--   DELETE FROM password_reset_tokens WHERE expires_at < (NOW() - INTERVAL 7 DAY);

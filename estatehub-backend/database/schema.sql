-- =====================================================================
-- EstateHub — MySQL Schema
-- Phase 1: Database
-- Engine: InnoDB (required for foreign keys)
-- Charset: utf8mb4 / utf8mb4_unicode_ci
--
-- Run this file against an empty MySQL 8.0+ server:
--   mysql -u root -p < database/schema.sql
--
-- Tables are created in strict dependency order (no forward references).
-- =====================================================================

CREATE DATABASE IF NOT EXISTS estatehub_db
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE estatehub_db;

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- ---------------------------------------------------------------------
-- 1. users — core identity for buyers, agents, and admins
-- ---------------------------------------------------------------------
DROP TABLE IF EXISTS `users`;
CREATE TABLE `users` (
  `user_id`            INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `email`               VARCHAR(191)  NOT NULL,
  `password_hash`       VARCHAR(255)  NOT NULL,
  `role`                ENUM('buyer','agent','admin') NOT NULL DEFAULT 'buyer',
  `first_name`          VARCHAR(100)  NOT NULL,
  `last_name`           VARCHAR(100)  NOT NULL,
  `phone`               VARCHAR(20)   NULL,
  `avatar_url`          VARCHAR(500)  NULL,
  `status`              ENUM('active','pending','suspended','deactivated') NOT NULL DEFAULT 'active',
  `email_verified_at`   TIMESTAMP     NULL DEFAULT NULL,
  `created_at`          TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`          TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`user_id`),
  UNIQUE KEY `uq_users_email` (`email`),
  KEY `idx_users_role` (`role`),
  KEY `idx_users_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- 2. property_types — lookup
-- ---------------------------------------------------------------------
DROP TABLE IF EXISTS `property_types`;
CREATE TABLE `property_types` (
  `type_id`      SMALLINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `name`         VARCHAR(50)  NOT NULL,
  `description`  VARCHAR(255) NULL,
  PRIMARY KEY (`type_id`),
  UNIQUE KEY `uq_property_types_name` (`name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- 3. amenities — lookup
-- ---------------------------------------------------------------------
DROP TABLE IF EXISTS `amenities`;
CREATE TABLE `amenities` (
  `amenity_id`  SMALLINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `name`        VARCHAR(80) NOT NULL,
  `icon`        VARCHAR(60) NULL,
  PRIMARY KEY (`amenity_id`),
  UNIQUE KEY `uq_amenities_name` (`name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- 4. locations — reusable city/neighborhood lookup (not full addresses)
-- ---------------------------------------------------------------------
DROP TABLE IF EXISTS `locations`;
CREATE TABLE `locations` (
  `location_id`   INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `neighborhood`  VARCHAR(150) NULL,
  `city`          VARCHAR(100) NOT NULL,
  `state`         VARCHAR(100) NULL,
  `country`       VARCHAR(100) NOT NULL,
  `created_at`    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`location_id`),
  UNIQUE KEY `uq_locations_area` (`neighborhood`,`city`,`state`,`country`),
  KEY `idx_locations_city_country` (`city`,`country`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- 5. admin_users — 1:1 with users where role='admin'
-- ---------------------------------------------------------------------
DROP TABLE IF EXISTS `admin_users`;
CREATE TABLE `admin_users` (
  `admin_id`          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id`           INT UNSIGNED NOT NULL,
  `permission_level`  ENUM('super_admin','moderator','support') NOT NULL DEFAULT 'moderator',
  `created_at`        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`admin_id`),
  UNIQUE KEY `uq_admin_users_user_id` (`user_id`),
  CONSTRAINT `fk_admin_users_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- 6. agents — 1:1 with users where role='agent'
-- ---------------------------------------------------------------------
DROP TABLE IF EXISTS `agents`;
CREATE TABLE `agents` (
  `agent_id`              INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id`               INT UNSIGNED NOT NULL,
  `license_number`        VARCHAR(100) NOT NULL,
  `agency_name`           VARCHAR(200) NULL,
  `specialty`             VARCHAR(100) NULL,
  `years_experience`      SMALLINT UNSIGNED NULL,
  `verification_status`   ENUM('unverified','pending','verified','rejected') NOT NULL DEFAULT 'unverified',
  `verified_at`           TIMESTAMP NULL DEFAULT NULL,
  `verified_by`           INT UNSIGNED NULL,
  `license_expiry_date`   DATE NULL,
  `average_rating`        DECIMAL(3,2) NOT NULL DEFAULT 0.00,
  `total_reviews`         INT UNSIGNED NOT NULL DEFAULT 0,
  `created_at`            TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`            TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`agent_id`),
  UNIQUE KEY `uq_agents_user_id` (`user_id`),
  UNIQUE KEY `uq_agents_license_number` (`license_number`),
  KEY `idx_agents_verification_status` (`verification_status`),
  KEY `idx_agents_license_expiry` (`license_expiry_date`),
  KEY `idx_agents_verified_by` (`verified_by`),
  CONSTRAINT `fk_agents_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_agents_verified_by` FOREIGN KEY (`verified_by`) REFERENCES `admin_users` (`admin_id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- 7. agent_profiles — 1:1 with agents
-- ---------------------------------------------------------------------
DROP TABLE IF EXISTS `agent_profiles`;
CREATE TABLE `agent_profiles` (
  `agent_profile_id`  INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `agent_id`          INT UNSIGNED NOT NULL,
  `bio`               TEXT NULL,
  `company_website`   VARCHAR(255) NULL,
  `office_address`    VARCHAR(255) NULL,
  `social_links_json` JSON NULL,
  `created_at`        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`agent_profile_id`),
  UNIQUE KEY `uq_agent_profiles_agent_id` (`agent_id`),
  CONSTRAINT `fk_agent_profiles_agent` FOREIGN KEY (`agent_id`) REFERENCES `agents` (`agent_id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- 8. user_profiles — 1:1 with users (extended profile, any role)
-- ---------------------------------------------------------------------
DROP TABLE IF EXISTS `user_profiles`;
CREATE TABLE `user_profiles` (
  `profile_id`         INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id`            INT UNSIGNED NOT NULL,
  `bio`                TEXT NULL,
  `address_line`       VARCHAR(255) NULL,
  `city`               VARCHAR(100) NULL,
  `state`              VARCHAR(100) NULL,
  `country`            VARCHAR(100) NULL,
  `postal_code`        VARCHAR(20)  NULL,
  `date_of_birth`      DATE NULL,
  `preferences_json`   JSON NULL,
  `created_at`         TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`         TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`profile_id`),
  UNIQUE KEY `uq_user_profiles_user_id` (`user_id`),
  CONSTRAINT `fk_user_profiles_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- 9. refresh_tokens — JWT refresh token storage (hashed)
-- ---------------------------------------------------------------------
DROP TABLE IF EXISTS `refresh_tokens`;
CREATE TABLE `refresh_tokens` (
  `token_id`     INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id`      INT UNSIGNED NOT NULL,
  `token_hash`   VARCHAR(255) NOT NULL,
  `expires_at`   TIMESTAMP NOT NULL,
  `revoked_at`   TIMESTAMP NULL DEFAULT NULL,
  `created_at`   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`token_id`),
  UNIQUE KEY `uq_refresh_tokens_hash` (`token_hash`),
  KEY `idx_refresh_tokens_user` (`user_id`),
  CONSTRAINT `fk_refresh_tokens_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- 10. user_notification_preferences — 1:1 with users
-- ---------------------------------------------------------------------
DROP TABLE IF EXISTS `user_notification_preferences`;
CREATE TABLE `user_notification_preferences` (
  `user_id`              INT UNSIGNED NOT NULL,
  `email_notifications`  BOOLEAN NOT NULL DEFAULT TRUE,
  `sms_notifications`    BOOLEAN NOT NULL DEFAULT FALSE,
  `push_notifications`   BOOLEAN NOT NULL DEFAULT TRUE,
  `updated_at`           TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`user_id`),
  CONSTRAINT `fk_notif_prefs_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- 11. system_notification_settings — admin-configured global triggers
-- ---------------------------------------------------------------------
DROP TABLE IF EXISTS `system_notification_settings`;
CREATE TABLE `system_notification_settings` (
  `setting_id`     SMALLINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `event_key`      VARCHAR(80) NOT NULL,
  `description`    VARCHAR(255) NULL,
  `email_enabled`  BOOLEAN NOT NULL DEFAULT TRUE,
  `sms_enabled`    BOOLEAN NOT NULL DEFAULT FALSE,
  `updated_by`     INT UNSIGNED NULL,
  `updated_at`     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`setting_id`),
  UNIQUE KEY `uq_system_notification_settings_event_key` (`event_key`),
  KEY `idx_system_notification_settings_updated_by` (`updated_by`),
  CONSTRAINT `fk_sys_notif_settings_admin` FOREIGN KEY (`updated_by`) REFERENCES `admin_users` (`admin_id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- 12. properties — core listing table
-- ---------------------------------------------------------------------
DROP TABLE IF EXISTS `properties`;
CREATE TABLE `properties` (
  `property_id`         INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `listed_by_user_id`   INT UNSIGNED NOT NULL,
  `agent_id`            INT UNSIGNED NULL,
  `type_id`             SMALLINT UNSIGNED NOT NULL,
  `location_id`         INT UNSIGNED NOT NULL,
  `title`               VARCHAR(200) NOT NULL,
  `description`         TEXT NULL,
  `address_line`        VARCHAR(255) NOT NULL,
  `postal_code`         VARCHAR(20) NULL,
  `latitude`            DECIMAL(10,8) NULL,
  `longitude`           DECIMAL(11,8) NULL,
  `price`               DECIMAL(14,2) NOT NULL,
  `listing_type`        ENUM('sale','rent') NOT NULL DEFAULT 'sale',
  `bedrooms`            SMALLINT UNSIGNED NULL,
  `bathrooms`           DECIMAL(3,1) UNSIGNED NULL,
  `area_sqft`           INT UNSIGNED NULL,
  `lot_size_sqft`       INT UNSIGNED NULL,
  `year_built`          SMALLINT UNSIGNED NULL,
  `status`              ENUM('draft','pending_review','active','under_contract','sold','rejected','archived') NOT NULL DEFAULT 'draft',
  `is_featured`         BOOLEAN NOT NULL DEFAULT FALSE,
  `view_count`          INT UNSIGNED NOT NULL DEFAULT 0,
  `rejection_reason`    TEXT NULL,
  `approved_by`         INT UNSIGNED NULL,
  `approved_at`         TIMESTAMP NULL DEFAULT NULL,
  `created_at`          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`property_id`),
  KEY `idx_properties_status` (`status`),
  KEY `idx_properties_price` (`price`),
  KEY `idx_properties_location` (`location_id`),
  KEY `idx_properties_type` (`type_id`),
  KEY `idx_properties_bedrooms` (`bedrooms`),
  KEY `idx_properties_agent` (`agent_id`),
  KEY `idx_properties_listed_by` (`listed_by_user_id`),
  KEY `idx_properties_approved_by` (`approved_by`),
  KEY `idx_properties_search` (`status`,`listing_type`,`price`,`bedrooms`),
  CONSTRAINT `fk_properties_listed_by` FOREIGN KEY (`listed_by_user_id`) REFERENCES `users` (`user_id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_properties_agent` FOREIGN KEY (`agent_id`) REFERENCES `agents` (`agent_id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_properties_type` FOREIGN KEY (`type_id`) REFERENCES `property_types` (`type_id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `fk_properties_location` FOREIGN KEY (`location_id`) REFERENCES `locations` (`location_id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `fk_properties_approved_by` FOREIGN KEY (`approved_by`) REFERENCES `admin_users` (`admin_id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- 13. property_images
-- ---------------------------------------------------------------------
DROP TABLE IF EXISTS `property_images`;
CREATE TABLE `property_images` (
  `image_id`        INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `property_id`     INT UNSIGNED NOT NULL,
  `image_url`       VARCHAR(500) NOT NULL,
  `alt_text`        VARCHAR(255) NULL,
  `is_primary`      BOOLEAN NOT NULL DEFAULT FALSE,
  `display_order`   SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  `created_at`      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`image_id`),
  KEY `idx_property_images_property` (`property_id`),
  CONSTRAINT `fk_property_images_property` FOREIGN KEY (`property_id`) REFERENCES `properties` (`property_id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- 14. property_amenities — M:N junction
-- ---------------------------------------------------------------------
DROP TABLE IF EXISTS `property_amenities`;
CREATE TABLE `property_amenities` (
  `property_id`  INT UNSIGNED NOT NULL,
  `amenity_id`   SMALLINT UNSIGNED NOT NULL,
  PRIMARY KEY (`property_id`,`amenity_id`),
  KEY `idx_property_amenities_amenity` (`amenity_id`),
  CONSTRAINT `fk_property_amenities_property` FOREIGN KEY (`property_id`) REFERENCES `properties` (`property_id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_property_amenities_amenity` FOREIGN KEY (`amenity_id`) REFERENCES `amenities` (`amenity_id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- 15. favorites — "Saved Properties"
-- ---------------------------------------------------------------------
DROP TABLE IF EXISTS `favorites`;
CREATE TABLE `favorites` (
  `favorite_id`   INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id`       INT UNSIGNED NOT NULL,
  `property_id`   INT UNSIGNED NOT NULL,
  `created_at`    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`favorite_id`),
  UNIQUE KEY `uq_favorites_user_property` (`user_id`,`property_id`),
  KEY `idx_favorites_property` (`property_id`),
  CONSTRAINT `fk_favorites_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_favorites_property` FOREIGN KEY (`property_id`) REFERENCES `properties` (`property_id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- 16. recently_viewed_properties
-- ---------------------------------------------------------------------
DROP TABLE IF EXISTS `recently_viewed_properties`;
CREATE TABLE `recently_viewed_properties` (
  `view_id`       INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id`       INT UNSIGNED NOT NULL,
  `property_id`   INT UNSIGNED NOT NULL,
  `viewed_at`     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`view_id`),
  UNIQUE KEY `uq_recently_viewed_user_property` (`user_id`,`property_id`),
  KEY `idx_recently_viewed_property` (`property_id`),
  CONSTRAINT `fk_recently_viewed_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_recently_viewed_property` FOREIGN KEY (`property_id`) REFERENCES `properties` (`property_id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- 17. property_comparisons
-- ---------------------------------------------------------------------
DROP TABLE IF EXISTS `property_comparisons`;
CREATE TABLE `property_comparisons` (
  `comparison_id`  INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id`        INT UNSIGNED NOT NULL,
  `created_at`     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`comparison_id`),
  KEY `idx_property_comparisons_user` (`user_id`),
  CONSTRAINT `fk_property_comparisons_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- 18. property_comparison_items — M:N junction
-- ---------------------------------------------------------------------
DROP TABLE IF EXISTS `property_comparison_items`;
CREATE TABLE `property_comparison_items` (
  `comparison_id`  INT UNSIGNED NOT NULL,
  `property_id`    INT UNSIGNED NOT NULL,
  `added_at`       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`comparison_id`,`property_id`),
  KEY `idx_comparison_items_property` (`property_id`),
  CONSTRAINT `fk_comparison_items_comparison` FOREIGN KEY (`comparison_id`) REFERENCES `property_comparisons` (`comparison_id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_comparison_items_property` FOREIGN KEY (`property_id`) REFERENCES `properties` (`property_id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- 19. inquiries — "Contact Agent" form submissions
-- ---------------------------------------------------------------------
DROP TABLE IF EXISTS `inquiries`;
CREATE TABLE `inquiries` (
  `inquiry_id`             INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `property_id`            INT UNSIGNED NOT NULL,
  `user_id`                INT UNSIGNED NOT NULL,
  `agent_id`                INT UNSIGNED NULL,
  `message`                TEXT NOT NULL,
  `preferred_visit_date`   DATE NULL,
  `status`                 ENUM('new','contacted','closed') NOT NULL DEFAULT 'new',
  `created_at`             TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`             TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`inquiry_id`),
  KEY `idx_inquiries_property` (`property_id`),
  KEY `idx_inquiries_status` (`status`),
  KEY `idx_inquiries_user` (`user_id`),
  KEY `idx_inquiries_agent` (`agent_id`),
  CONSTRAINT `fk_inquiries_property` FOREIGN KEY (`property_id`) REFERENCES `properties` (`property_id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_inquiries_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_inquiries_agent` FOREIGN KEY (`agent_id`) REFERENCES `agents` (`agent_id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- 20. license_renewals
-- ---------------------------------------------------------------------
DROP TABLE IF EXISTS `license_renewals`;
CREATE TABLE `license_renewals` (
  `renewal_id`               INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `agent_id`                 INT UNSIGNED NOT NULL,
  `current_license_expiry`   DATE NOT NULL,
  `status`                   ENUM('draft','documents_pending','submitted','under_review','missing_documents','approved','rejected') NOT NULL DEFAULT 'draft',
  `submitted_at`             TIMESTAMP NULL DEFAULT NULL,
  `reviewed_by`              INT UNSIGNED NULL,
  `reviewed_at`              TIMESTAMP NULL DEFAULT NULL,
  `new_expiry_date`          DATE NULL,
  `created_at`               TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`               TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`renewal_id`),
  KEY `idx_license_renewals_agent` (`agent_id`),
  KEY `idx_license_renewals_status` (`status`),
  KEY `idx_license_renewals_reviewed_by` (`reviewed_by`),
  CONSTRAINT `fk_license_renewals_agent` FOREIGN KEY (`agent_id`) REFERENCES `agents` (`agent_id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_license_renewals_reviewed_by` FOREIGN KEY (`reviewed_by`) REFERENCES `admin_users` (`admin_id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- 21. verification_documents — unified for initial verification + renewals
-- ---------------------------------------------------------------------
DROP TABLE IF EXISTS `verification_documents`;
CREATE TABLE `verification_documents` (
  `document_id`        INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `agent_id`            INT UNSIGNED NOT NULL,
  `renewal_id`          INT UNSIGNED NULL,
  `document_type`       ENUM('license','insurance','certification','id_proof','other') NOT NULL,
  `file_url`            VARCHAR(500) NOT NULL,
  `status`              ENUM('pending','verified','rejected') NOT NULL DEFAULT 'pending',
  `rejection_reason`    TEXT NULL,
  `reviewed_by`         INT UNSIGNED NULL,
  `reviewed_at`         TIMESTAMP NULL DEFAULT NULL,
  `uploaded_at`         TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`document_id`),
  KEY `idx_verification_documents_agent` (`agent_id`),
  KEY `idx_verification_documents_status` (`status`),
  KEY `idx_verification_documents_renewal` (`renewal_id`),
  KEY `idx_verification_documents_reviewed_by` (`reviewed_by`),
  CONSTRAINT `fk_verification_documents_agent` FOREIGN KEY (`agent_id`) REFERENCES `agents` (`agent_id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_verification_documents_renewal` FOREIGN KEY (`renewal_id`) REFERENCES `license_renewals` (`renewal_id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_verification_documents_reviewed_by` FOREIGN KEY (`reviewed_by`) REFERENCES `admin_users` (`admin_id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- 22. conversations
-- ---------------------------------------------------------------------
DROP TABLE IF EXISTS `conversations`;
CREATE TABLE `conversations` (
  `conversation_id`  INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `property_id`       INT UNSIGNED NULL,
  `inquiry_id`        INT UNSIGNED NULL,
  `buyer_id`          INT UNSIGNED NOT NULL,
  `agent_user_id`     INT UNSIGNED NOT NULL,
  `last_message_at`   TIMESTAMP NULL DEFAULT NULL,
  `created_at`        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`conversation_id`),
  UNIQUE KEY `uq_conversations_participants` (`buyer_id`,`agent_user_id`,`property_id`),
  KEY `idx_conversations_property` (`property_id`),
  KEY `idx_conversations_inquiry` (`inquiry_id`),
  KEY `idx_conversations_agent_user` (`agent_user_id`),
  CONSTRAINT `fk_conversations_property` FOREIGN KEY (`property_id`) REFERENCES `properties` (`property_id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_conversations_inquiry` FOREIGN KEY (`inquiry_id`) REFERENCES `inquiries` (`inquiry_id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_conversations_buyer` FOREIGN KEY (`buyer_id`) REFERENCES `users` (`user_id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_conversations_agent_user` FOREIGN KEY (`agent_user_id`) REFERENCES `users` (`user_id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- 23. messages
-- ---------------------------------------------------------------------
DROP TABLE IF EXISTS `messages`;
CREATE TABLE `messages` (
  `message_id`       INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `conversation_id`  INT UNSIGNED NOT NULL,
  `sender_id`        INT UNSIGNED NOT NULL,
  `message_text`     TEXT NOT NULL,
  `is_read`          BOOLEAN NOT NULL DEFAULT FALSE,
  `created_at`       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`message_id`),
  KEY `idx_messages_conversation_created` (`conversation_id`,`created_at`),
  KEY `idx_messages_sender` (`sender_id`),
  CONSTRAINT `fk_messages_conversation` FOREIGN KEY (`conversation_id`) REFERENCES `conversations` (`conversation_id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_messages_sender` FOREIGN KEY (`sender_id`) REFERENCES `users` (`user_id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- 24. appointments — property viewings
-- ---------------------------------------------------------------------
DROP TABLE IF EXISTS `appointments`;
CREATE TABLE `appointments` (
  `appointment_id`     INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `property_id`        INT UNSIGNED NOT NULL,
  `user_id`            INT UNSIGNED NOT NULL,
  `agent_id`           INT UNSIGNED NOT NULL,
  `scheduled_at`       DATETIME NOT NULL,
  `duration_minutes`   SMALLINT UNSIGNED NOT NULL DEFAULT 30,
  `status`             ENUM('requested','confirmed','completed','cancelled','no_show') NOT NULL DEFAULT 'requested',
  `notes`              TEXT NULL,
  `created_at`         TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`         TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`appointment_id`),
  KEY `idx_appointments_agent_time` (`agent_id`,`scheduled_at`),
  KEY `idx_appointments_user` (`user_id`),
  KEY `idx_appointments_property` (`property_id`),
  KEY `idx_appointments_status` (`status`),
  CONSTRAINT `fk_appointments_property` FOREIGN KEY (`property_id`) REFERENCES `properties` (`property_id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_appointments_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_appointments_agent` FOREIGN KEY (`agent_id`) REFERENCES `agents` (`agent_id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- 25. agent_reviews
-- ---------------------------------------------------------------------
DROP TABLE IF EXISTS `agent_reviews`;
CREATE TABLE `agent_reviews` (
  `review_id`   INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `agent_id`    INT UNSIGNED NOT NULL,
  `user_id`     INT UNSIGNED NOT NULL,
  `rating`      TINYINT UNSIGNED NOT NULL,
  `comment`     TEXT NULL,
  `created_at`  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`review_id`),
  UNIQUE KEY `uq_agent_reviews_agent_user` (`agent_id`,`user_id`),
  KEY `idx_agent_reviews_user` (`user_id`),
  CONSTRAINT `fk_agent_reviews_agent` FOREIGN KEY (`agent_id`) REFERENCES `agents` (`agent_id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_agent_reviews_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `chk_agent_reviews_rating` CHECK (`rating` BETWEEN 1 AND 5)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- 26. property_reviews
-- ---------------------------------------------------------------------
DROP TABLE IF EXISTS `property_reviews`;
CREATE TABLE `property_reviews` (
  `review_id`    INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `property_id`  INT UNSIGNED NOT NULL,
  `user_id`      INT UNSIGNED NOT NULL,
  `rating`       TINYINT UNSIGNED NOT NULL,
  `comment`      TEXT NULL,
  `created_at`   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`review_id`),
  UNIQUE KEY `uq_property_reviews_property_user` (`property_id`,`user_id`),
  KEY `idx_property_reviews_user` (`user_id`),
  CONSTRAINT `fk_property_reviews_property` FOREIGN KEY (`property_id`) REFERENCES `properties` (`property_id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_property_reviews_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `chk_property_reviews_rating` CHECK (`rating` BETWEEN 1 AND 5)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- 27. notifications — in-app, per user
-- ---------------------------------------------------------------------
DROP TABLE IF EXISTS `notifications`;
CREATE TABLE `notifications` (
  `notification_id`      INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id`               INT UNSIGNED NOT NULL,
  `type`                  VARCHAR(50) NOT NULL,
  `title`                 VARCHAR(150) NOT NULL,
  `body`                  TEXT NULL,
  `related_entity_type`   VARCHAR(50) NULL,
  `related_entity_id`     INT UNSIGNED NULL,
  `is_read`               BOOLEAN NOT NULL DEFAULT FALSE,
  `created_at`            TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`notification_id`),
  KEY `idx_notifications_user_unread` (`user_id`,`is_read`),
  CONSTRAINT `fk_notifications_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- 28. admin_action_log — generic audit trail
-- ---------------------------------------------------------------------
DROP TABLE IF EXISTS `admin_action_log`;
CREATE TABLE `admin_action_log` (
  `log_id`       INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `admin_id`     INT UNSIGNED NOT NULL,
  `action_type`  VARCHAR(60) NOT NULL,
  `target_type`  VARCHAR(40) NOT NULL,
  `target_id`    INT UNSIGNED NOT NULL,
  `notes`        TEXT NULL,
  `created_at`   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`log_id`),
  KEY `idx_admin_action_log_target` (`target_type`,`target_id`),
  KEY `idx_admin_action_log_admin` (`admin_id`),
  CONSTRAINT `fk_admin_action_log_admin` FOREIGN KEY (`admin_id`) REFERENCES `admin_users` (`admin_id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS = 1;

-- =====================================================================
-- End of schema.sql — 28 tables created.
-- =====================================================================
-- =====================================================================
-- Seed: system_notification_settings
-- Run after schema.sql. Backs the admin "Notification Settings" page —
-- global email/SMS toggles per platform event.
-- =====================================================================
USE estatehub_db;

INSERT INTO system_notification_settings (event_key, description, email_enabled, sms_enabled) VALUES
  ('license_expiration',          'Alert agents when their license is nearing expiration',              TRUE, FALSE),
  ('new_property_submission',     'Notify admins when a new property is submitted for review',          TRUE, FALSE),
  ('property_approved',           'Notify the lister when their property is approved',                  TRUE, FALSE),
  ('property_rejected',           'Notify the lister when their property is rejected',                  TRUE, FALSE),
  ('agent_verification_pending',  'Notify admins when a new agent needs verification',                  TRUE, FALSE),
  ('license_renewal_submitted',   'Notify admins when an agent submits a license renewal',              TRUE, FALSE),
  ('new_inquiry',                 'Notify agents/listers when they receive a new property inquiry',     TRUE, FALSE),
  ('new_message',                 'Notify users when they receive a new conversation message',          TRUE, FALSE);

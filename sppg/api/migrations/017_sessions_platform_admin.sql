ALTER TABLE sessions
  MODIFY user_id INT NULL,
  ADD COLUMN platform_admin_id INT UNSIGNED NULL AFTER user_id,
  ADD CONSTRAINT fk_sessions_platform_admin
    FOREIGN KEY (platform_admin_id) REFERENCES platform_admins(id) ON DELETE CASCADE;

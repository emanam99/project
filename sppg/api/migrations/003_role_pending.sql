ALTER TABLE users
  MODIFY COLUMN role ENUM('super_admin', 'admin', 'user', 'pending') NOT NULL DEFAULT 'pending';

ALTER TABLE users
  MODIFY COLUMN role ENUM(
    'super_admin',
    'admin_approve',
    'admin_maker',
    'admin',
    'user',
    'pending'
  ) NOT NULL DEFAULT 'pending';

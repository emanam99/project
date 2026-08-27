ALTER TABLE users
  ADD COLUMN pelanggan_id INT NULL AFTER role,
  ADD CONSTRAINT fk_users_pelanggan FOREIGN KEY (pelanggan_id) REFERENCES pelanggan(id) ON DELETE SET NULL,
  ADD INDEX idx_users_pelanggan (pelanggan_id);

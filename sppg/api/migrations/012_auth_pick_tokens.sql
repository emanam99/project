CREATE TABLE IF NOT EXISTS auth_pick_tokens (
  token VARCHAR(64) PRIMARY KEY,
  email VARCHAR(255) NOT NULL,
  google_id VARCHAR(64) NOT NULL,
  name VARCHAR(255) NULL,
  picture TEXT NULL,
  memberships JSON NOT NULL,
  expires_at DATETIME NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_pick_expires (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

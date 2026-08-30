-- Multi-tenant SPPG: profil tenant, langganan, isolasi data per sppg_id

CREATE TABLE IF NOT EXISTS sppg (
  id INT AUTO_INCREMENT PRIMARY KEY,
  public_id VARCHAR(32) NOT NULL,
  slug VARCHAR(64) NOT NULL,
  nama_unit VARCHAR(255) NOT NULL,
  nama_yayasan VARCHAR(255) NOT NULL,
  alamat TEXT NULL,
  telepon VARCHAR(32) NULL,
  email_kontak VARCHAR(255) NULL,
  status ENUM('pending_payment', 'active', 'suspended', 'cancelled') NOT NULL DEFAULT 'pending_payment',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_sppg_public_id (public_id),
  UNIQUE KEY uq_sppg_slug (slug),
  INDEX idx_sppg_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS sppg_subscriptions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  sppg_id INT NOT NULL,
  plan_code VARCHAR(32) NOT NULL DEFAULT 'basic',
  amount DECIMAL(14,2) NOT NULL DEFAULT 50000,
  currency VARCHAR(8) NOT NULL DEFAULT 'IDR',
  status ENUM('pending_payment', 'active', 'past_due', 'cancelled') NOT NULL DEFAULT 'pending_payment',
  period_start DATETIME NULL,
  period_end DATETIME NULL,
  xendit_invoice_id VARCHAR(64) NULL,
  xendit_external_id VARCHAR(128) NULL,
  xendit_invoice_url TEXT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_sub_sppg FOREIGN KEY (sppg_id) REFERENCES sppg(id) ON DELETE CASCADE,
  INDEX idx_sub_sppg (sppg_id),
  INDEX idx_sub_status (status),
  INDEX idx_sub_period_end (period_end)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS sppg_subscription_payments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  sppg_id INT NOT NULL,
  subscription_id INT NULL,
  amount DECIMAL(14,2) NOT NULL,
  currency VARCHAR(8) NOT NULL DEFAULT 'IDR',
  status VARCHAR(32) NOT NULL DEFAULT 'pending',
  xendit_invoice_id VARCHAR(64) NULL,
  xendit_external_id VARCHAR(128) NULL,
  paid_at DATETIME NULL,
  raw_payload JSON NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_pay_sppg FOREIGN KEY (sppg_id) REFERENCES sppg(id) ON DELETE CASCADE,
  CONSTRAINT fk_pay_sub FOREIGN KEY (subscription_id) REFERENCES sppg_subscriptions(id) ON DELETE SET NULL,
  INDEX idx_pay_sppg (sppg_id),
  INDEX idx_pay_xendit (xendit_invoice_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO sppg (public_id, slug, nama_unit, nama_yayasan, alamat, status)
VALUES ('SPPG-0001', 'sppg-jambesari-2', 'SPPG JAMBESARI 2', 'SPPG AL-UTSMANI', NULL, 'active');

SET @default_sppg_id = LAST_INSERT_ID();

INSERT INTO sppg_subscriptions (sppg_id, plan_code, amount, currency, status, period_start, period_end)
VALUES (
  @default_sppg_id,
  'basic',
  50000,
  'IDR',
  'active',
  NOW(),
  DATE_ADD(NOW(), INTERVAL 1 YEAR)
);

ALTER TABLE users ADD COLUMN sppg_id INT NULL AFTER id;
UPDATE users SET sppg_id = @default_sppg_id WHERE sppg_id IS NULL;
ALTER TABLE users MODIFY sppg_id INT NOT NULL;
ALTER TABLE users ADD CONSTRAINT fk_users_sppg FOREIGN KEY (sppg_id) REFERENCES sppg(id) ON DELETE CASCADE;
ALTER TABLE users DROP INDEX email;
ALTER TABLE users ADD UNIQUE KEY uq_users_sppg_email (sppg_id, email);
ALTER TABLE users ADD INDEX idx_users_sppg (sppg_id);

ALTER TABLE sessions ADD COLUMN sppg_id INT NULL AFTER user_id;
UPDATE sessions s
INNER JOIN users u ON u.id = s.user_id
SET s.sppg_id = u.sppg_id
WHERE s.sppg_id IS NULL;
ALTER TABLE sessions MODIFY sppg_id INT NOT NULL;
ALTER TABLE sessions ADD INDEX idx_sessions_sppg (sppg_id);

ALTER TABLE belanja ADD COLUMN sppg_id INT NULL AFTER id;
UPDATE belanja SET sppg_id = @default_sppg_id WHERE sppg_id IS NULL;
ALTER TABLE belanja MODIFY sppg_id INT NOT NULL;
ALTER TABLE belanja ADD CONSTRAINT fk_belanja_sppg FOREIGN KEY (sppg_id) REFERENCES sppg(id) ON DELETE CASCADE;
ALTER TABLE belanja ADD INDEX idx_belanja_sppg (sppg_id);

ALTER TABLE rekening ADD COLUMN sppg_id INT NULL AFTER id;
UPDATE rekening SET sppg_id = @default_sppg_id WHERE sppg_id IS NULL;
ALTER TABLE rekening MODIFY sppg_id INT NOT NULL;
ALTER TABLE rekening DROP INDEX uq_rekening_nomor;
ALTER TABLE rekening ADD UNIQUE KEY uq_rekening_sppg_nomor (sppg_id, nomor_rekening);
ALTER TABLE rekening ADD CONSTRAINT fk_rekening_sppg FOREIGN KEY (sppg_id) REFERENCES sppg(id) ON DELETE CASCADE;
ALTER TABLE rekening ADD INDEX idx_rekening_sppg (sppg_id);

ALTER TABLE kategori ADD COLUMN sppg_id INT NULL AFTER id;
UPDATE kategori SET sppg_id = @default_sppg_id WHERE sppg_id IS NULL;
ALTER TABLE kategori MODIFY sppg_id INT NOT NULL;
ALTER TABLE kategori DROP INDEX uq_kategori_nama;
ALTER TABLE kategori ADD UNIQUE KEY uq_kategori_sppg_nama (sppg_id, nama);
ALTER TABLE kategori ADD CONSTRAINT fk_kategori_sppg FOREIGN KEY (sppg_id) REFERENCES sppg(id) ON DELETE CASCADE;
ALTER TABLE kategori ADD INDEX idx_kategori_sppg (sppg_id);

ALTER TABLE porsi ADD COLUMN sppg_id INT NULL AFTER id;
UPDATE porsi SET sppg_id = @default_sppg_id WHERE sppg_id IS NULL;
ALTER TABLE porsi MODIFY sppg_id INT NOT NULL;
ALTER TABLE porsi ADD CONSTRAINT fk_porsi_sppg FOREIGN KEY (sppg_id) REFERENCES sppg(id) ON DELETE CASCADE;
ALTER TABLE porsi ADD INDEX idx_porsi_sppg (sppg_id);

ALTER TABLE bni_batch ADD COLUMN sppg_id INT NULL AFTER id;
UPDATE bni_batch SET sppg_id = @default_sppg_id WHERE sppg_id IS NULL;
ALTER TABLE bni_batch MODIFY sppg_id INT NOT NULL;
ALTER TABLE bni_batch ADD CONSTRAINT fk_bni_batch_sppg FOREIGN KEY (sppg_id) REFERENCES sppg(id) ON DELETE CASCADE;
ALTER TABLE bni_batch ADD INDEX idx_bni_batch_sppg (sppg_id);

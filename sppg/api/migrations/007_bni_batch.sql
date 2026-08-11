CREATE TABLE IF NOT EXISTS bni_batch (
  id INT AUTO_INCREMENT PRIMARY KEY,
  nama_file VARCHAR(120) NOT NULL,
  csv_filename VARCHAR(255) NOT NULL,
  csv_path VARCHAR(500) NOT NULL,
  debit_account VARCHAR(32) NOT NULL,
  record_count INT NOT NULL,
  total_amount BIGINT NOT NULL,
  trx_date CHAR(8) NOT NULL,
  belanja_ids JSON NOT NULL,
  status ENUM('waiting', 'approved', 'unmatched', 'cancelled') NOT NULL DEFAULT 'waiting',
  bni_reference VARCHAR(64) NULL,
  email_datetime DATETIME NULL,
  email_success_count INT NULL,
  email_success_amount BIGINT NULL,
  email_fail_count INT NULL,
  email_raw_excerpt TEXT NULL,
  matched_at DATETIME NULL,
  created_by INT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_bni_batch_reference (bni_reference),
  INDEX idx_bni_batch_waiting (status, record_count, total_amount, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS bni_email_log (
  id INT AUTO_INCREMENT PRIMARY KEY,
  message_id VARCHAR(255) NOT NULL,
  bni_reference VARCHAR(64) NULL,
  result VARCHAR(40) NOT NULL,
  detail VARCHAR(500) NULL,
  processed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_bni_email_message (message_id),
  INDEX idx_bni_email_ref (bni_reference)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

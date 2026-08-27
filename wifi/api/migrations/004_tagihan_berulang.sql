CREATE TABLE IF NOT EXISTS tagihan_berulang (
  id INT AUTO_INCREMENT PRIMARY KEY,
  pelanggan_id INT NOT NULL,
  nominal DECIMAL(14,2) NOT NULL,
  keterangan VARCHAR(500) NULL,
  jatuh_tempo_hari TINYINT UNSIGNED NOT NULL DEFAULT 10,
  aktif TINYINT(1) NOT NULL DEFAULT 1,
  created_by INT NULL,
  last_run_periode CHAR(7) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_tagihan_berulang_pelanggan FOREIGN KEY (pelanggan_id) REFERENCES pelanggan(id) ON DELETE CASCADE,
  CONSTRAINT fk_tagihan_berulang_user FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_tagihan_berulang_aktif (aktif),
  INDEX idx_tagihan_berulang_pelanggan (pelanggan_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE tagihan
  ADD COLUMN berulang_id INT NULL AFTER keterangan,
  ADD CONSTRAINT fk_tagihan_berulang FOREIGN KEY (berulang_id) REFERENCES tagihan_berulang(id) ON DELETE SET NULL,
  ADD INDEX idx_tagihan_berulang_id (berulang_id);

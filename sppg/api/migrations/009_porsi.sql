CREATE TABLE IF NOT EXISTS porsi (
  id INT AUTO_INCREMENT PRIMARY KEY,
  tanggal DATE NOT NULL,
  ukuran ENUM('besar', 'kecil') NOT NULL DEFAULT 'besar',
  energi_kkal DECIMAL(12,2) NOT NULL DEFAULT 0,
  karbohidrat_gr DECIMAL(12,2) NOT NULL DEFAULT 0,
  protein_gr DECIMAL(12,2) NOT NULL DEFAULT 0,
  lemak_gr DECIMAL(12,2) NOT NULL DEFAULT 0,
  serat_gr DECIMAL(12,2) NOT NULL DEFAULT 0,
  foto_nama VARCHAR(255) NULL,
  foto_simpan VARCHAR(255) NULL,
  foto_path VARCHAR(500) NULL,
  foto_tipe VARCHAR(100) NULL,
  foto_ukuran BIGINT NOT NULL DEFAULT 0,
  created_by INT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_porsi_user FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_porsi_tanggal (tanggal),
  INDEX idx_porsi_ukuran (ukuran)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS porsi_menu (
  id INT AUTO_INCREMENT PRIMARY KEY,
  porsi_id INT NOT NULL,
  nama VARCHAR(200) NOT NULL,
  pb DECIMAL(14,2) NOT NULL DEFAULT 0,
  pk DECIMAL(14,2) NULL,
  urutan INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_porsi_menu_porsi FOREIGN KEY (porsi_id) REFERENCES porsi(id) ON DELETE CASCADE,
  INDEX idx_porsi_menu_porsi (porsi_id),
  INDEX idx_porsi_menu_nama (nama)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

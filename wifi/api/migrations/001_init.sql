CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  email VARCHAR(255) NOT NULL UNIQUE,
  name VARCHAR(255) NULL,
  picture TEXT NULL,
  google_id VARCHAR(64) NULL UNIQUE,
  role ENUM('super_admin', 'admin', 'user', 'pending') NOT NULL DEFAULT 'pending',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS sessions (
  id VARCHAR(64) PRIMARY KEY,
  user_id INT NOT NULL,
  expires_at DATETIME NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_sessions_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_sessions_user (user_id),
  INDEX idx_sessions_expires (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS pelanggan (
  id INT AUTO_INCREMENT PRIMARY KEY,
  nama VARCHAR(255) NOT NULL,
  no_hp VARCHAR(32) NULL,
  alamat TEXT NULL,
  paket VARCHAR(120) NULL,
  aktif TINYINT(1) NOT NULL DEFAULT 1,
  keterangan VARCHAR(500) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_pelanggan_aktif (aktif),
  INDEX idx_pelanggan_nama (nama)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS tagihan (
  id INT AUTO_INCREMENT PRIMARY KEY,
  pelanggan_id INT NOT NULL,
  nama VARCHAR(120) NOT NULL,
  nominal DECIMAL(14,2) NOT NULL DEFAULT 0,
  periode_bulan TINYINT UNSIGNED NOT NULL,
  periode_tahun SMALLINT UNSIGNED NOT NULL,
  jatuh_tempo DATE NOT NULL,
  keterangan VARCHAR(500) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_tagihan_pelanggan FOREIGN KEY (pelanggan_id) REFERENCES pelanggan(id) ON DELETE CASCADE,
  INDEX idx_tagihan_pelanggan (pelanggan_id),
  INDEX idx_tagihan_periode (periode_tahun, periode_bulan),
  INDEX idx_tagihan_jatuh_tempo (jatuh_tempo)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS tagihan_bayar (
  id INT AUTO_INCREMENT PRIMARY KEY,
  tagihan_id INT NOT NULL,
  nominal DECIMAL(14,2) NOT NULL,
  tanggal DATE NOT NULL,
  via VARCHAR(16) NOT NULL DEFAULT 'cash',
  keterangan VARCHAR(500) NULL,
  created_by INT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_tagihan_bayar_tagihan FOREIGN KEY (tagihan_id) REFERENCES tagihan(id) ON DELETE CASCADE,
  CONSTRAINT fk_tagihan_bayar_user FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_tagihan_bayar_tagihan (tagihan_id),
  INDEX idx_tagihan_bayar_tanggal (tanggal)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

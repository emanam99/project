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

CREATE TABLE IF NOT EXISTS kategori (
  id INT AUTO_INCREMENT PRIMARY KEY,
  nama VARCHAR(100) NOT NULL,
  jenis ENUM('masuk', 'keluar', 'semua') NOT NULL DEFAULT 'semua',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_kategori_nama_jenis (nama, jenis)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS belanja (
  id INT AUTO_INCREMENT PRIMARY KEY,
  tanggal DATE NOT NULL,
  jenis ENUM('masuk', 'keluar') NOT NULL DEFAULT 'keluar',
  keterangan VARCHAR(500) NULL,
  kategori VARCHAR(100) NULL,
  total DECIMAL(14,2) NOT NULL DEFAULT 0,
  created_by INT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_belanja_user FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_belanja_tanggal (tanggal),
  INDEX idx_belanja_jenis (jenis),
  INDEX idx_belanja_kategori (kategori)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS belanja_item (
  id INT AUTO_INCREMENT PRIMARY KEY,
  belanja_id INT NOT NULL,
  nama_barang VARCHAR(255) NOT NULL,
  qty DECIMAL(12,3) NOT NULL DEFAULT 1,
  satuan VARCHAR(32) NOT NULL DEFAULT 'pcs',
  harga_satuan DECIMAL(14,2) NOT NULL DEFAULT 0,
  subtotal DECIMAL(14,2) NOT NULL DEFAULT 0,
  catatan VARCHAR(500) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_belanja_item_belanja FOREIGN KEY (belanja_id) REFERENCES belanja(id) ON DELETE CASCADE,
  INDEX idx_belanja_item_belanja (belanja_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS belanja_file (
  id INT AUTO_INCREMENT PRIMARY KEY,
  belanja_id INT NOT NULL,
  nama_file VARCHAR(255) NOT NULL,
  nama_file_simpan VARCHAR(255) NOT NULL,
  path_file VARCHAR(500) NOT NULL,
  tipe_file VARCHAR(100) NULL,
  ukuran_file BIGINT NOT NULL DEFAULT 0,
  uploaded_by INT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_belanja_file_belanja FOREIGN KEY (belanja_id) REFERENCES belanja(id) ON DELETE CASCADE,
  CONSTRAINT fk_belanja_file_user FOREIGN KEY (uploaded_by) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_belanja_file_belanja (belanja_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO kategori (nama, jenis) VALUES
('Sembako', 'keluar'),
('Dapur', 'keluar'),
('Makanan & minuman', 'keluar'),
('Listrik', 'keluar'),
('Air', 'keluar'),
('Internet', 'keluar'),
('Transport', 'keluar'),
('Kesehatan', 'keluar'),
('Pendidikan', 'keluar'),
('Rumah & perbaikan', 'keluar'),
('Hiburan', 'keluar'),
('Lainnya', 'keluar'),
('Gaji', 'masuk'),
('Usaha', 'masuk'),
('Transfer', 'masuk'),
('Hadiah', 'masuk'),
('Lainnya', 'masuk');

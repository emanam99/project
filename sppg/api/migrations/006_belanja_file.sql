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

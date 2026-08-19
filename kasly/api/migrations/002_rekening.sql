CREATE TABLE IF NOT EXISTS rekening (
  id INT AUTO_INCREMENT PRIMARY KEY,
  nama VARCHAR(80) NOT NULL,
  tipe ENUM('bank', 'ewallet', 'cash') NOT NULL,
  nomor VARCHAR(32) NULL,
  is_system TINYINT(1) NOT NULL DEFAULT 0,
  aktif TINYINT(1) NOT NULL DEFAULT 1,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_rekening_nama_tipe (nama, tipe),
  INDEX idx_rekening_tipe (tipe),
  INDEX idx_rekening_aktif (aktif)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO rekening (nama, tipe, nomor, is_system, aktif, sort_order)
SELECT 'Cash', 'cash', NULL, 1, 1, 0 FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM rekening WHERE tipe = 'cash' AND is_system = 1);

CREATE TABLE IF NOT EXISTS belanja_alokasi (
  id INT AUTO_INCREMENT PRIMARY KEY,
  belanja_id INT NOT NULL,
  rekening_id INT NOT NULL,
  jumlah DECIMAL(14,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_alokasi_belanja FOREIGN KEY (belanja_id) REFERENCES belanja(id) ON DELETE CASCADE,
  CONSTRAINT fk_alokasi_rekening FOREIGN KEY (rekening_id) REFERENCES rekening(id) ON DELETE RESTRICT,
  UNIQUE KEY uq_alokasi_belanja_rekening (belanja_id, rekening_id),
  INDEX idx_alokasi_rekening (rekening_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS rekening_transfer (
  id INT AUTO_INCREMENT PRIMARY KEY,
  tanggal DATE NOT NULL,
  dari_rekening_id INT NOT NULL,
  ke_rekening_id INT NOT NULL,
  jumlah DECIMAL(14,2) NOT NULL,
  keterangan VARCHAR(500) NULL,
  created_by INT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_transfer_dari FOREIGN KEY (dari_rekening_id) REFERENCES rekening(id) ON DELETE RESTRICT,
  CONSTRAINT fk_transfer_ke FOREIGN KEY (ke_rekening_id) REFERENCES rekening(id) ON DELETE RESTRICT,
  CONSTRAINT fk_transfer_user FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_transfer_tanggal (tanggal)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO belanja_alokasi (belanja_id, rekening_id, jumlah)
SELECT b.id, r.id, b.total
FROM belanja b
CROSS JOIN rekening r
WHERE r.tipe = 'cash' AND r.is_system = 1
  AND b.total > 0
  AND NOT EXISTS (SELECT 1 FROM belanja_alokasi a WHERE a.belanja_id = b.id);

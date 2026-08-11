CREATE TABLE IF NOT EXISTS kelas (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nama_kelas VARCHAR(100) NOT NULL,
    wali_kelas_id INT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uk_kelas_nama (nama_kelas),
    FOREIGN KEY (wali_kelas_id) REFERENCES pengurus(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS santri___kelas (
    id INT AUTO_INCREMENT PRIMARY KEY,
    santri_id INT NOT NULL,
    kelas_id INT NOT NULL,
    tanggal_mulai DATE NOT NULL,
    tanggal_selesai DATE NULL COMMENT 'NULL = kelas aktif saat ini',
    idp INT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (santri_id) REFERENCES santri(id) ON DELETE CASCADE,
    FOREIGN KEY (kelas_id) REFERENCES kelas(id) ON DELETE RESTRICT,
    FOREIGN KEY (idp) REFERENCES pengurus(id) ON DELETE SET NULL,
    INDEX idx_santri_aktif (santri_id, tanggal_selesai)
);

-- Seed kelas dari nilai unik kolom santri.kelas (jika ada)
INSERT IGNORE INTO kelas (nama_kelas)
SELECT DISTINCT TRIM(kelas) AS nama_kelas
FROM santri
WHERE kelas IS NOT NULL AND TRIM(kelas) <> '';

-- Riwayat kelas aktif dari data lama
INSERT INTO santri___kelas (santri_id, kelas_id, tanggal_mulai)
SELECT s.id, k.id, CURDATE()
FROM santri s
INNER JOIN kelas k ON k.nama_kelas = TRIM(s.kelas)
WHERE s.kelas IS NOT NULL AND TRIM(s.kelas) <> ''
  AND NOT EXISTS (
    SELECT 1 FROM santri___kelas sk
    WHERE sk.santri_id = s.id AND sk.tanggal_selesai IS NULL
  );

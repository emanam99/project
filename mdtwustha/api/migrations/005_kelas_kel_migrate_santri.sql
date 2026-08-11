-- Tambah kolom kel di tabel kelas (aman: hanya ADD, tidak hapus data)
ALTER TABLE kelas ADD COLUMN kel VARCHAR(50) NOT NULL DEFAULT '' AFTER nama_kelas;

-- Ganti unique key: kombinasi nama_kelas + kel
ALTER TABLE kelas DROP INDEX uk_kelas_nama;
ALTER TABLE kelas ADD UNIQUE KEY uk_kelas_nama_kel (nama_kelas, kel);

-- Isi kelas dari pasangan unik santri.kelas + santri.kel (tidak menimpa baris yang sudah ada)
INSERT IGNORE INTO kelas (nama_kelas, kel)
SELECT DISTINCT TRIM(s.kelas) AS nama_kelas, TRIM(COALESCE(s.kel, '')) AS kel
FROM santri s
WHERE TRIM(COALESCE(s.kelas, '')) <> '';

-- Tutup relasi aktif yang kelas_id tidak cocok dengan kel santri saat ini
UPDATE santri___kelas sk
INNER JOIN santri s ON s.id = sk.santri_id
INNER JOIN kelas k ON k.id = sk.kelas_id
SET sk.tanggal_selesai = CURDATE()
WHERE sk.tanggal_selesai IS NULL
  AND TRIM(COALESCE(s.kelas, '')) <> ''
  AND (
    TRIM(k.nama_kelas) <> TRIM(s.kelas)
    OR TRIM(COALESCE(k.kel, '')) <> TRIM(COALESCE(s.kel, ''))
  );

-- Buat relasi aktif baru untuk santri yang belum punya (atau baru ditutup di atas)
INSERT INTO santri___kelas (santri_id, kelas_id, tanggal_mulai)
SELECT s.id, k.id, CURDATE()
FROM santri s
INNER JOIN kelas k
  ON k.nama_kelas = TRIM(s.kelas)
 AND k.kel = TRIM(COALESCE(s.kel, ''))
WHERE TRIM(COALESCE(s.kelas, '')) <> ''
  AND NOT EXISTS (
    SELECT 1 FROM santri___kelas sk
    WHERE sk.santri_id = s.id AND sk.tanggal_selesai IS NULL
  );

-- Sinkronkan kolom legacy santri.kelas & santri.kel dari relasi aktif
UPDATE santri s
INNER JOIN santri___kelas sk ON sk.santri_id = s.id AND sk.tanggal_selesai IS NULL
INNER JOIN kelas k ON k.id = sk.kelas_id
SET s.kelas = k.nama_kelas,
    s.kel = k.kel;

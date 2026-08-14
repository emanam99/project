ALTER TABLE porsi
  ADD COLUMN judul VARCHAR(200) NULL AFTER tanggal,
  ADD INDEX idx_porsi_judul (judul);

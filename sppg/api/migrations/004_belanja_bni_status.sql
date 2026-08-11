ALTER TABLE belanja
  ADD COLUMN bni_status ENUM('belum', 'maker', 'approved') NOT NULL DEFAULT 'belum'
    AFTER kategori,
  ADD INDEX idx_belanja_bni_status (bni_status);

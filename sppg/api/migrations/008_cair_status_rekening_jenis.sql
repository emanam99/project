-- Jenis rekening: VA → cair_status jatim saat approved; Rek → cair
ALTER TABLE rekening
  ADD COLUMN jenis ENUM('va', 'rek') NOT NULL DEFAULT 'rek'
    AFTER bank_tujuan;

-- Status pencairan terpisah dari BNI (hanya super_admin yang mengubah manual)
ALTER TABLE belanja
  ADD COLUMN cair_status ENUM('jatim', 'cair') NULL DEFAULT NULL
    AFTER bni_status,
  ADD INDEX idx_belanja_cair_status (cair_status);

-- Arsip ekspor: bedakan CSV BNI vs Excel Maker
ALTER TABLE bni_batch
  ADD COLUMN export_type ENUM('bni_csv', 'maker_xlsx') NOT NULL DEFAULT 'bni_csv'
    AFTER id,
  ADD INDEX idx_bni_batch_export_type (export_type);

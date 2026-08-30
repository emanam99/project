ALTER TABLE sppg
  ADD COLUMN pwa_short_name VARCHAR(64) NULL AFTER email_kontak,
  ADD COLUMN pwa_logo_path VARCHAR(500) NULL,
  ADD COLUMN pwa_logo_tipe VARCHAR(64) NULL;

ALTER TABLE sppg
  ADD COLUMN subdomain VARCHAR(63) NULL AFTER slug,
  ADD UNIQUE KEY uq_sppg_subdomain (subdomain);

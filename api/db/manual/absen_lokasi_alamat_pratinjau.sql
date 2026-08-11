-- Alamat pratinjau titik lokasi absen (sama dengan migrasi Phinx 20260415160000).
-- Jalankan di phpMyAdmin hanya jika kolom `dusun` BELUM ada pada tabel `absen___lokasi`.
-- Cek: SHOW COLUMNS FROM `absen___lokasi` LIKE 'dusun';
-- Jika sudah ada, jangan jalankan skrip ini.

ALTER TABLE `absen___lokasi`
  ADD COLUMN `dusun` varchar(191) DEFAULT NULL COMMENT 'Alamat pratinjau (opsional)' AFTER `sort_order`,
  ADD COLUMN `rt` varchar(32) DEFAULT NULL AFTER `dusun`,
  ADD COLUMN `rw` varchar(32) DEFAULT NULL AFTER `rt`,
  ADD COLUMN `desa` varchar(191) DEFAULT NULL AFTER `rw`,
  ADD COLUMN `kecamatan` varchar(191) DEFAULT NULL AFTER `desa`,
  ADD COLUMN `kabupaten` varchar(191) DEFAULT NULL AFTER `kecamatan`,
  ADD COLUMN `provinsi` varchar(191) DEFAULT NULL AFTER `kabupaten`;

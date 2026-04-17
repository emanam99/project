-- Jalankan di phpMyAdmin jika migrasi Phinx belum dijalankan.
-- Tabel pengaturan absen + kolom jam mulai per sesi per titik lokasi (tanpa batas telat terpisah).

CREATE TABLE IF NOT EXISTS `absen___setting` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `kunci` varchar(191) NOT NULL,
  `nilai` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL COMMENT 'JSON — struktur tergantung kunci',
  `tanggal_ubah` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_absen_setting_kunci` (`kunci`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci ROW_FORMAT=DYNAMIC
COMMENT='Pengaturan absen (jadwal default, sidik jari, dll.)';

INSERT IGNORE INTO `absen___setting` (`kunci`, `nilai`) VALUES
('jadwal_default', '{"pagi":{"mulai":"06:00"},"sore":{"mulai":"15:00"},"malam":{"mulai":"19:00"}}'),
('sidik_jari_default', '{"ikut_jadwal_default":true,"toleransi_telat_menit":0}');

-- Kolom jam mulai di absen___lokasi (abaikan error jika sudah ada)
ALTER TABLE `absen___lokasi`
  ADD COLUMN `jam_mulai_pagi` time DEFAULT NULL COMMENT 'NULL = pakai default global' AFTER `sort_order`,
  ADD COLUMN `jam_mulai_sore` time DEFAULT NULL AFTER `jam_mulai_pagi`,
  ADD COLUMN `jam_mulai_malam` time DEFAULT NULL AFTER `jam_mulai_sore`;

<?php

declare(strict_types=1);

use Phinx\Migration\AbstractMigration;

/**
 * Tabel psb___tes — riwayat nilai & keputusan rapor tes Madrasah Diniyah (PSB).
 */
final class PsbTes extends AbstractMigration
{
    public function up(): void
    {
        if ($this->hasTable('psb___tes')) {
            return;
        }

        $this->execute('SET NAMES utf8mb4');
        $this->execute('SET FOREIGN_KEY_CHECKS = 0');

        $this->execute(<<<'SQL'
CREATE TABLE IF NOT EXISTS `psb___tes` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `id_santri` int(7) NOT NULL,
  `id_registrasi` int(11) DEFAULT NULL,
  `tahun_hijriyah` varchar(50) NOT NULL,
  `tahun_masehi` varchar(50) NOT NULL,
  `tanggal_tes_hijriyah` varchar(10) DEFAULT NULL COMMENT 'Y-m-d Hijriyah',
  `t1_membaca` varchar(50) DEFAULT NULL,
  `t1_menulis` varchar(50) DEFAULT NULL,
  `t1_jumlah` varchar(50) DEFAULT NULL,
  `t1_keputusan` varchar(30) DEFAULT NULL COMMENT 'istidadiyah|lanjut_t2',
  `t2_kitab` varchar(50) DEFAULT NULL,
  `t2_nahwu_sharaf_5` varchar(50) DEFAULT NULL,
  `t2_nahwu_sharaf_6` varchar(50) DEFAULT NULL,
  `t2_jumlah` varchar(50) DEFAULT NULL,
  `t2_keputusan_kelas` varchar(10) DEFAULT NULL COMMENT '4|5|6',
  `t2_lanjut_t3` tinyint(1) NOT NULL DEFAULT 0,
  `t3_baca` varchar(50) DEFAULT NULL,
  `t3_nahwu` varchar(50) DEFAULT NULL,
  `t3_sharaf` varchar(50) DEFAULT NULL,
  `t3_jumlah` varchar(50) DEFAULT NULL,
  `t3_keputusan_kelas` varchar(10) DEFAULT NULL COMMENT '1|2',
  `t3_lanjut_t4` tinyint(1) NOT NULL DEFAULT 0,
  `t4_baca` varchar(50) DEFAULT NULL,
  `t4_fiqih` varchar(50) DEFAULT NULL,
  `t4_nahwu` varchar(50) DEFAULT NULL,
  `t4_balaghah` varchar(50) DEFAULT NULL,
  `t4_jumlah` varchar(50) DEFAULT NULL,
  `t4_keputusan` varchar(20) DEFAULT NULL COMMENT '3_wustha|1_ulya',
  `tanggal_surat_hijriyah` varchar(10) DEFAULT NULL COMMENT 'Y-m-d Hijriyah',
  `nama_ketua_panitia` varchar(100) DEFAULT NULL,
  `id_admin` int(7) DEFAULT NULL,
  `tanggal_dibuat` timestamp NULL DEFAULT current_timestamp(),
  `tanggal_update` timestamp NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_psb_tes_santri_ta` (`id_santri`,`tahun_hijriyah`,`tahun_masehi`),
  KEY `idx_psb_tes_registrasi` (`id_registrasi`),
  KEY `idx_psb_tes_id_admin` (`id_admin`),
  CONSTRAINT `fk_psb_tes_id_santri` FOREIGN KEY (`id_santri`) REFERENCES `santri` (`id`) ON UPDATE CASCADE,
  CONSTRAINT `fk_psb_tes_id_registrasi` FOREIGN KEY (`id_registrasi`) REFERENCES `psb___registrasi` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_psb_tes_id_admin` FOREIGN KEY (`id_admin`) REFERENCES `pengurus` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
SQL);

        $this->execute('SET FOREIGN_KEY_CHECKS = 1');
    }

    public function down(): void
    {
        if (!$this->hasTable('psb___tes')) {
            return;
        }

        $this->execute('SET FOREIGN_KEY_CHECKS = 0');
        $this->execute('DROP TABLE IF EXISTS `psb___tes`');
        $this->execute('SET FOREIGN_KEY_CHECKS = 1');
    }
}

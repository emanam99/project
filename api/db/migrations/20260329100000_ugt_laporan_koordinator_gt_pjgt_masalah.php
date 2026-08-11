<?php

declare(strict_types=1);

use Phinx\Migration\AbstractMigration;

/**
 * Laporan UGT bulanan: koordinator (foto + usulan), GT (kehadiran & kegiatan), PJGT (nilai hubungan), masalah (polimorfik ke salah satu laporan).
 *
 * - id_tahun_ajaran = VARCHAR FK ke tahun_ajaran.tahun_ajaran (bukan INT)
 * - bulan = 1–12 (frontend memetakan ke bulan Hijriyah)
 * - ugt___masalah: id_laporan + laporan_jenis (koordonator|gt|pjgt) atau keduanya NULL
 */
final class UgtLaporanKoordinatorGtPjgtMasalah extends AbstractMigration
{
    public function up(): void
    {
        $this->execute('SET NAMES utf8mb4');
        $this->execute('SET FOREIGN_KEY_CHECKS = 0');

        $this->execute(<<<'SQL'
CREATE TABLE IF NOT EXISTS `ugt___koordonator` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `id_madrasah` int(11) NOT NULL COMMENT 'FK madrasah',
  `id_santri` int(11) NOT NULL COMMENT 'FK santri',
  `foto` varchar(500) DEFAULT NULL COMMENT 'Path relatif upload (mis. uploads/ugt/...)',
  `id_tahun_ajaran` varchar(50) NOT NULL COMMENT 'FK tahun_ajaran.tahun_ajaran',
  `bulan` tinyint(3) unsigned NOT NULL COMMENT '1–12; UI: bulan Hijriyah',
  `usulan` text DEFAULT NULL,
  `tanggal_dibuat` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_madrasah_santri` (`id_madrasah`,`id_santri`),
  KEY `idx_ta_bulan` (`id_tahun_ajaran`,`bulan`),
  KEY `idx_santri` (`id_santri`),
  CONSTRAINT `fk_ugt_koordonator_madrasah` FOREIGN KEY (`id_madrasah`) REFERENCES `madrasah` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `fk_ugt_koordonator_santri` FOREIGN KEY (`id_santri`) REFERENCES `santri` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_ugt_koordonator_ta` FOREIGN KEY (`id_tahun_ajaran`) REFERENCES `tahun_ajaran` (`tahun_ajaran`) ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Laporan koordinator UGT per bulan'
SQL);

        $this->execute(<<<'SQL'
CREATE TABLE IF NOT EXISTS `ugt___gt` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `id_madrasah` int(11) NOT NULL,
  `id_santri` int(11) NOT NULL,
  `id_tahun_ajaran` varchar(50) NOT NULL COMMENT 'FK tahun_ajaran.tahun_ajaran',
  `bulan` tinyint(3) unsigned NOT NULL COMMENT '1–12; UI: bulan Hijriyah',
  `wali_kelas` varchar(255) DEFAULT NULL COMMENT 'Kelas dan tingkatan',
  `fan_kelas` varchar(255) DEFAULT NULL COMMENT 'Kelas dan tingkatan (fan)',
  `pulang` int(11) NOT NULL DEFAULT 0 COMMENT 'Jumlah tidak masuk (pulang) bulan ini',
  `sakit` int(11) NOT NULL DEFAULT 0 COMMENT 'Jumlah tidak masuk (sakit)',
  `udzur` int(11) NOT NULL DEFAULT 0 COMMENT 'Jumlah tidak masuk (udzur)',
  `banin_banat` varchar(20) DEFAULT NULL COMMENT 'Banin / Banat / Campur',
  `muallim_quran` varchar(10) DEFAULT NULL COMMENT 'Iya / Tidak',
  `waktu_muallim` varchar(10) DEFAULT NULL COMMENT 'pagi / siang / malam',
  `ngaji_kitab` varchar(10) DEFAULT NULL COMMENT 'Iya / Tidak',
  `waktu_ngaji` varchar(10) DEFAULT NULL COMMENT 'pagi / siang / malam',
  `imam` varchar(10) DEFAULT NULL COMMENT 'Iya / Tidak',
  `ket_imam` varchar(20) DEFAULT NULL COMMENT 'masjid / surau',
  `tugas_selanjutnya` text DEFAULT NULL,
  `usulan` text DEFAULT NULL,
  `tanggal_dibuat` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_madrasah_santri` (`id_madrasah`,`id_santri`),
  KEY `idx_ta_bulan` (`id_tahun_ajaran`,`bulan`),
  KEY `idx_santri` (`id_santri`),
  CONSTRAINT `fk_ugt_gt_madrasah` FOREIGN KEY (`id_madrasah`) REFERENCES `madrasah` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `fk_ugt_gt_santri` FOREIGN KEY (`id_santri`) REFERENCES `santri` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_ugt_gt_ta` FOREIGN KEY (`id_tahun_ajaran`) REFERENCES `tahun_ajaran` (`tahun_ajaran`) ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Laporan GT UGT per bulan'
SQL);

        $this->execute(<<<'SQL'
CREATE TABLE IF NOT EXISTS `ugt___pjgt` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `id_madrasah` int(11) NOT NULL,
  `id_santri` int(11) NOT NULL,
  `ubudiyah` varchar(20) DEFAULT NULL COMMENT 'Baik / Cukup / Kurang',
  `murid` varchar(20) DEFAULT NULL COMMENT 'Baik / Cukup / Kurang',
  `wali_murid` varchar(20) DEFAULT NULL,
  `pjgt` varchar(20) DEFAULT NULL,
  `kepala` varchar(20) DEFAULT NULL,
  `guru` varchar(20) DEFAULT NULL,
  `masyarakat` varchar(20) DEFAULT NULL,
  `usulan` text DEFAULT NULL,
  `tanggal_dibuat` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_madrasah_santri` (`id_madrasah`,`id_santri`),
  KEY `idx_santri` (`id_santri`),
  CONSTRAINT `fk_ugt_pjgt_madrasah` FOREIGN KEY (`id_madrasah`) REFERENCES `madrasah` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `fk_ugt_pjgt_santri` FOREIGN KEY (`id_santri`) REFERENCES `santri` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Laporan PJGT — penilaian hubungan'
SQL);

        $this->execute(<<<'SQL'
CREATE TABLE IF NOT EXISTS `ugt___masalah` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `id_madrasah` int(11) NOT NULL,
  `id_santri` int(11) NOT NULL,
  `id_laporan` int(11) DEFAULT NULL COMMENT 'ID baris di ugt___koordonator / ugt___gt / ugt___pjgt',
  `laporan_jenis` varchar(20) DEFAULT NULL COMMENT 'koordonator | gt | pjgt; NULL jika id_laporan NULL',
  `masalah` text DEFAULT NULL,
  `solusi` text DEFAULT NULL,
  `saran` text DEFAULT NULL,
  `tanggal_dibuat` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_madrasah_santri` (`id_madrasah`,`id_santri`),
  KEY `idx_laporan` (`laporan_jenis`,`id_laporan`),
  KEY `idx_santri` (`id_santri`),
  CONSTRAINT `fk_ugt_masalah_madrasah` FOREIGN KEY (`id_madrasah`) REFERENCES `madrasah` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `fk_ugt_masalah_santri` FOREIGN KEY (`id_santri`) REFERENCES `santri` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Masalah terkait laporan UGT (polimorfik)'
SQL);

        $this->execute('SET FOREIGN_KEY_CHECKS = 1');
    }

    public function down(): void
    {
        $this->execute('SET FOREIGN_KEY_CHECKS = 0');
        $this->execute('DROP TABLE IF EXISTS `ugt___masalah`');
        $this->execute('DROP TABLE IF EXISTS `ugt___pjgt`');
        $this->execute('DROP TABLE IF EXISTS `ugt___gt`');
        $this->execute('DROP TABLE IF EXISTS `ugt___koordonator`');
        $this->execute('SET FOREIGN_KEY_CHECKS = 1');
    }
}

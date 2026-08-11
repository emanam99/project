<?php

declare(strict_types=1);

use Phinx\Migration\AbstractMigration;

/**
 * uwaba, uwaba___bayar, uwaba___tunggakan, uwaba___bayar_tunggakan, uwaba___khusus, uwaba___bayar_khusus.
 * Semua definisi inline di PHP. Butuh payment (migrasi 07).
 */
final class UwabaPendaftaran extends AbstractMigration
{
    public function up(): void
    {
        $this->execute('SET FOREIGN_KEY_CHECKS = 0');

        $sqls = [
            "CREATE TABLE IF NOT EXISTS `uwaba` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `id_santri` int(7) NOT NULL,
  `wajib` int(11) DEFAULT NULL,
  `nominal` int(11) DEFAULT NULL,
  `id_bulan` int(11) DEFAULT NULL,
  `bulan` varchar(20) NOT NULL,
  `tahun_ajaran` varchar(50) NOT NULL,
  `keterangan` text DEFAULT NULL,
  `is_disabled` tinyint(1) DEFAULT 0,
  `sama` tinyint(1) NOT NULL DEFAULT 1,
  `json` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`json`)),
  PRIMARY KEY (`id`),
  KEY `ids` (`id_santri`),
  KEY `tahun_ajaran` (`tahun_ajaran`),
  KEY `id_bulan` (`id_bulan`),
  CONSTRAINT `fk_uwaba_id_santri` FOREIGN KEY (`id_santri`) REFERENCES `santri` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",
            "CREATE TABLE IF NOT EXISTS `uwaba___bayar` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `id_payment` int(11) DEFAULT NULL,
  `id_santri` int(7) DEFAULT NULL,
  `nominal` int(11) DEFAULT NULL,
  `via` varchar(20) DEFAULT NULL,
  `tahun_ajaran` varchar(10) DEFAULT NULL,
  `hijriyah` varchar(20) DEFAULT NULL,
  `masehi` timestamp NULL DEFAULT current_timestamp(),
  `id_admin` int(11) DEFAULT NULL,
  `admin` varchar(255) DEFAULT NULL,
  `nomor` int(11) NOT NULL,
  `tanggal_dibuat` timestamp NOT NULL DEFAULT current_timestamp(),
  `tanggal_update` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `ids` (`id_santri`),
  KEY `tahun_ajaran` (`tahun_ajaran`),
  KEY `fk_syahriah_histori_id_payment` (`id_payment`),
  KEY `fk_uwaba_bayar_id_admin` (`id_admin`),
  CONSTRAINT `fk_uwaba_bayar_id_admin` FOREIGN KEY (`id_admin`) REFERENCES `pengurus` (`id`) ON UPDATE CASCADE,
  CONSTRAINT `fk_uwaba_bayar_id_payment` FOREIGN KEY (`id_payment`) REFERENCES `payment` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_uwaba_bayar_id_santri` FOREIGN KEY (`id_santri`) REFERENCES `santri` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",
            "CREATE TABLE IF NOT EXISTS `uwaba___tunggakan` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `id_santri` int(7) DEFAULT NULL,
  `wajib` int(11) DEFAULT NULL,
  `keterangan_1` varchar(255) DEFAULT NULL,
  `keterangan_2` varchar(255) DEFAULT NULL,
  `tahun_ajaran` varchar(20) DEFAULT NULL,
  `lembaga` varchar(20) DEFAULT NULL,
  `tanggal_dibuat` timestamp NOT NULL DEFAULT current_timestamp(),
  `tanggal_update` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  `id_admin` int(11) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `id_santri` (`id_santri`),
  KEY `fk_tunggakan_id_admin` (`id_admin`),
  CONSTRAINT `fk_tunggakan_id_admin` FOREIGN KEY (`id_admin`) REFERENCES `pengurus` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_tunggakan_santri` FOREIGN KEY (`id_santri`) REFERENCES `santri` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",
            "CREATE TABLE IF NOT EXISTS `uwaba___bayar_tunggakan` (
  `tanggal_dibuat` timestamp NOT NULL DEFAULT current_timestamp(),
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `id_payment` int(11) DEFAULT NULL,
  `id_santri` int(7) NOT NULL,
  `id_tunggakan` int(11) DEFAULT NULL,
  `nominal` int(11) DEFAULT NULL,
  `via` varchar(20) DEFAULT 'Cash',
  `id_admin` int(11) DEFAULT NULL,
  `admin` varchar(255) DEFAULT NULL,
  `hijriyah` varchar(50) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `id_santri` (`id_santri`),
  KEY `fk_bayar_tunggakan_id` (`id_tunggakan`),
  KEY `fk_uwaba_bayar_tunggakan_id_payment` (`id_payment`),
  CONSTRAINT `fk_bayar_tunggakan_id` FOREIGN KEY (`id_tunggakan`) REFERENCES `uwaba___tunggakan` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_bayartunggakan_id_admin` FOREIGN KEY (`id_admin`) REFERENCES `pengurus` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_tunggakan_id_santri` FOREIGN KEY (`id_santri`) REFERENCES `santri` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_uwaba_bayar_tunggakan_id_payment` FOREIGN KEY (`id_payment`) REFERENCES `payment` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",
            "CREATE TABLE IF NOT EXISTS `uwaba___khusus` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `id_santri` int(7) DEFAULT NULL,
  `wajib` int(11) DEFAULT NULL,
  `keterangan_1` varchar(255) DEFAULT NULL,
  `keterangan_2` varchar(255) DEFAULT NULL,
  `tahun_ajaran` varchar(20) DEFAULT NULL,
  `lembaga` varchar(20) DEFAULT NULL,
  `tanggal_dibuat` timestamp NOT NULL DEFAULT current_timestamp(),
  `tanggal_update` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  `id_admin` int(11) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `id_santri` (`id_santri`),
  KEY `fk_khusus_id_admin` (`id_admin`),
  CONSTRAINT `fk_khusus_id_admin` FOREIGN KEY (`id_admin`) REFERENCES `pengurus` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_khusus_santri` FOREIGN KEY (`id_santri`) REFERENCES `santri` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",
            "CREATE TABLE IF NOT EXISTS `uwaba___bayar_khusus` (
  `tanggal_dibuat` timestamp NOT NULL DEFAULT current_timestamp(),
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `id_payment` int(11) DEFAULT NULL,
  `id_santri` int(7) NOT NULL,
  `id_khusus` int(11) DEFAULT NULL,
  `nominal` int(11) DEFAULT NULL,
  `via` varchar(20) DEFAULT NULL,
  `id_admin` int(11) DEFAULT NULL,
  `admin` varchar(255) DEFAULT NULL,
  `hijriyah` varchar(50) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `id_santri` (`id_santri`),
  KEY `fk_bayar_khusus_id` (`id_khusus`),
  KEY `fk_uwaba_bayar_khusus_id_payment` (`id_payment`),
  CONSTRAINT `fk_bayar_khusus_id` FOREIGN KEY (`id_khusus`) REFERENCES `uwaba___khusus` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_bayarkhusus_id_admin` FOREIGN KEY (`id_admin`) REFERENCES `pengurus` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_khusus_id_santri` FOREIGN KEY (`id_santri`) REFERENCES `santri` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_uwaba_bayar_khusus_id_payment` FOREIGN KEY (`id_payment`) REFERENCES `payment` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",
        ];
        foreach ($sqls as $sql) {
            $this->execute($sql);
        }

        $this->execute('SET FOREIGN_KEY_CHECKS = 1');
    }

    public function down(): void
    {
        $this->execute('SET FOREIGN_KEY_CHECKS = 0');
        $this->execute('DROP TABLE IF EXISTS uwaba___bayar_khusus');
        $this->execute('DROP TABLE IF EXISTS uwaba___khusus');
        $this->execute('DROP TABLE IF EXISTS uwaba___bayar_tunggakan');
        $this->execute('DROP TABLE IF EXISTS uwaba___tunggakan');
        $this->execute('DROP TABLE IF EXISTS uwaba___bayar');
        $this->execute('DROP TABLE IF EXISTS uwaba');
        $this->execute('SET FOREIGN_KEY_CHECKS = 1');
    }
}

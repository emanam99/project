<?php

declare(strict_types=1);

use Phinx\Migration\AbstractMigration;

/**
 * Jadwal pelajaran per mapel (lembaga___kitab) + grant tab Jadwal ke role yang punya menu.kurikulum.
 */
final class LembagaJadwalAndTabGrant extends AbstractMigration
{
    public function up(): void
    {
        $this->execute('SET NAMES utf8mb4');
        $this->execute('SET FOREIGN_KEY_CHECKS = 0');

        if (!$this->hasTable('lembaga___jadwal')) {
            $this->execute(<<<'SQL'
CREATE TABLE `lembaga___jadwal` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `id_lembaga_kitab` int(11) NOT NULL COMMENT 'FK lembaga___kitab (mapel per rombel)',
  `id_pengurus` int(11) NOT NULL COMMENT 'Pengajar',
  `pola` enum('mingguan','bulanan','opsional') NOT NULL,
  `hari` tinyint(4) DEFAULT NULL COMMENT '1=Senin … 7=Minggu (pola mingguan)',
  `tanggal_bulan` tinyint(4) DEFAULT NULL COMMENT '1–31 (pola bulanan, Masehi)',
  `tanggal` date DEFAULT NULL COMMENT 'Tanggal tertentu (pola opsional, Masehi)',
  `jam_mulai` time NOT NULL,
  `jam_selesai` time NOT NULL,
  `status` varchar(20) NOT NULL DEFAULT 'aktif',
  `tanggal_dibuat` timestamp NOT NULL DEFAULT current_timestamp(),
  `tanggal_update` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_lembaga_kitab` (`id_lembaga_kitab`),
  KEY `idx_pengurus` (`id_pengurus`),
  KEY `idx_pola` (`pola`),
  KEY `idx_status` (`status`),
  CONSTRAINT `fk_lembaga_jadwal_kitab` FOREIGN KEY (`id_lembaga_kitab`) REFERENCES `lembaga___kitab` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_lembaga_jadwal_pengurus` FOREIGN KEY (`id_pengurus`) REFERENCES `pengurus` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Jadwal pelajaran per mapel/rombel'
SQL);
        }

        $this->execute('SET FOREIGN_KEY_CHECKS = 1');

        $this->execute(<<<'SQL'
INSERT IGNORE INTO `role___fitur` (`role_id`, `fitur_id`)
SELECT DISTINCT rf.`role_id`, fj.`id`
FROM `role___fitur` rf
INNER JOIN `app___fitur` fm ON fm.`id` = rf.`fitur_id` AND fm.`id_app` = 1 AND fm.`code` = 'menu.kurikulum'
INNER JOIN `app___fitur` fj ON fj.`id_app` = 1 AND fj.`code` = 'action.kurikulum.tab.jadwal'
SQL);
    }

    public function down(): void
    {
        $this->execute('SET FOREIGN_KEY_CHECKS = 0');
        $this->execute('DROP TABLE IF EXISTS `lembaga___jadwal`');
        $this->execute('SET FOREIGN_KEY_CHECKS = 1');

        $this->execute(<<<'SQL'
DELETE rf FROM `role___fitur` rf
INNER JOIN `app___fitur` f ON f.`id` = rf.`fitur_id` AND f.`id_app` = 1 AND f.`code` = 'action.kurikulum.tab.jadwal'
INNER JOIN `role` r ON r.`id` = rf.`role_id`
WHERE r.`key` <> 'super_admin'
SQL);
    }
}

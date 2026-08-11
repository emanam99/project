<?php

declare(strict_types=1);

use Phinx\Migration\AbstractMigration;

/**
 * Modul ujian: header per mapel (lembaga___kitab) + peserta (absensi & nilai).
 * Menu menu.ujian + action.ujian.halaman; penugasan role mengikuti menu.mapel / action.mapel.halaman.
 */
final class UjianModul extends AbstractMigration
{
    public function up(): void
    {
        $this->execute('SET NAMES utf8mb4');
        $this->execute('SET FOREIGN_KEY_CHECKS = 0');

        if (!$this->hasTable('lembaga___kitab')) {
            $this->execute('SET FOREIGN_KEY_CHECKS = 1');

            return;
        }

        if (!$this->hasTable('ujian')) {
            $this->execute(<<<'SQL'
CREATE TABLE IF NOT EXISTS `ujian` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `id_lembaga_kitab` int(11) NOT NULL COMMENT 'FK lembaga___kitab (mapel per rombel)',
  `judul` varchar(255) NOT NULL DEFAULT '',
  `jenis` varchar(64) DEFAULT NULL COMMENT 'mis. harian, UTS, UAS',
  `tanggal_masehi` date NOT NULL,
  `jam_mulai` time DEFAULT NULL,
  `jam_selesai` time DEFAULT NULL,
  `tanggal_hijriyah` varchar(16) DEFAULT NULL COMMENT 'Y-m-d hijri, cache dari psa___kalender',
  `id_user_pembuat` int(11) DEFAULT NULL,
  `tanggal_dibuat` timestamp NOT NULL DEFAULT current_timestamp(),
  `tanggal_update` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_ujian_tgl` (`tanggal_masehi`),
  KEY `idx_ujian_lk` (`id_lembaga_kitab`),
  CONSTRAINT `fk_ujian_lembaga_kitab` FOREIGN KEY (`id_lembaga_kitab`) REFERENCES `lembaga___kitab` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Sesi ujian per mapel (rombel+kitab)'
SQL);
        }

        if (!$this->hasTable('ujian___peserta')) {
            $this->execute(<<<'SQL'
CREATE TABLE IF NOT EXISTS `ujian___peserta` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `id_ujian` int(11) NOT NULL,
  `id_santri` int(11) NOT NULL,
  `kehadiran` varchar(24) NOT NULL DEFAULT 'hadir',
  `nilai` decimal(6,2) DEFAULT NULL,
  `catatan` text DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_ujian_santri` (`id_ujian`,`id_santri`),
  KEY `idx_ujian_peserta_santri` (`id_santri`),
  CONSTRAINT `fk_ujian_peserta_ujian` FOREIGN KEY (`id_ujian`) REFERENCES `ujian` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_ujian_peserta_santri` FOREIGN KEY (`id_santri`) REFERENCES `santri` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Kehadiran & nilai per santri per ujian'
SQL);
        }

        $this->execute('SET FOREIGN_KEY_CHECKS = 1');

        $conn = $this->getAdapter()->getConnection();
        $metaEsc = str_replace("'", "''", '{"requiresRole":["super_admin","tarbiyah","admin_lembaga"]}');

        $conn->exec(<<<SQL
INSERT IGNORE INTO `app___fitur` (`id_app`, `parent_id`, `type`, `code`, `label`, `path`, `icon_key`, `group_label`, `sort_order`, `meta_json`)
VALUES (1, NULL, 'menu', 'menu.ujian', 'Ujian', '/ujian', 'academic', 'Lembaga', 111, NULL)
SQL);

        $stmt = $conn->prepare('SELECT `id` FROM `app___fitur` WHERE `id_app` = 1 AND `code` = ? AND `type` = \'menu\' LIMIT 1');
        $stmt->execute(['menu.ujian']);
        $row = $stmt->fetch(\PDO::FETCH_ASSOC);
        if ($row === false || empty($row['id'])) {
            return;
        }
        $parentId = (int) $row['id'];

        $ins = $conn->prepare(
            'INSERT IGNORE INTO `app___fitur` (`id_app`, `parent_id`, `type`, `code`, `label`, `path`, `icon_key`, `group_label`, `sort_order`, `meta_json`) '
            . 'VALUES (1, ?, \'action\', ?, ?, NULL, NULL, \'Lembaga\', ?, \'' . $metaEsc . '\')'
        );
        $ins->execute([$parentId, 'action.ujian.halaman', 'Ujian · Akses halaman', 5]);

        $conn->exec(<<<SQL
INSERT IGNORE INTO `role___fitur` (`role_id`, `fitur_id`)
SELECT r.id, f.id FROM `role` r
CROSS JOIN `app___fitur` f
WHERE r.`key` = 'super_admin'
AND f.`id_app` = 1 AND f.`type` = 'action' AND f.`code` = 'action.ujian.halaman'
SQL);

        $conn->exec(<<<SQL
INSERT IGNORE INTO `role___fitur` (`role_id`, `fitur_id`)
SELECT DISTINCT rf.`role_id`, fnew.`id`
FROM `role___fitur` rf
INNER JOIN `app___fitur` fold ON fold.`id` = rf.`fitur_id`
  AND fold.`code` = 'menu.ujian' AND fold.`id_app` = 1 AND fold.`type` = 'menu'
INNER JOIN `app___fitur` fnew ON fnew.`parent_id` = fold.`id`
  AND fnew.`id_app` = 1 AND fnew.`type` = 'action'
  AND fnew.`code` = 'action.ujian.halaman'
SQL);

        $conn->exec(<<<SQL
INSERT IGNORE INTO `role___fitur` (`role_id`, `fitur_id`)
SELECT DISTINCT rf.`role_id`, fu.`id`
FROM `role___fitur` rf
INNER JOIN `app___fitur` fm ON fm.`id` = rf.`fitur_id` AND fm.`code` = 'menu.mapel' AND fm.`id_app` = 1 AND fm.`type` = 'menu'
CROSS JOIN `app___fitur` fu ON fu.`code` = 'menu.ujian' AND fu.`id_app` = 1 AND fu.`type` = 'menu'
SQL);

        $conn->exec(<<<SQL
INSERT IGNORE INTO `role___fitur` (`role_id`, `fitur_id`)
SELECT DISTINCT rf.`role_id`, fa.`id`
FROM `role___fitur` rf
INNER JOIN `app___fitur` fold ON fold.`id` = rf.`fitur_id`
  AND fold.`code` = 'action.mapel.halaman' AND fold.`id_app` = 1 AND fold.`type` = 'action'
INNER JOIN `app___fitur` fa ON fa.`code` = 'action.ujian.halaman' AND fa.`id_app` = 1 AND fa.`type` = 'action'
SQL);
    }

    public function down(): void
    {
        $this->execute(
            "DELETE FROM `app___fitur` WHERE `id_app` = 1 AND `type` = 'action' AND `code` = 'action.ujian.halaman'"
        );
        $this->execute(
            "DELETE FROM `app___fitur` WHERE `id_app` = 1 AND `type` = 'menu' AND `code` = 'menu.ujian'"
        );
        $this->execute('SET FOREIGN_KEY_CHECKS = 0');
        $this->execute('DROP TABLE IF EXISTS `ujian___peserta`');
        $this->execute('DROP TABLE IF EXISTS `ujian`');
        $this->execute('SET FOREIGN_KEY_CHECKS = 1');
    }
}

<?php

declare(strict_types=1);

use Phinx\Migration\AbstractMigration;

/**
 * Status rekap Bisyaroh per lembaga (pengajuan → ditinjau → rilis); Histori hanya baris saat rilis.
 * Aksi action.bisyaroh.rekap.rilis — siapa boleh merilis (default: super_admin).
 */
final class BisyarohRekapStatusLembaga extends AbstractMigration
{
    public function up(): void
    {
        if (!$this->hasTable('bisyaroh') || !$this->hasTable('lembaga')) {
            return;
        }

        $this->execute(<<<'SQL'
CREATE TABLE IF NOT EXISTS `bisyaroh___rekap_status_lembaga` (
  `bisyaroh_id` int(11) NOT NULL,
  `lembaga_id` varchar(50) NOT NULL,
  `periode_bulan` char(7) NOT NULL COMMENT 'YYYY-MM',
  `kalender` varchar(16) NOT NULL DEFAULT 'masehi',
  `status` enum('pengajuan','ditinjau','rilis') NOT NULL DEFAULT 'pengajuan',
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  `updated_by_pengurus_id` int(7) DEFAULT NULL,
  PRIMARY KEY (`bisyaroh_id`,`lembaga_id`,`periode_bulan`,`kalender`),
  KEY `idx_bisyaroh_rekap_stat_lemb` (`lembaga_id`),
  KEY `idx_bisyaroh_rekap_stat_status` (`status`),
  CONSTRAINT `fk_bisyaroh_rekap_stat_bisyaroh` FOREIGN KEY (`bisyaroh_id`) REFERENCES `bisyaroh` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_bisyaroh_rekap_stat_lembaga` FOREIGN KEY (`lembaga_id`) REFERENCES `lembaga` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_bisyaroh_rekap_stat_pengurus` FOREIGN KEY (`updated_by_pengurus_id`) REFERENCES `pengurus` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci ROW_FORMAT=DYNAMIC
COMMENT='Status alur rekap Bisyaroh per set+lembaga+periode'
SQL);

        $conn = $this->getAdapter()->getConnection();
        $meta = '{"requiresRole":["super_admin","tarbiyah","admin_lembaga"]}';
        $metaEsc = str_replace("'", "''", $meta);

        $stmt = $conn->prepare('SELECT `id` FROM `app___fitur` WHERE `id_app` = 1 AND `code` = ? AND `type` = \'menu\' LIMIT 1');
        $stmt->execute(['menu.bisyaroh']);
        $row = $stmt->fetch(\PDO::FETCH_ASSOC);
        if ($row === false || empty($row['id'])) {
            return;
        }
        $parentId = (int) $row['id'];

        $conn->exec(
            'INSERT IGNORE INTO `app___fitur` (`id_app`, `parent_id`, `type`, `code`, `label`, `path`, `icon_key`, `group_label`, `sort_order`, `meta_json`) '
            . "VALUES (1, {$parentId}, 'action', 'action.bisyaroh.rekap.rilis', 'Bisyaroh · Merilis rekap (per lembaga)', NULL, NULL, 'Lembaga', 16, '{$metaEsc}')"
        );

        $conn->exec(<<<'SQL'
INSERT IGNORE INTO `role___fitur` (`role_id`, `fitur_id`)
SELECT r.id, f.id FROM `role` r
CROSS JOIN `app___fitur` f
WHERE r.`key` = 'super_admin'
AND f.`id_app` = 1 AND f.`type` = 'action' AND f.`code` = 'action.bisyaroh.rekap.rilis'
SQL);
    }

    public function down(): void
    {
        $this->execute(
            "DELETE FROM `app___fitur` WHERE `id_app` = 1 AND `type` = 'action' AND `code` = 'action.bisyaroh.rekap.rilis'"
        );
        $this->execute('DROP TABLE IF EXISTS `bisyaroh___rekap_status_lembaga`');
    }
}

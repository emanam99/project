<?php

declare(strict_types=1);

use Phinx\Migration\AbstractMigration;

/**
 * Potong hasil Bisyaroh ke pembayaran UWABA santri (user MyBeddian terkait).
 * RBAC terpisah: aturan.kolom vs aturan.potong_kewajiban.
 */
final class BisyarohPotongKewajibanMybeddian extends AbstractMigration
{
    public function up(): void
    {
        if (!$this->hasTable('bisyaroh') || !$this->hasTable('users') || !$this->hasTable('santri')) {
            return;
        }

        if (!$this->table('bisyaroh')->hasColumn('potong_kewajiban_aktif')) {
            $this->execute(
                'ALTER TABLE `bisyaroh` ADD COLUMN `potong_kewajiban_aktif` tinyint(1) NOT NULL DEFAULT 0 COMMENT \'1=rilis rekap bisa memotong ke UWABA\' AFTER `aktif`'
            );
        }
        if (!$this->table('bisyaroh')->hasColumn('potong_kewajiban_users_id')) {
            $this->execute(
                'ALTER TABLE `bisyaroh` ADD COLUMN `potong_kewajiban_users_id` int(11) DEFAULT NULL COMMENT \'users.id — akun yang punya santri MyBeddian\' AFTER `potong_kewajiban_aktif`'
            );
            $this->execute(
                'ALTER TABLE `bisyaroh` ADD CONSTRAINT `fk_bisyaroh_potong_users` FOREIGN KEY (`potong_kewajiban_users_id`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE'
            );
        }

        $this->execute(<<<'SQL'
CREATE TABLE IF NOT EXISTS `bisyaroh___potong_santri` (
  `bisyaroh_id` int(11) NOT NULL,
  `id_santri` int(7) NOT NULL,
  `aktif` tinyint(1) NOT NULL DEFAULT 1,
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`bisyaroh_id`,`id_santri`),
  KEY `idx_bisyaroh_potong_santri_s` (`id_santri`),
  CONSTRAINT `fk_bisyaroh_potong_santri_b` FOREIGN KEY (`bisyaroh_id`) REFERENCES `bisyaroh` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_bisyaroh_potong_santri_s` FOREIGN KEY (`id_santri`) REFERENCES `santri` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci ROW_FORMAT=DYNAMIC
COMMENT='Santri mana yang menerima alokasi potongan UWABA dari set ini'
SQL);

        $this->execute(<<<'SQL'
CREATE TABLE IF NOT EXISTS `bisyaroh___potong_uwaba_log` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `bisyaroh_id` int(11) NOT NULL,
  `rekap_baris_id` int(11) NOT NULL,
  `id_santri` int(7) NOT NULL,
  `nominal` int(11) NOT NULL,
  `uwaba_bayar_id` int(11) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_bisyaroh_potong_log_baris_santri` (`rekap_baris_id`,`id_santri`),
  KEY `idx_bisyaroh_potong_log_b` (`bisyaroh_id`),
  CONSTRAINT `fk_bisyaroh_potong_log_b` FOREIGN KEY (`bisyaroh_id`) REFERENCES `bisyaroh` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_bisyaroh_potong_log_rb` FOREIGN KEY (`rekap_baris_id`) REFERENCES `bisyaroh___rekap_baris` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_bisyaroh_potong_log_s` FOREIGN KEY (`id_santri`) REFERENCES `santri` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci ROW_FORMAT=DYNAMIC
COMMENT='Idempotensi penerapan potong Bisyaroh ke uwaba___bayar'
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
            'INSERT IGNORE INTO `app___fitur` (`id_app`, `parent_id`, `type`, `code`, `label`, `path`, `icon_key`, `group_label`, `sort_order`, `meta_json`) VALUES '
            . "(1, {$parentId}, 'action', 'action.bisyaroh.aturan.kolom', 'Bisyaroh · Aturan: kolom & set', NULL, NULL, 'Lembaga', 17, '{$metaEsc}'),"
            . "(1, {$parentId}, 'action', 'action.bisyaroh.aturan.potong_kewajiban', 'Bisyaroh · Aturan: potong kewajiban santri', NULL, NULL, 'Lembaga', 18, '{$metaEsc}')"
        );

        foreach (['action.bisyaroh.aturan.kolom', 'action.bisyaroh.aturan.potong_kewajiban'] as $code) {
            $c = str_replace("'", "''", $code);
            $conn->exec(<<<SQL
INSERT IGNORE INTO `role___fitur` (`role_id`, `fitur_id`)
SELECT r.id, f.id FROM `role` r
CROSS JOIN `app___fitur` f
WHERE r.`key` = 'super_admin'
AND f.`id_app` = 1 AND f.`type` = 'action' AND f.`code` = '$c'
SQL);
            $conn->exec(<<<SQL
INSERT IGNORE INTO `role___fitur` (`role_id`, `fitur_id`)
SELECT rf.`role_id`, fnew.`id`
FROM `role___fitur` rf
INNER JOIN `app___fitur` fold ON fold.`id` = rf.`fitur_id`
  AND fold.`code` = 'menu.bisyaroh' AND fold.`id_app` = 1 AND fold.`type` = 'menu'
INNER JOIN `app___fitur` fnew ON fnew.`parent_id` = fold.`id`
  AND fnew.`id_app` = 1 AND fnew.`type` = 'action'
  AND fnew.`code` = '$c'
SQL);
        }
    }

    public function down(): void
    {
        $this->execute('DROP TABLE IF EXISTS `bisyaroh___potong_uwaba_log`');
        $this->execute('DROP TABLE IF EXISTS `bisyaroh___potong_santri`');
        if ($this->hasTable('bisyaroh')) {
            try {
                $this->execute('ALTER TABLE `bisyaroh` DROP FOREIGN KEY `fk_bisyaroh_potong_users`');
            } catch (\Throwable $e) {
            }
            if ($this->table('bisyaroh')->hasColumn('potong_kewajiban_users_id')) {
                $this->execute('ALTER TABLE `bisyaroh` DROP COLUMN `potong_kewajiban_users_id`');
            }
            if ($this->table('bisyaroh')->hasColumn('potong_kewajiban_aktif')) {
                $this->execute('ALTER TABLE `bisyaroh` DROP COLUMN `potong_kewajiban_aktif`');
            }
        }
        $this->execute(
            "DELETE FROM `app___fitur` WHERE `id_app` = 1 AND `type` = 'action' AND `code` IN ('action.bisyaroh.aturan.kolom','action.bisyaroh.aturan.potong_kewajiban')"
        );
    }
}

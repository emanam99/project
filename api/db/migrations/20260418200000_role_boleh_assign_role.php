<?php

declare(strict_types=1);

use Phinx\Migration\AbstractMigration;

/**
 * Matriks: role mana yang boleh menugaskan role mana ke pengurus lain (halaman Pengurus).
 * Tabel: role___boleh_assign_role. Aksi bypass: action.pengurus.role.assign_semua.
 */
final class RoleBolehAssignRole extends AbstractMigration
{
    public function up(): void
    {
        $this->execute('SET FOREIGN_KEY_CHECKS = 0');

        $this->execute(<<<'SQL'
CREATE TABLE IF NOT EXISTS role___boleh_assign_role (
  id int(11) NOT NULL AUTO_INCREMENT,
  role_id int(11) NOT NULL COMMENT 'Role pada pengurus yang menugaskan (pemegang wewenang)',
  assignable_role_id int(11) NOT NULL COMMENT 'Role yang boleh ditambahkan ke pengurus lain',
  tanggal_dibuat timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (id),
  UNIQUE KEY uq_role_boleh_assign (role_id, assignable_role_id),
  KEY idx_assignable_role (assignable_role_id),
  CONSTRAINT fk_rbar_granting FOREIGN KEY (role_id) REFERENCES role (id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_rbar_assignable FOREIGN KEY (assignable_role_id) REFERENCES role (id) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci ROW_FORMAT=DYNAMIC
SQL);

        $this->execute('SET FOREIGN_KEY_CHECKS = 1');

        $meta = '{"requiresRole":["super_admin","tarbiyah","admin_lembaga","admin_ugt","admin_uwaba"]}';
        $metaEsc = str_replace("'", "''", $meta);
        $this->execute(<<<SQL
INSERT IGNORE INTO `app___fitur` (`id_app`, `parent_id`, `type`, `code`, `label`, `path`, `icon_key`, `group_label`, `sort_order`, `meta_json`)
SELECT 1, pf.id, 'action', 'action.pengurus.role.assign_semua', 'Pengurus · Tugaskan semua role', NULL, NULL, 'Lembaga', 9, '{$metaEsc}'
FROM `app___fitur` pf WHERE pf.`id_app` = 1 AND pf.`code` = 'menu.pengurus' LIMIT 1
SQL);

        $this->execute(<<<SQL
INSERT IGNORE INTO `role___fitur` (`role_id`, `fitur_id`)
SELECT r.id, f.id FROM `role` r
CROSS JOIN `app___fitur` f
WHERE r.`key` = 'super_admin'
AND f.`id_app` = 1 AND f.`type` = 'action' AND f.`code` = 'action.pengurus.role.assign_semua'
SQL);

        $this->execute(<<<SQL
INSERT IGNORE INTO `role___fitur` (`role_id`, `fitur_id`)
SELECT rf.`role_id`, fnew.`id`
FROM `role___fitur` rf
INNER JOIN `app___fitur` fold ON fold.`id` = rf.`fitur_id`
  AND fold.`code` = 'menu.pengurus' AND fold.`id_app` = 1 AND fold.`type` = 'menu'
INNER JOIN `app___fitur` fnew ON fnew.`parent_id` = fold.`id`
  AND fnew.`id_app` = 1 AND fnew.`type` = 'action'
  AND fnew.`code` = 'action.pengurus.role.assign_semua'
SQL);
    }

    public function down(): void
    {
        $this->execute(
            "DELETE FROM `app___fitur` WHERE `id_app` = 1 AND `type` = 'action' AND `code` = 'action.pengurus.role.assign_semua'"
        );
        $this->execute('SET FOREIGN_KEY_CHECKS = 0');
        $this->execute('DROP TABLE IF EXISTS role___boleh_assign_role');
        $this->execute('SET FOREIGN_KEY_CHECKS = 1');
    }
}

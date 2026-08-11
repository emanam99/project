<?php

declare(strict_types=1);

use Phinx\Migration\AbstractMigration;

/**
 * Aksi fitur Rombel: hapus catatan santri dari offcanvas daftar santri.
 */
final class RombelCatatanSantriHapusAction extends AbstractMigration
{
    private const ACTION_HAPUS = 'action.rombel.catatan_santri.hapus';

    public function up(): void
    {
        $code = str_replace("'", "''", self::ACTION_HAPUS);

        $this->execute(<<<SQL
INSERT IGNORE INTO `app___fitur` (`id_app`, `parent_id`, `type`, `code`, `label`, `path`, `icon_key`, `group_label`, `sort_order`, `meta_json`)
SELECT 1, pf.`id`, 'action', '{$code}', 'Rombel · Hapus catatan santri', NULL, NULL, 'Lembaga', 20, NULL
FROM `app___fitur` pf WHERE pf.`id_app` = 1 AND pf.`code` = 'menu.rombel' LIMIT 1
SQL);
    }

    public function down(): void
    {
        $code = str_replace("'", "''", self::ACTION_HAPUS);
        $this->execute(
            "DELETE rf FROM `role___fitur` rf INNER JOIN `app___fitur` f ON f.`id` = rf.`fitur_id` "
            . "WHERE f.`id_app` = 1 AND f.`type` = 'action' AND f.`code` = '{$code}'"
        );
        $this->execute(
            "DELETE FROM `app___fitur` WHERE `id_app` = 1 AND `type` = 'action' AND `code` = '{$code}'"
        );
    }
}

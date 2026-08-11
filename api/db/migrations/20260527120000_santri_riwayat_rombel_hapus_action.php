<?php

declare(strict_types=1);

use Phinx\Migration\AbstractMigration;

/**
 * Aksi fitur: hapus baris riwayat santri___rombel dari detail santri (eBeddien).
 */
final class SantriRiwayatRombelHapusAction extends AbstractMigration
{
    private const ACTION_HAPUS = 'action.santri.riwayat_rombel.hapus';

    public function up(): void
    {
        $hapus = str_replace("'", "''", self::ACTION_HAPUS);

        $this->execute(<<<SQL
INSERT IGNORE INTO `app___fitur` (`id_app`, `parent_id`, `type`, `code`, `label`, `path`, `icon_key`, `group_label`, `sort_order`, `meta_json`)
SELECT 1, pf.`id`, 'action', '{$hapus}', 'Santri · Hapus riwayat rombel', NULL, NULL, 'Lembaga', 25, NULL
FROM `app___fitur` pf WHERE pf.`id_app` = 1 AND pf.`code` = 'menu.santri' LIMIT 1
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

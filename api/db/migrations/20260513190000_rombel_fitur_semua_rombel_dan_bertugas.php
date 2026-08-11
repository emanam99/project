<?php

declare(strict_types=1);

use Phinx\Migration\AbstractMigration;

/**
 * Aksi eBeddien di bawah menu Rombel: semua rombel per lembaga vs rombel bertugas (wali/guru FAN).
 * Penugasan role dilakukan manual di Pengaturan → Fitur (tidak di-seed ke role di sini).
 */
final class RombelFiturSemuaRombelDanBertugas extends AbstractMigration
{
    public function up(): void
    {
        $meta = '{"requiresRole":["super_admin","tarbiyah","admin_lembaga","guru"]}';
        $metaEsc = str_replace("'", "''", $meta);

        $actions = [
            ['action.rombel.filter.semua_rombel_lembaga', 'Rombel · Semua rombel di lembaga', 9],
            ['action.rombel.rombel_bertugas', 'Rombel · Rombel bertugas (wali / guru FAN)', 10],
        ];

        foreach ($actions as $a) {
            $code = $a[0];
            $labelEsc = str_replace("'", "''", $a[1]);
            $sort = (int) $a[2];
            $codeEsc = str_replace("'", "''", $code);
            $this->execute(<<<SQL
INSERT IGNORE INTO `app___fitur` (`id_app`, `parent_id`, `type`, `code`, `label`, `path`, `icon_key`, `group_label`, `sort_order`, `meta_json`)
SELECT 1, pf.id, 'action', '{$codeEsc}', '{$labelEsc}', NULL, NULL, 'Lembaga', {$sort}, '{$metaEsc}'
FROM `app___fitur` pf WHERE pf.`id_app` = 1 AND pf.`code` = 'menu.rombel' LIMIT 1
SQL);
        }
    }

    public function down(): void
    {
        $this->execute(
            "DELETE FROM `app___fitur` WHERE `id_app` = 1 AND `type` = 'action' AND `code` IN ('action.rombel.filter.semua_rombel_lembaga','action.rombel.rombel_bertugas')"
        );
    }
}

<?php

declare(strict_types=1);

use Phinx\Migration\AbstractMigration;

/**
 * Pindah menu Buku Tamu & Data Mahrom dari grup Cashless ke grup Wali Santri.
 * Path/route tetap /cashless/... — hanya group_label navigasi yang berubah.
 */
final class WaliSantriMenuGroupNav extends AbstractMigration
{
    public function up(): void
    {
        $this->execute(
            "UPDATE `app___fitur`
             SET `group_label` = 'Wali Santri'
             WHERE `id_app` = 1
               AND `type` = 'menu'
               AND `code` IN ('menu.cashless.buku_tamu', 'menu.cashless.data_mahrom')"
        );

        // Action di bawah menu tersebut (jika ada) ikut label grup UI
        $this->execute(
            "UPDATE `app___fitur` f
             INNER JOIN `app___fitur` p ON p.`id` = f.`parent_id`
             SET f.`group_label` = 'Wali Santri'
             WHERE f.`id_app` = 1
               AND f.`type` = 'action'
               AND p.`code` IN ('menu.cashless.buku_tamu', 'menu.cashless.data_mahrom')"
        );
    }

    public function down(): void
    {
        $this->execute(
            "UPDATE `app___fitur`
             SET `group_label` = 'Cashless'
             WHERE `id_app` = 1
               AND `type` = 'menu'
               AND `code` IN ('menu.cashless.buku_tamu', 'menu.cashless.data_mahrom')"
        );

        $this->execute(
            "UPDATE `app___fitur` f
             INNER JOIN `app___fitur` p ON p.`id` = f.`parent_id`
             SET f.`group_label` = 'Cashless'
             WHERE f.`id_app` = 1
               AND f.`type` = 'action'
               AND p.`code` IN ('menu.cashless.buku_tamu', 'menu.cashless.data_mahrom')"
        );
    }
}

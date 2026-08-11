<?php

declare(strict_types=1);

use Phinx\Migration\AbstractMigration;

/**
 * Satukan group_label «Setting» dan «Pengaturan» menjadi satu grup: Pengaturan.
 */
final class UnifySettingPengaturanGroup extends AbstractMigration
{
    public function up(): void
    {
        $this->execute(
            "UPDATE `app___fitur`
             SET `group_label` = 'Pengaturan'
             WHERE `id_app` = 1 AND `group_label` = 'Setting'"
        );
    }

    public function down(): void
    {
        // Kembalikan menu lama Setting (bukan yang khusus Payment Gateway / WhatsApp hub / nest WA).
        $this->execute(
            "UPDATE `app___fitur`
             SET `group_label` = 'Setting'
             WHERE `id_app` = 1
               AND `group_label` = 'Pengaturan'
               AND `code` NOT IN (
                 'menu.settings.payment_gateway',
                 'menu.settings.whatsapp',
                 'menu.settings.notifikasi',
                 'menu.settings.email_otp',
                 'menu.settings.evolution_wa',
                 'menu.whatsapp_koneksi',
                 'menu.settings.watzap'
               )"
        );
    }
}

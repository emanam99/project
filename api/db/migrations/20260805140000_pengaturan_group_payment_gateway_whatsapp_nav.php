<?php

declare(strict_types=1);

use Phinx\Migration\AbstractMigration;

/**
 * Grup navigasi «Pengaturan»: Payment Gateway (baru), Notifikasi, OTP Email, WhatsApp (parent)
 * dengan anak Evo / WhatsApp / WatZap. Payment Gateway keluar dari halaman PSB.
 */
final class PengaturanGroupPaymentGatewayWhatsappNav extends AbstractMigration
{
    public function up(): void
    {
        // Payment Gateway — menu baru
        $this->execute(
            "INSERT IGNORE INTO `app___fitur` (`id_app`, `parent_id`, `type`, `code`, `label`, `path`, `icon_key`, `group_label`, `sort_order`, `meta_json`) "
            . "VALUES (1, NULL, 'menu', 'menu.settings.payment_gateway', 'Payment Gateway', '/settings/payment-gateway', 'creditCard', 'Pengaturan', 10, NULL)"
        );
        $this->execute(
            "UPDATE `app___fitur`
             SET `group_label` = 'Pengaturan', `path` = '/settings/payment-gateway', `label` = 'Payment Gateway',
                 `icon_key` = 'creditCard', `sort_order` = 10, `parent_id` = NULL
             WHERE `id_app` = 1 AND `code` = 'menu.settings.payment_gateway' AND `type` = 'menu'"
        );

        // Parent WhatsApp (hub)
        $this->execute(
            "INSERT IGNORE INTO `app___fitur` (`id_app`, `parent_id`, `type`, `code`, `label`, `path`, `icon_key`, `group_label`, `sort_order`, `meta_json`) "
            . "VALUES (1, NULL, 'menu', 'menu.settings.whatsapp', 'WhatsApp', '/settings/whatsapp', 'whatsapp', 'Pengaturan', 40, NULL)"
        );
        $this->execute(
            "UPDATE `app___fitur`
             SET `group_label` = 'Pengaturan', `path` = '/settings/whatsapp', `label` = 'WhatsApp',
                 `icon_key` = 'whatsapp', `sort_order` = 40, `parent_id` = NULL
             WHERE `id_app` = 1 AND `code` = 'menu.settings.whatsapp' AND `type` = 'menu'"
        );

        $waParent = $this->fetchRow(
            "SELECT `id` FROM `app___fitur` WHERE `id_app` = 1 AND `code` = 'menu.settings.whatsapp' AND `type` = 'menu' LIMIT 1"
        );
        $waParentId = $waParent ? (int) $waParent['id'] : 0;

        // Pindah Notifikasi & OTP Email ke grup Pengaturan
        $this->execute(
            "UPDATE `app___fitur`
             SET `group_label` = 'Pengaturan', `sort_order` = 20
             WHERE `id_app` = 1 AND `type` = 'menu' AND `code` = 'menu.settings.notifikasi'"
        );
        $this->execute(
            "UPDATE `app___fitur`
             SET `group_label` = 'Pengaturan', `sort_order` = 30
             WHERE `id_app` = 1 AND `type` = 'menu' AND `code` = 'menu.settings.email_otp'"
        );

        if ($waParentId > 0) {
            $this->execute(
                "UPDATE `app___fitur`
                 SET `group_label` = 'Pengaturan', `parent_id` = {$waParentId}, `label` = 'Evo', `sort_order` = 10
                 WHERE `id_app` = 1 AND `type` = 'menu' AND `code` = 'menu.settings.evolution_wa'"
            );
            $this->execute(
                "UPDATE `app___fitur`
                 SET `group_label` = 'Pengaturan', `parent_id` = {$waParentId}, `label` = 'WhatsApp', `sort_order` = 20
                 WHERE `id_app` = 1 AND `type` = 'menu' AND `code` = 'menu.whatsapp_koneksi'"
            );
            $this->execute(
                "UPDATE `app___fitur`
                 SET `group_label` = 'Pengaturan', `parent_id` = {$waParentId}, `label` = 'WatZap', `sort_order` = 30
                 WHERE `id_app` = 1 AND `type` = 'menu' AND `code` = 'menu.settings.watzap'"
            );
        }

        // Grant Payment Gateway ke role yang punya Pengaturan PSB (agar tidak putus akses)
        $this->execute(
            "INSERT IGNORE INTO `role___fitur` (`role_id`, `fitur_id`)
             SELECT rf.`role_id`, pg.`id`
             FROM `role___fitur` rf
             INNER JOIN `app___fitur` psb ON psb.`id` = rf.`fitur_id` AND psb.`code` = 'menu.pendaftaran.pengaturan'
             INNER JOIN `app___fitur` pg ON pg.`code` = 'menu.settings.payment_gateway' AND pg.`type` = 'menu' AND pg.`id_app` = 1"
        );
        $this->execute(
            "INSERT IGNORE INTO `role___fitur` (`role_id`, `fitur_id`)
             SELECT r.`id`, pg.`id`
             FROM `role` r
             INNER JOIN `app___fitur` pg ON pg.`code` = 'menu.settings.payment_gateway' AND pg.`type` = 'menu' AND pg.`id_app` = 1
             WHERE LOWER(COALESCE(r.`key`, '')) IN ('super_admin', 'administrator')"
        );

        // Grant parent WhatsApp ke role yang punya salah satu anak
        if ($waParentId > 0) {
            $this->execute(
                "INSERT IGNORE INTO `role___fitur` (`role_id`, `fitur_id`)
                 SELECT DISTINCT rf.`role_id`, {$waParentId}
                 FROM `role___fitur` rf
                 INNER JOIN `app___fitur` c ON c.`id` = rf.`fitur_id`
                 WHERE c.`code` IN ('menu.settings.evolution_wa', 'menu.whatsapp_koneksi', 'menu.settings.watzap')"
            );
            $this->execute(
                "INSERT IGNORE INTO `role___fitur` (`role_id`, `fitur_id`)
                 SELECT r.`id`, {$waParentId}
                 FROM `role` r
                 WHERE LOWER(COALESCE(r.`key`, '')) IN ('super_admin', 'administrator')"
            );
        }
    }

    public function down(): void
    {
        $this->execute(
            "UPDATE `app___fitur`
             SET `group_label` = 'Setting', `parent_id` = NULL, `label` = 'Evolution WA', `sort_order` = 100
             WHERE `id_app` = 1 AND `code` = 'menu.settings.evolution_wa' AND `type` = 'menu'"
        );
        $this->execute(
            "UPDATE `app___fitur`
             SET `group_label` = 'Setting', `parent_id` = NULL, `label` = 'WhatsApp', `sort_order` = 120
             WHERE `id_app` = 1 AND `code` = 'menu.whatsapp_koneksi' AND `type` = 'menu'"
        );
        $this->execute(
            "UPDATE `app___fitur`
             SET `group_label` = 'Setting', `parent_id` = NULL, `label` = 'WatZap', `sort_order` = 90
             WHERE `id_app` = 1 AND `code` = 'menu.settings.watzap' AND `type` = 'menu'"
        );
        $this->execute(
            "UPDATE `app___fitur`
             SET `group_label` = 'Setting', `sort_order` = 70
             WHERE `id_app` = 1 AND `code` = 'menu.settings.notifikasi' AND `type` = 'menu'"
        );
        $this->execute(
            "UPDATE `app___fitur`
             SET `group_label` = 'Setting', `sort_order` = 80
             WHERE `id_app` = 1 AND `code` = 'menu.settings.email_otp' AND `type` = 'menu'"
        );
        $this->execute(
            "DELETE rf FROM `role___fitur` rf
             INNER JOIN `app___fitur` f ON f.`id` = rf.`fitur_id`
             WHERE f.`code` IN ('menu.settings.payment_gateway', 'menu.settings.whatsapp')"
        );
        $this->execute(
            "DELETE FROM `app___fitur`
             WHERE `id_app` = 1 AND `code` IN ('menu.settings.payment_gateway', 'menu.settings.whatsapp') AND `type` = 'menu'"
        );
    }
}

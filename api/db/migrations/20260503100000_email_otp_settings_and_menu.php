<?php

declare(strict_types=1);

use Phinx\Migration\AbstractMigration;

final class EmailOtpSettingsAndMenu extends AbstractMigration
{
    public function up(): void
    {
        if ($this->tableExists('app___settings')) {
            $this->execute("INSERT IGNORE INTO `app___settings` (`key`, `value`) VALUES ('email_enabled', '0')");
            $this->execute("INSERT IGNORE INTO `app___settings` (`key`, `value`) VALUES ('email_smtp_host', '')");
            $this->execute("INSERT IGNORE INTO `app___settings` (`key`, `value`) VALUES ('email_smtp_port', '465')");
            $this->execute("INSERT IGNORE INTO `app___settings` (`key`, `value`) VALUES ('email_smtp_username', '')");
            $this->execute("INSERT IGNORE INTO `app___settings` (`key`, `value`) VALUES ('email_smtp_password', '')");
            $this->execute("INSERT IGNORE INTO `app___settings` (`key`, `value`) VALUES ('email_smtp_encryption', 'ssl')");
            $this->execute("INSERT IGNORE INTO `app___settings` (`key`, `value`) VALUES ('email_from_address', '')");
            $this->execute("INSERT IGNORE INTO `app___settings` (`key`, `value`) VALUES ('email_from_name', 'eBeddien')");
            $this->execute("INSERT IGNORE INTO `app___settings` (`key`, `value`) VALUES ('email_otp_subject', 'Kode OTP Konfirmasi')");
        }

        if ($this->tableExists('app___fitur') && $this->columnExists('app___fitur', 'code')) {
            $this->execute(
                "INSERT IGNORE INTO `app___fitur` (`id_app`, `parent_id`, `type`, `code`, `label`, `path`, `icon_key`, `group_label`, `sort_order`) "
                . "VALUES (1, NULL, 'menu', 'menu.settings.email_otp', 'OTP Email', '/settings/email-otp', 'chat', 'Setting', 1400)"
            );
        }
    }

    public function down(): void
    {
        if ($this->tableExists('app___fitur')) {
            $this->execute("DELETE FROM `app___fitur` WHERE `code` = 'menu.settings.email_otp'");
        }
        if ($this->tableExists('app___settings')) {
            $this->execute("DELETE FROM `app___settings` WHERE `key` IN ('email_enabled','email_smtp_host','email_smtp_port','email_smtp_username','email_smtp_password','email_smtp_encryption','email_from_address','email_from_name','email_otp_subject')");
        }
    }

    private function tableExists(string $table): bool
    {
        $stmt = $this->getAdapter()->getConnection()->prepare(
            'SELECT 1 FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? LIMIT 1'
        );
        $stmt->execute([$table]);
        return (bool) $stmt->fetchColumn();
    }

    private function columnExists(string $table, string $column): bool
    {
        $stmt = $this->getAdapter()->getConnection()->prepare(
            'SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ? LIMIT 1'
        );
        $stmt->execute([$table, $column]);
        return (bool) $stmt->fetchColumn();
    }
}

<?php

declare(strict_types=1);

use Phinx\Migration\AbstractMigration;

/**
 * Tabel app___settings: key-value untuk pengaturan aplikasi (notification_provider, dll).
 */
final class AppSettingsWatzap extends AbstractMigration
{
    public function up(): void
    {
        $this->execute(<<<'SQL'
CREATE TABLE IF NOT EXISTS `app___settings` (
  `key` varchar(100) NOT NULL,
  `value` text DEFAULT NULL,
  `updated_at` datetime DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
SQL);
        $this->execute("INSERT IGNORE INTO `app___settings` (`key`, `value`) VALUES ('notification_provider', 'wa_sendiri')");
    }

    public function down(): void
    {
        $this->execute('DROP TABLE IF EXISTS `app___settings`');
    }
}

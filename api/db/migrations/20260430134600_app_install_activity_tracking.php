<?php

declare(strict_types=1);

use Phinx\Migration\AbstractMigration;

/**
 * Tracking instalasi dan aktivitas aplikasi client (ebeddien, mybeddien, nailul-murod).
 * Menyimpan waktu install, terakhir aktif, user-agent, dan mode akses (browser/pwa).
 */
final class AppInstallActivityTracking extends AbstractMigration
{
    public function up(): void
    {
        $this->execute(<<<'SQL'
CREATE TABLE IF NOT EXISTS `app___install_activity` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `id_app` int(11) NOT NULL,
  `install_id` varchar(128) NOT NULL COMMENT 'ID unik instalasi per device/browser',
  `id_user` int(11) DEFAULT NULL COMMENT 'Opsional: users.id jika sudah login',
  `access_mode` enum('browser','pwa') NOT NULL DEFAULT 'browser',
  `browser_name` varchar(100) DEFAULT NULL COMMENT 'Contoh: Chrome, Safari, Firefox',
  `user_agent` text DEFAULT NULL,
  `installed_at` datetime NOT NULL DEFAULT current_timestamp(),
  `last_active_at` datetime NOT NULL DEFAULT current_timestamp(),
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_app_install` (`id_app`, `install_id`),
  KEY `idx_install_last_active` (`last_active_at`),
  KEY `idx_install_app_mode` (`id_app`, `access_mode`),
  KEY `idx_install_user` (`id_user`),
  CONSTRAINT `fk_app___install_activity_app` FOREIGN KEY (`id_app`) REFERENCES `app` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_app___install_activity_user` FOREIGN KEY (`id_user`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci ROW_FORMAT=DYNAMIC
COMMENT='Tracking instalasi app per device: browser/pwa + aktivitas terakhir'
SQL);

        // Normalisasi key app lama agar konsisten: mybeddian -> mybeddien.
        $this->execute("UPDATE `app` SET `key` = 'mybeddien', `label` = 'Aplikasi Mybeddien' WHERE `key` = 'mybeddian'");

        // Tambah app nailul-murod jika belum ada.
        $this->execute("
            INSERT INTO `app` (`key`, `label`, `sort_order`)
            SELECT 'nailul-murod', 'Aplikasi Nailul Murod', 40
            WHERE NOT EXISTS (
                SELECT 1 FROM `app` WHERE `key` = 'nailul-murod'
            )
        ");
    }

    public function down(): void
    {
        $this->execute('DROP TABLE IF EXISTS `app___install_activity`');
        $this->execute("DELETE FROM `app` WHERE `key` = 'nailul-murod'");
        $this->execute("UPDATE `app` SET `key` = 'mybeddian', `label` = 'Aplikasi Mybeddian' WHERE `key` = 'mybeddien'");
    }
}

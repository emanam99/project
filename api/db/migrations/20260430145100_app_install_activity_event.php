<?php

declare(strict_types=1);

use Phinx\Migration\AbstractMigration;

final class AppInstallActivityEvent extends AbstractMigration
{
    public function up(): void
    {
        $this->execute(<<<'SQL'
CREATE TABLE IF NOT EXISTS `app___install_activity_event` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `id_install_activity` bigint(20) unsigned NOT NULL,
  `id_app` int(11) NOT NULL,
  `id_user` int(11) DEFAULT NULL,
  `event_type` enum('heartbeat','install','open') NOT NULL DEFAULT 'heartbeat',
  `access_mode` enum('browser','pwa') NOT NULL DEFAULT 'browser',
  `browser_name` varchar(100) DEFAULT NULL,
  `occurred_at` datetime NOT NULL DEFAULT current_timestamp(),
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_event_app_time` (`id_app`, `occurred_at`),
  KEY `idx_event_time` (`occurred_at`),
  KEY `idx_event_install` (`id_install_activity`),
  KEY `idx_event_user` (`id_user`),
  CONSTRAINT `fk_app___install_activity_event_install` FOREIGN KEY (`id_install_activity`) REFERENCES `app___install_activity` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_app___install_activity_event_app` FOREIGN KEY (`id_app`) REFERENCES `app` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_app___install_activity_event_user` FOREIGN KEY (`id_user`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci ROW_FORMAT=DYNAMIC
COMMENT='Event aktivitas install app untuk dashboard analitik'
SQL);
    }

    public function down(): void
    {
        $this->execute('DROP TABLE IF EXISTS `app___install_activity_event`');
    }
}

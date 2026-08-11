<?php

declare(strict_types=1);

use Phinx\Migration\AbstractMigration;

/**
 * Log akses HTTP API untuk Super Admin → Aktivitas User
 * (GET terbanyak, path terbanyak, PUT/POST/DELETE, pola mencurigakan).
 */
final class ApiAccessLogTable extends AbstractMigration
{
    public function up(): void
    {
        $this->execute(<<<'SQL'
CREATE TABLE IF NOT EXISTS `api___access_log` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `user_id` int(11) DEFAULT NULL,
  `pengurus_id` int(11) DEFAULT NULL,
  `method` varchar(10) NOT NULL,
  `path` varchar(255) NOT NULL,
  `route_key` varchar(255) NOT NULL COMMENT 'path dinormalisasi (angka → :id)',
  `status_code` smallint(5) unsigned NOT NULL DEFAULT 0,
  `duration_ms` int(11) unsigned DEFAULT NULL,
  `ip_address` varchar(45) DEFAULT NULL,
  `user_agent` varchar(500) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_access_created` (`created_at`),
  KEY `idx_access_user_created` (`user_id`, `created_at`),
  KEY `idx_access_method_created` (`method`, `created_at`),
  KEY `idx_access_route_created` (`route_key`, `created_at`),
  KEY `idx_access_status_created` (`status_code`, `created_at`),
  KEY `idx_access_pengurus` (`pengurus_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Audit akses HTTP API (Super Admin Aktivitas User)'
SQL
        );
    }

    public function down(): void
    {
        $this->execute('DROP TABLE IF EXISTS `api___access_log`');
    }
}

<?php

declare(strict_types=1);

use Phinx\Migration\AbstractMigration;

/**
 * Favorit menu nav bawah eBeddien per akun users — sinkron antar perangkat.
 */
final class AppFiturFavorit extends AbstractMigration
{
    public function up(): void
    {
        $this->execute(<<<'SQL'
CREATE TABLE IF NOT EXISTS `app___fitur_favorit` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `users_id` int(11) NOT NULL COMMENT 'users.id',
  `fitur_id` int(11) NOT NULL COMMENT 'app___fitur.id (type menu)',
  `sort_order` smallint(5) UNSIGNED NOT NULL DEFAULT 0,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_aff_user_fitur` (`users_id`,`fitur_id`),
  KEY `idx_aff_users` (`users_id`),
  KEY `idx_aff_fitur` (`fitur_id`),
  CONSTRAINT `fk_aff_users` FOREIGN KEY (`users_id`) REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_aff_fitur` FOREIGN KEY (`fitur_id`) REFERENCES `app___fitur` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci ROW_FORMAT=DYNAMIC
SQL);
    }

    public function down(): void
    {
        $this->execute('DROP TABLE IF EXISTS `app___fitur_favorit`');
    }
}

<?php

declare(strict_types=1);

use Phinx\Migration\AbstractMigration;

/**
 * Tabel integrasi Google: google___calendar_config (kalender level aplikasi),
 * google___user_oauth (token OAuth per user untuk fitur nanti).
 */
final class GoogleCalendarOauth extends AbstractMigration
{
    public function up(): void
    {
        $this->execute('SET NAMES utf8mb4');
        $this->execute('SET FOREIGN_KEY_CHECKS = 0');

        $this->execute(<<<'SQL'
CREATE TABLE IF NOT EXISTS `google___calendar_config` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `slug` varchar(50) NOT NULL COMMENT 'Identifier unik, e.g. pesantren',
  `name` varchar(255) NOT NULL COMMENT 'Nama tampilan kalender',
  `calendar_id` varchar(255) NOT NULL COMMENT 'Google Calendar ID (atau alamat kalender)',
  `calendar_url` varchar(500) DEFAULT NULL COMMENT 'Optional: URL iCal public jika beda dari default',
  `is_public` tinyint(1) NOT NULL DEFAULT 1,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `unique_slug` (`slug`),
  KEY `idx_slug` (`slug`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
SQL);

        $this->execute(<<<'SQL'
CREATE TABLE IF NOT EXISTS `google___user_oauth` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `user_id` int(11) NOT NULL,
  `provider` varchar(50) NOT NULL DEFAULT 'google',
  `access_token` text DEFAULT NULL,
  `refresh_token` text DEFAULT NULL,
  `expires_at` timestamp NULL DEFAULT NULL,
  `scopes` text DEFAULT NULL COMMENT 'Scope OAuth yang disetujui',
  `email` varchar(255) DEFAULT NULL COMMENT 'Email akun Google',
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `unique_user_provider` (`user_id`,`provider`),
  KEY `idx_user_id` (`user_id`),
  KEY `idx_provider` (`provider`),
  CONSTRAINT `fk_google_user_oauth_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
SQL);

        $this->execute('SET FOREIGN_KEY_CHECKS = 1');
    }

    public function down(): void
    {
        $this->execute('SET FOREIGN_KEY_CHECKS = 0');
        $this->execute('DROP TABLE IF EXISTS google___user_oauth');
        $this->execute('DROP TABLE IF EXISTS google___calendar_config');
        $this->execute('SET FOREIGN_KEY_CHECKS = 1');
    }
}

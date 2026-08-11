<?php

declare(strict_types=1);

use Phinx\Migration\AbstractMigration;

/** Token sekali pakai untuk verifikasi email dari profil eBeddien (link di email). */
final class UserEmailVerifyTokens extends AbstractMigration
{
    public function up(): void
    {
        $this->execute(<<<'SQL'
CREATE TABLE IF NOT EXISTS `user___email_verify_tokens` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `user_id` int(11) NOT NULL COMMENT 'users.id',
  `token_hash` char(64) NOT NULL,
  `email` varchar(255) NOT NULL COMMENT 'snapshot email (lowercase trim) saat link dibuat',
  `expires_at` datetime NOT NULL,
  `used_at` datetime DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_token_hash` (`token_hash`),
  KEY `idx_user_expires` (`user_id`,`expires_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
SQL);
    }

    public function down(): void
    {
        $this->execute('DROP TABLE IF EXISTS `user___email_verify_tokens`');
    }
}

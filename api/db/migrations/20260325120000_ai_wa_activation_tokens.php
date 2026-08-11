<?php

declare(strict_types=1);

use Phinx\Migration\AbstractMigration;

/**
 * Token sekali pakai + kedaluwarsa untuk aktivasi AI WhatsApp (hanya dari user login eBeddien).
 * Nama tabel: ai___aktivasi (konsisten pola ai___*).
 */
final class AiWaActivationTokens extends AbstractMigration
{
    public function up(): void
    {
        $this->execute(
            'CREATE TABLE `ai___aktivasi` ('
            . '`id` int unsigned NOT NULL AUTO_INCREMENT,'
            . '`users_id` int unsigned NOT NULL,'
            . '`token_hash` char(64) NOT NULL COMMENT \'SHA256 hex\','
            . '`expires_at` datetime NOT NULL,'
            . '`used_at` datetime DEFAULT NULL,'
            . '`created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,'
            . 'PRIMARY KEY (`id`),'
            . 'UNIQUE KEY `uniq_token_hash` (`token_hash`),'
            . 'KEY `idx_users_unused` (`users_id`, `used_at`, `expires_at`)'
            . ') ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci'
        );
    }

    public function down(): void
    {
        $this->execute('DROP TABLE IF EXISTS `ai___aktivasi`');
    }
}

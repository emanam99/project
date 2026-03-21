<?php

declare(strict_types=1);

use Phinx\Migration\AbstractMigration;

/**
 * Tabel AI (DeepSeek / chat institusi) — selaras dengan struktur di DB produksi.
 * - ai___chat: log pasangan user_message + ai_response per sesi DeepSeek
 * - ai___training: bank Q&A (admin)
 * - ai___training_sessions: sesi training / anchor sesi DeepSeek (deepseek_session_id)
 * - ai___training_messages: pesan dalam sesi training (user / ai / trainer)
 */
final class AiDeepseekChatTables extends AbstractMigration
{
    public function up(): void
    {
        $this->execute(<<<'SQL'
CREATE TABLE IF NOT EXISTS `ai___training_sessions` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `title` varchar(255) DEFAULT NULL,
  `admin` varchar(100) DEFAULT NULL,
  `created_at` datetime DEFAULT current_timestamp(),
  `status` enum('draft','completed','reviewed') DEFAULT 'draft',
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
SQL);

        $this->execute(<<<'SQL'
CREATE TABLE IF NOT EXISTS `ai___training` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `question` text NOT NULL,
  `answer` text NOT NULL,
  `category` varchar(255) NOT NULL DEFAULT 'Tentang Al-Utsmani',
  `created_at` datetime DEFAULT current_timestamp(),
  `updated_at` datetime DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  `admin` varchar(255) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `category` (`category`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
SQL);

        $this->execute(<<<'SQL'
CREATE TABLE IF NOT EXISTS `ai___training_messages` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `session_id` int(11) DEFAULT NULL,
  `sender` enum('user','ai','trainer') DEFAULT NULL,
  `message` text NOT NULL,
  `parent_id` int(11) DEFAULT NULL,
  `approved_as_training` tinyint(1) DEFAULT 0,
  `feedback` text DEFAULT NULL,
  `created_at` datetime DEFAULT current_timestamp(),
  `admin` varchar(100) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `session_id` (`session_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
SQL);

        $this->execute(<<<'SQL'
CREATE TABLE IF NOT EXISTS `ai___chat` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `user_message` text NOT NULL,
  `ai_response` text NOT NULL,
  `category` varchar(255) NOT NULL DEFAULT 'Lainnya',
  `user_name` varchar(100) DEFAULT NULL,
  `user_email` varchar(100) DEFAULT NULL,
  `answer_type` enum('Data','AI') DEFAULT 'AI',
  `timestamp` datetime DEFAULT current_timestamp(),
  `session_id` varchar(100) DEFAULT NULL,
  `model_used` varchar(100) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `session_id` (`session_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
SQL);

        // FK training_messages -> training_sessions (jika belum ada)
        $fk = $this->fetchRow(
            "SELECT CONSTRAINT_NAME FROM information_schema.TABLE_CONSTRAINTS
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'ai___training_messages'
             AND CONSTRAINT_NAME = 'ai___training_messages_ibfk_1'"
        );
        if (!$fk && $this->hasTable('ai___training_sessions') && $this->hasTable('ai___training_messages')) {
            try {
                $this->execute(
                    'ALTER TABLE `ai___training_messages` ADD CONSTRAINT `ai___training_messages_ibfk_1` '
                    . 'FOREIGN KEY (`session_id`) REFERENCES `ai___training_sessions` (`id`) ON DELETE SET NULL ON UPDATE CASCADE'
                );
            } catch (\Throwable $e) {
                // Sudah ada FK dengan nama lain / tabel tidak kosong — abaikan
            }
        }

        // Kolom tambahan untuk integrasi DeepSeek + users.id
        if ($this->hasTable('ai___chat') && !$this->migrationColumnExists('ai___chat', 'users_id')) {
            $this->execute(
                'ALTER TABLE `ai___chat` ADD COLUMN `users_id` int(11) DEFAULT NULL COMMENT \'users.id\' AFTER `id`'
            );
            $this->execute('ALTER TABLE `ai___chat` ADD KEY `idx_ai_chat_users` (`users_id`)');
            try {
                $this->execute(
                    'ALTER TABLE `ai___chat` ADD CONSTRAINT `fk_ai_chat_users` FOREIGN KEY (`users_id`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE'
                );
            } catch (\Throwable $e) {
                // users mungkin belum ada di env tertentu
            }
        }

        if ($this->hasTable('ai___training_sessions')) {
            if (!$this->migrationColumnExists('ai___training_sessions', 'users_id')) {
                $this->execute(
                    'ALTER TABLE `ai___training_sessions` ADD COLUMN `users_id` int(11) DEFAULT NULL COMMENT \'users.id pemilik sesi\' AFTER `id`'
                );
                $this->execute('ALTER TABLE `ai___training_sessions` ADD KEY `idx_ai_ts_users` (`users_id`)');
                try {
                    $this->execute(
                        'ALTER TABLE `ai___training_sessions` ADD CONSTRAINT `fk_ai_ts_users` FOREIGN KEY (`users_id`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE'
                    );
                } catch (\Throwable $e) {
                }
            }
            if (!$this->migrationColumnExists('ai___training_sessions', 'deepseek_session_id')) {
                $this->execute(
                    'ALTER TABLE `ai___training_sessions` ADD COLUMN `deepseek_session_id` varchar(128) DEFAULT NULL COMMENT \'chat_session_id dari DeepSeek\' AFTER `title`'
                );
                $this->execute(
                    'ALTER TABLE `ai___training_sessions` ADD UNIQUE KEY `uk_ai_ts_deepseek` (`deepseek_session_id`)'
                );
            }
        }
    }

    private function migrationColumnExists(string $table, string $column): bool
    {
        $t = str_replace('`', '``', $table);
        $c = str_replace('`', '``', $column);
        $rows = $this->fetchAll("SHOW COLUMNS FROM `{$t}` LIKE '{$c}'");

        return is_array($rows) && count($rows) > 0;
    }

    public function down(): void
    {
        if ($this->hasTable('ai___training_sessions') && $this->migrationColumnExists('ai___training_sessions', 'deepseek_session_id')) {
            try {
                $this->execute('ALTER TABLE `ai___training_sessions` DROP INDEX `uk_ai_ts_deepseek`');
            } catch (\Throwable $e) {
            }
            try {
                $this->execute('ALTER TABLE `ai___training_sessions` DROP COLUMN `deepseek_session_id`');
            } catch (\Throwable $e) {
            }
        }
        if ($this->hasTable('ai___training_sessions') && $this->migrationColumnExists('ai___training_sessions', 'users_id')) {
            try {
                $this->execute('ALTER TABLE `ai___training_sessions` DROP FOREIGN KEY `fk_ai_ts_users`');
            } catch (\Throwable $e) {
            }
            try {
                $this->execute('ALTER TABLE `ai___training_sessions` DROP COLUMN `users_id`');
            } catch (\Throwable $e) {
            }
        }
        if ($this->hasTable('ai___chat') && $this->migrationColumnExists('ai___chat', 'users_id')) {
            try {
                $this->execute('ALTER TABLE `ai___chat` DROP FOREIGN KEY `fk_ai_chat_users`');
            } catch (\Throwable $e) {
            }
            try {
                $this->execute('ALTER TABLE `ai___chat` DROP COLUMN `users_id`');
            } catch (\Throwable $e) {
            }
        }
    }
}

<?php

declare(strict_types=1);

use Phinx\Migration\AbstractMigration;

/**
 * Tabel chat: pesan antar user (live server / realtime).
 * from_user_id, to_user_id = users.id.
 */
final class CreateChatUserMessage extends AbstractMigration
{
    public function up(): void
    {
        $this->execute(<<<'SQL'
CREATE TABLE IF NOT EXISTS `chat` (
  `id` int(11) unsigned NOT NULL AUTO_INCREMENT,
  `from_user_id` int(11) NOT NULL COMMENT 'users.id pengirim',
  `to_user_id` int(11) NOT NULL COMMENT 'users.id penerima',
  `message` text NOT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_from_to` (`from_user_id`, `to_user_id`),
  KEY `idx_to_from` (`to_user_id`, `from_user_id`),
  KEY `idx_created` (`created_at`),
  CONSTRAINT `fk_chat_from_user` FOREIGN KEY (`from_user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_chat_to_user` FOREIGN KEY (`to_user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
SQL);
    }

    public function down(): void
    {
        $this->execute('DROP TABLE IF EXISTS `chat`');
    }
}

<?php

declare(strict_types=1);

use Phinx\Migration\AbstractMigration;

final class ChatReplyForwardReaction extends AbstractMigration
{
    public function up(): void
    {
        if (!$this->fetchRow("SHOW COLUMNS FROM `chat` LIKE 'reply_to_message_id'")) {
            $this->execute('ALTER TABLE `chat` ADD COLUMN `reply_to_message_id` int(11) unsigned DEFAULT NULL AFTER `sender_id`');
            $this->execute('ALTER TABLE `chat` ADD KEY `idx_chat_reply_to` (`reply_to_message_id`)');
        }
        if (!$this->fetchRow("SHOW COLUMNS FROM `chat` LIKE 'forwarded_from_message_id'")) {
            $this->execute('ALTER TABLE `chat` ADD COLUMN `forwarded_from_message_id` int(11) unsigned DEFAULT NULL AFTER `reply_to_message_id`');
            $this->execute('ALTER TABLE `chat` ADD KEY `idx_chat_forwarded_from` (`forwarded_from_message_id`)');
        }
        if (!$this->hasTable('chat___message_reaction')) {
            $this->execute(<<<'SQL'
CREATE TABLE `chat___message_reaction` (
  `id` int(11) unsigned NOT NULL AUTO_INCREMENT,
  `message_id` int(11) unsigned NOT NULL,
  `user_id` int(11) NOT NULL,
  `emoji` varchar(16) NOT NULL DEFAULT 'love',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_message_user` (`message_id`, `user_id`),
  KEY `idx_message_id` (`message_id`),
  CONSTRAINT `fk_cmr_message` FOREIGN KEY (`message_id`) REFERENCES `chat` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_cmr_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
SQL);
        }
    }

    public function down(): void
    {
        if ($this->hasTable('chat___message_reaction')) {
            $this->table('chat___message_reaction')->drop()->save();
        }
        if ($this->fetchRow("SHOW COLUMNS FROM `chat` LIKE 'forwarded_from_message_id'")) {
            $this->execute('ALTER TABLE `chat` DROP COLUMN `forwarded_from_message_id`');
        }
        if ($this->fetchRow("SHOW COLUMNS FROM `chat` LIKE 'reply_to_message_id'")) {
            $this->execute('ALTER TABLE `chat` DROP COLUMN `reply_to_message_id`');
        }
    }
}

<?php

declare(strict_types=1);

use Phinx\Migration\AbstractMigration;

final class ChatPinnedTable extends AbstractMigration
{
    public function up(): void
    {
        $this->execute(<<<'SQL'
CREATE TABLE IF NOT EXISTS `chat___pinned` (
  `id` int(11) unsigned NOT NULL AUTO_INCREMENT,
  `conversation_id` int(11) unsigned NOT NULL,
  `message_id` int(11) unsigned NOT NULL,
  `pinned_by` int(11) NOT NULL COMMENT 'users.id',
  `pinned_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_conv_msg` (`conversation_id`,`message_id`),
  KEY `idx_conv` (`conversation_id`),
  KEY `idx_msg` (`message_id`),
  CONSTRAINT `fk_pinned_conv` FOREIGN KEY (`conversation_id`) REFERENCES `chat___conversation` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_pinned_msg` FOREIGN KEY (`message_id`) REFERENCES `chat` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_pinned_user` FOREIGN KEY (`pinned_by`) REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Pesan sematkan per grup/private'
SQL);
    }

    public function down(): void
    {
        $this->execute('DROP TABLE IF EXISTS `chat___pinned`');
    }
}

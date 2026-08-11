<?php

declare(strict_types=1);

use Phinx\Migration\AbstractMigration;

final class ChatInviteTable extends AbstractMigration
{
    public function up(): void
    {
        $this->execute(<<<'SQL'
CREATE TABLE IF NOT EXISTS `chat___invite` (
  `id` int(11) unsigned NOT NULL AUTO_INCREMENT,
  `conversation_id` int(11) unsigned NOT NULL,
  `code` varchar(32) NOT NULL,
  `created_by` int(11) NOT NULL COMMENT 'users.id',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `expires_at` datetime DEFAULT NULL,
  `revoked_at` datetime DEFAULT NULL,
  `max_uses` int(11) DEFAULT NULL,
  `uses` int(11) NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_code` (`code`),
  KEY `idx_conv` (`conversation_id`),
  CONSTRAINT `fk_invite_conv` FOREIGN KEY (`conversation_id`) REFERENCES `chat___conversation` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_invite_user` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Undangan grup via tautan'
SQL);
    }

    public function down(): void
    {
        $this->execute('DROP TABLE IF EXISTS `chat___invite`');
    }
}

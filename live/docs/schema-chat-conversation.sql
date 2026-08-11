-- Struktur chat dengan ruang conversation (setelah migrasi 20260318000001).
-- Tabel: chat___conversation, chat___member, chat (pesan).

-- Ruang obrolan (private atau grup)
CREATE TABLE IF NOT EXISTS `chat___conversation` (
  `id` int(11) unsigned NOT NULL AUTO_INCREMENT,
  `type` enum('private','group') NOT NULL DEFAULT 'private',
  `name` varchar(255) DEFAULT NULL COMMENT 'Nama grup (null untuk private)',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_type` (`type`),
  KEY `idx_updated` (`updated_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Member per conversation; last_read_at untuk unread count & read status
CREATE TABLE IF NOT EXISTS `chat___member` (
  `id` int(11) unsigned NOT NULL AUTO_INCREMENT,
  `conversation_id` int(11) unsigned NOT NULL,
  `user_id` int(11) NOT NULL,
  `joined_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `last_read_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_conv_user` (`conversation_id`,`user_id`),
  KEY `idx_user` (`user_id`),
  CONSTRAINT `fk_chat_member_conv` FOREIGN KEY (`conversation_id`) REFERENCES `chat___conversation` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_chat_member_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Pesan per conversation
CREATE TABLE IF NOT EXISTS `chat` (
  `id` int(11) unsigned NOT NULL AUTO_INCREMENT,
  `conversation_id` int(11) unsigned NOT NULL,
  `sender_id` int(11) NOT NULL,
  `message` text NOT NULL,
  `tanggal_dibuat` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_chat_conv` (`conversation_id`),
  KEY `idx_chat_sender` (`sender_id`),
  KEY `idx_chat_tanggal` (`tanggal_dibuat`),
  CONSTRAINT `fk_chat_conv` FOREIGN KEY (`conversation_id`) REFERENCES `chat___conversation` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_chat_sender` FOREIGN KEY (`sender_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

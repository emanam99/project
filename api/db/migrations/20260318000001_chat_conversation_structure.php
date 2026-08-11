<?php

declare(strict_types=1);

use Phinx\Migration\AbstractMigration;

/**
 * Struktur chat ala profesional: ruang conversation + member + pesan.
 * - chat___conversation: id, type (private/group), name (untuk grup), created_at, updated_at
 * - chat___member: id, conversation_id, user_id, joined_at, last_read_at (untuk unread count & read status)
 * - chat: id, conversation_id, sender_id, message, tanggal_dibuat, updated_at (untuk edit nanti)
 * Typing & notif realtime via socket; unread dari last_read_at.
 */
final class ChatConversationStructure extends AbstractMigration
{
    public function up(): void
    {
        $conn = $this->getAdapter()->getConnection();

        // 1. Tabel ruang obrolan
        $this->execute(<<<'SQL'
CREATE TABLE IF NOT EXISTS `chat___conversation` (
  `id` int(11) unsigned NOT NULL AUTO_INCREMENT,
  `type` enum('private','group') NOT NULL DEFAULT 'private',
  `name` varchar(255) DEFAULT NULL COMMENT 'Nama grup (null untuk private)',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_type` (`type`),
  KEY `idx_updated` (`updated_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Ruang obrolan: private atau grup'
SQL);

        // 2. Anggota per conversation (untuk unread: last_read_at)
        $this->execute(<<<'SQL'
CREATE TABLE IF NOT EXISTS `chat___member` (
  `id` int(11) unsigned NOT NULL AUTO_INCREMENT,
  `conversation_id` int(11) unsigned NOT NULL,
  `user_id` int(11) NOT NULL COMMENT 'users.id',
  `joined_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `last_read_at` datetime DEFAULT NULL COMMENT 'Pesan setelah ini = unread; dipakai untuk read status & unread count',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_conv_user` (`conversation_id`,`user_id`),
  KEY `idx_user` (`user_id`),
  KEY `idx_last_read` (`last_read_at`),
  CONSTRAINT `fk_chat_member_conv` FOREIGN KEY (`conversation_id`) REFERENCES `chat___conversation` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_chat_member_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Member per conversation; last_read_at untuk unread/read'
SQL);

        // 3. Cek apakah tabel chat lama (from_user_id, to_user_id) ada
        $hasChat = $this->fetchRow("SHOW TABLES LIKE 'chat'");
        $hasOldColumns = false;
        if ($hasChat) {
            $cols = $this->fetchAll("SHOW COLUMNS FROM chat");
            foreach ($cols as $c) {
                if (($c['Field'] ?? '') === 'from_user_id') {
                    $hasOldColumns = true;
                    break;
                }
            }
        }

        if ($hasOldColumns) {
            // 3a. Tambah kolom baru di chat (nullable dulu)
            $this->execute("ALTER TABLE `chat` ADD COLUMN `conversation_id` int(11) unsigned DEFAULT NULL AFTER `id`");
            $this->execute("ALTER TABLE `chat` ADD COLUMN `sender_id` int(11) DEFAULT NULL AFTER `conversation_id`");
            $this->execute("ALTER TABLE `chat` ADD COLUMN `tanggal_dibuat` datetime DEFAULT NULL AFTER `message`");

            // 3b. Migrasi: buat conversation + member per pasang (from_user_id, to_user_id), isi conversation_id & sender_id
            $rows = $this->fetchAll("SELECT DISTINCT LEAST(from_user_id, to_user_id) AS u1, GREATEST(from_user_id, to_user_id) AS u2 FROM chat");
            $pairToConv = [];
            $insConv = $conn->prepare("INSERT INTO `chat___conversation` (`type`, `created_at`) VALUES ('private', NOW())");
            $insMem = $conn->prepare("INSERT INTO `chat___member` (`conversation_id`, `user_id`, `joined_at`) VALUES (?, ?, NOW()), (?, ?, NOW())");
            $updChat = $conn->prepare("UPDATE `chat` SET conversation_id = ?, sender_id = from_user_id, tanggal_dibuat = created_at WHERE (from_user_id = ? AND to_user_id = ?) OR (from_user_id = ? AND to_user_id = ?)");
            foreach ($rows as $r) {
                $u1 = (int) $r['u1'];
                $u2 = (int) $r['u2'];
                if ($u1 === $u2) {
                    continue;
                }
                $key = "{$u1}_{$u2}";
                if (isset($pairToConv[$key])) {
                    continue;
                }
                $insConv->execute();
                $convId = (int) $conn->lastInsertId();
                $pairToConv[$key] = $convId;
                $insMem->execute([$convId, $u1, $convId, $u2]);
            }
            foreach ($pairToConv as $key => $convId) {
                [$u1, $u2] = array_map('intval', explode('_', $key));
                $updChat->execute([$convId, $u1, $u2, $u2, $u1]);
            }

            // 3c. Hapus FK lama, hapus kolom lama, set NOT NULL dan FK baru
            $this->execute("SET FOREIGN_KEY_CHECKS = 0");
            try {
                $this->execute("ALTER TABLE `chat` DROP FOREIGN KEY `fk_chat_from_user`");
            } catch (\Throwable $e) {
                // ignore if already dropped
            }
            try {
                $this->execute("ALTER TABLE `chat` DROP FOREIGN KEY `fk_chat_to_user`");
            } catch (\Throwable $e) {
            }
            $this->execute("ALTER TABLE `chat` DROP COLUMN `from_user_id`");
            $this->execute("ALTER TABLE `chat` DROP COLUMN `to_user_id`");
            $this->execute("ALTER TABLE `chat` DROP COLUMN `created_at`");
            $this->execute("SET FOREIGN_KEY_CHECKS = 1");

            $this->execute("UPDATE `chat` SET tanggal_dibuat = NOW() WHERE tanggal_dibuat IS NULL");
            $this->execute("ALTER TABLE `chat` MODIFY COLUMN `conversation_id` int(11) unsigned NOT NULL");
            $this->execute("ALTER TABLE `chat` MODIFY COLUMN `sender_id` int(11) NOT NULL");
            $this->execute("ALTER TABLE `chat` MODIFY COLUMN `tanggal_dibuat` datetime NOT NULL");
            $this->execute("ALTER TABLE `chat` ADD KEY `idx_chat_conv` (`conversation_id`)");
            $this->execute("ALTER TABLE `chat` ADD KEY `idx_chat_sender` (`sender_id`)");
            $this->execute("ALTER TABLE `chat` ADD KEY `idx_chat_tanggal` (`tanggal_dibuat`)");
            $this->execute("ALTER TABLE `chat` ADD CONSTRAINT `fk_chat_conv` FOREIGN KEY (`conversation_id`) REFERENCES `chat___conversation` (`id`) ON DELETE CASCADE ON UPDATE CASCADE");
            $this->execute("ALTER TABLE `chat` ADD CONSTRAINT `fk_chat_sender` FOREIGN KEY (`sender_id`) REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE CASCADE");
        } else {
            // 3d. Tidak ada chat lama: buat tabel chat dengan struktur baru
            $this->execute(<<<'SQL'
CREATE TABLE IF NOT EXISTS `chat` (
  `id` int(11) unsigned NOT NULL AUTO_INCREMENT,
  `conversation_id` int(11) unsigned NOT NULL,
  `sender_id` int(11) NOT NULL COMMENT 'users.id pengirim',
  `message` text NOT NULL,
  `tanggal_dibuat` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_chat_conv` (`conversation_id`),
  KEY `idx_chat_sender` (`sender_id`),
  KEY `idx_chat_tanggal` (`tanggal_dibuat`),
  CONSTRAINT `fk_chat_conv` FOREIGN KEY (`conversation_id`) REFERENCES `chat___conversation` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_chat_sender` FOREIGN KEY (`sender_id`) REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Pesan per conversation'
SQL);
        }
    }

    public function down(): void
    {
        $this->execute('SET FOREIGN_KEY_CHECKS = 0');
        $this->execute('DROP TABLE IF EXISTS `chat`');
        $this->execute('DROP TABLE IF EXISTS `chat___member`');
        $this->execute('DROP TABLE IF EXISTS `chat___conversation`');
        $this->execute('SET FOREIGN_KEY_CHECKS = 1');
    }
}

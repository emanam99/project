<?php

declare(strict_types=1);

use Phinx\Migration\AbstractMigration;

final class ChatGroupMultiAdmin extends AbstractMigration
{
    public function up(): void
    {
        $has = $this->fetchRow("SHOW COLUMNS FROM `chat___member` LIKE 'is_admin'");
        if (!$has) {
            $this->execute("ALTER TABLE `chat___member` ADD COLUMN `is_admin` tinyint(1) NOT NULL DEFAULT 0 AFTER `user_id`");
            $this->execute("ALTER TABLE `chat___member` ADD KEY `idx_member_is_admin` (`is_admin`)");
        }

        // Backfill grup lama: jika belum punya admin, jadikan member paling awal sebagai admin.
        $rows = $this->fetchAll("
            SELECT c.id AS conversation_id
            FROM chat___conversation c
            WHERE c.type = 'group'
              AND NOT EXISTS (
                SELECT 1
                FROM chat___member m
                WHERE m.conversation_id = c.id
                  AND m.is_admin = 1
              )
        ");
        foreach ($rows as $row) {
            $conversationId = (int) ($row['conversation_id'] ?? 0);
            if ($conversationId < 1) {
                continue;
            }
            $member = $this->fetchRow("
                SELECT id
                FROM chat___member
                WHERE conversation_id = {$conversationId}
                ORDER BY joined_at ASC, id ASC
                LIMIT 1
            ");
            $memberId = (int) ($member['id'] ?? 0);
            if ($memberId > 0) {
                $this->execute("UPDATE chat___member SET is_admin = 1 WHERE id = {$memberId}");
            }
        }
    }

    public function down(): void
    {
        $has = $this->fetchRow("SHOW COLUMNS FROM `chat___member` LIKE 'is_admin'");
        if ($has) {
            try {
                $this->execute("ALTER TABLE `chat___member` DROP KEY `idx_member_is_admin`");
            } catch (\Throwable $e) {
                // ignore if key missing
            }
            $this->execute("ALTER TABLE `chat___member` DROP COLUMN `is_admin`");
        }
    }
}


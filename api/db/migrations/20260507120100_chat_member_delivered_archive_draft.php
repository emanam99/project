<?php

declare(strict_types=1);

use Phinx\Migration\AbstractMigration;

final class ChatMemberDeliveredArchiveDraft extends AbstractMigration
{
    public function up(): void
    {
        foreach ([
            'delivered_at' => "ALTER TABLE `chat___member` ADD COLUMN `delivered_at` datetime DEFAULT NULL COMMENT 'Terakhir pesan masuk ter-deliver ke client user ini' AFTER `last_read_at`",
            'archived_at' => "ALTER TABLE `chat___member` ADD COLUMN `archived_at` datetime DEFAULT NULL AFTER `delivered_at`",
            'draft_text' => "ALTER TABLE `chat___member` ADD COLUMN `draft_text` text DEFAULT NULL AFTER `archived_at`",
            'draft_updated_at' => "ALTER TABLE `chat___member` ADD COLUMN `draft_updated_at` datetime DEFAULT NULL AFTER `draft_text`",
        ] as $col => $sql) {
            $has = $this->fetchRow("SHOW COLUMNS FROM `chat___member` LIKE '{$col}'");
            if (!$has) {
                $this->execute($sql);
            }
        }
    }

    public function down(): void
    {
        foreach (['draft_updated_at', 'draft_text', 'archived_at', 'delivered_at'] as $col) {
            $has = $this->fetchRow("SHOW COLUMNS FROM `chat___member` LIKE '{$col}'");
            if ($has) {
                $this->execute("ALTER TABLE `chat___member` DROP COLUMN `" . $col . "`");
            }
        }
    }
}

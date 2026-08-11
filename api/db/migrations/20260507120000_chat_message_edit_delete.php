<?php

declare(strict_types=1);

use Phinx\Migration\AbstractMigration;

final class ChatMessageEditDelete extends AbstractMigration
{
    public function up(): void
    {
        $hasEdited = $this->fetchRow("SHOW COLUMNS FROM `chat` LIKE 'edited_at'");
        if (!$hasEdited) {
            $this->execute("ALTER TABLE `chat` ADD COLUMN `edited_at` datetime DEFAULT NULL AFTER `tanggal_dibuat`");
        }
        $hasDeleted = $this->fetchRow("SHOW COLUMNS FROM `chat` LIKE 'deleted_at'");
        if (!$hasDeleted) {
            $this->execute("ALTER TABLE `chat` ADD COLUMN `deleted_at` datetime DEFAULT NULL AFTER `edited_at`");
        }
    }

    public function down(): void
    {
        $hasDeleted = $this->fetchRow("SHOW COLUMNS FROM `chat` LIKE 'deleted_at'");
        if ($hasDeleted) {
            $this->execute("ALTER TABLE `chat` DROP COLUMN `deleted_at`");
        }
        $hasEdited = $this->fetchRow("SHOW COLUMNS FROM `chat` LIKE 'edited_at'");
        if ($hasEdited) {
            $this->execute("ALTER TABLE `chat` DROP COLUMN `edited_at`");
        }
    }
}

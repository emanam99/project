<?php

declare(strict_types=1);

use Phinx\Migration\AbstractMigration;

final class ChatGroupPhotoColumn extends AbstractMigration
{
    public function up(): void
    {
        $has = $this->fetchRow("SHOW COLUMNS FROM `chat___conversation` LIKE 'group_photo'");
        if ($has) {
            return;
        }
        $this->execute("ALTER TABLE `chat___conversation` ADD COLUMN `group_photo` varchar(255) DEFAULT NULL AFTER `name`");
    }

    public function down(): void
    {
        $has = $this->fetchRow("SHOW COLUMNS FROM `chat___conversation` LIKE 'group_photo'");
        if (!$has) {
            return;
        }
        $this->execute("ALTER TABLE `chat___conversation` DROP COLUMN `group_photo`");
    }
}


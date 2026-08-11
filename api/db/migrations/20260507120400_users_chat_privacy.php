<?php

declare(strict_types=1);

use Phinx\Migration\AbstractMigration;

final class UsersChatPrivacy extends AbstractMigration
{
    public function up(): void
    {
        $cols = [
            'privacy_show_last_seen' => "ALTER TABLE `users` ADD COLUMN `privacy_show_last_seen` tinyint(1) NOT NULL DEFAULT 1",
            'privacy_show_read_receipt' => "ALTER TABLE `users` ADD COLUMN `privacy_show_read_receipt` tinyint(1) NOT NULL DEFAULT 1",
        ];
        foreach ($cols as $name => $sql) {
            $has = $this->fetchRow("SHOW COLUMNS FROM `users` LIKE '{$name}'");
            if (!$has) {
                $this->execute($sql);
            }
        }
    }

    public function down(): void
    {
        foreach (['privacy_show_read_receipt', 'privacy_show_last_seen'] as $col) {
            $has = $this->fetchRow("SHOW COLUMNS FROM `users` LIKE '{$col}'");
            if ($has) {
                $this->execute("ALTER TABLE `users` DROP COLUMN `" . $col . "`");
            }
        }
    }
}

<?php

declare(strict_types=1);

use Phinx\Migration\AbstractMigration;

/**
 * Pengaturan AI per-user: aktif/nonaktif menu AI + limit chat harian.
 */
final class UsersAiLimits extends AbstractMigration
{
    public function up(): void
    {
        $this->execute("ALTER TABLE `users` ADD COLUMN `ai_enabled` tinyint(1) NOT NULL DEFAULT 1 COMMENT '1=menu AI tampil & boleh pakai AI' AFTER `ai_whatsapp_enabled`");
        $this->execute("ALTER TABLE `users` ADD COLUMN `ai_daily_limit` int(11) NOT NULL DEFAULT 5 COMMENT 'Batas jumlah chat AI per hari (reset 00:00 server)' AFTER `ai_enabled`");
        $this->execute("ALTER TABLE `users` ADD KEY `idx_ai_enabled` (`ai_enabled`)");
    }

    public function down(): void
    {
        $this->execute("ALTER TABLE `users` DROP KEY `idx_ai_enabled`");
        $this->execute("ALTER TABLE `users` DROP COLUMN `ai_daily_limit`");
        $this->execute("ALTER TABLE `users` DROP COLUMN `ai_enabled`");
    }
}


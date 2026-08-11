<?php

declare(strict_types=1);

use Phinx\Migration\AbstractMigration;

/**
 * Toggle per-user: akses AI dari WhatsApp.
 */
final class UsersAiWhatsappEnabled extends AbstractMigration
{
    public function up(): void
    {
        $this->execute("ALTER TABLE `users` ADD COLUMN `ai_whatsapp_enabled` tinyint(1) NOT NULL DEFAULT 0 COMMENT '1=pesan WA user diarahkan ke AI eBeddien' AFTER `no_wa_verified_at`");
        $this->execute("ALTER TABLE `users` ADD KEY `idx_ai_whatsapp_enabled` (`ai_whatsapp_enabled`)");
    }

    public function down(): void
    {
        $this->execute("ALTER TABLE `users` DROP KEY `idx_ai_whatsapp_enabled`");
        $this->execute("ALTER TABLE `users` DROP COLUMN `ai_whatsapp_enabled`");
    }
}


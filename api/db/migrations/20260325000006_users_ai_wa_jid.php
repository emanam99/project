<?php

declare(strict_types=1);

use Phinx\Migration\AbstractMigration;

/**
 * JID WhatsApp pengirim (mis. …@lid / …@s.whatsapp.net) untuk AI WA — diisi lewat pesan aktivasi.
 */
final class UsersAiWaJid extends AbstractMigration
{
    public function up(): void
    {
        $this->execute("ALTER TABLE `users` ADD COLUMN `ai_wa_jid` varchar(128) DEFAULT NULL COMMENT 'JID WA pengirim untuk AI (binding)' AFTER `ai_whatsapp_enabled`");
    }

    public function down(): void
    {
        $this->execute('ALTER TABLE `users` DROP COLUMN `ai_wa_jid`');
    }
}

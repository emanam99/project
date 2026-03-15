<?php

declare(strict_types=1);

use Phinx\Migration\AbstractMigration;

/**
 * Tambah from_jid ke daftar_notif_pending agar lookup konsisten saat user balas (nomor bisa beda format/LID).
 */
final class DaftarNotifPendingFromJid extends AbstractMigration
{
    public function up(): void
    {
        $this->execute("ALTER TABLE `daftar_notif_pending` ADD COLUMN `from_jid` varchar(120) DEFAULT NULL COMMENT 'JID asli WA (xxx@c.us atau xxx@lid) untuk lookup balasan' AFTER `nomor`");
        $this->execute('CREATE INDEX `idx_daftar_notif_pending_from_jid` ON `daftar_notif_pending` (`from_jid`(100))');
    }

    public function down(): void
    {
        $this->execute('DROP INDEX `idx_daftar_notif_pending_from_jid` ON `daftar_notif_pending`');
        $this->execute('ALTER TABLE `daftar_notif_pending` DROP COLUMN `from_jid`');
    }
}

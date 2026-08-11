<?php

declare(strict_types=1);

use Phinx\Migration\AbstractMigration;

/**
 * Chat: kolom message_id (ID pesan WA untuk update status) + status seperti WA: sent, delivered, read.
 * Berhasil = sent (1 centang), delivered = 2 centang, read = 2 centang biru.
 */
final class ChatMessageIdDanStatusWa extends AbstractMigration
{
    public function up(): void
    {
        $this->execute('SET NAMES utf8mb4');

        $conn = $this->getAdapter()->getConnection();
        $row = $conn->query("SHOW COLUMNS FROM chat LIKE 'message_id'")->fetch();
        if (!$row) {
            $this->execute("ALTER TABLE chat ADD COLUMN message_id VARCHAR(255) NULL DEFAULT NULL COMMENT 'ID pesan WA (untuk update status delivered/read)' AFTER status_pengiriman");
            $this->execute("CREATE INDEX idx_chat_message_id ON chat (message_id)");
        }

        $this->execute("ALTER TABLE chat MODIFY COLUMN status_pengiriman ENUM('pending','sent','delivered','read','berhasil','gagal') DEFAULT 'pending' COMMENT 'pending=clock, sent=1centang, delivered=2centang, read=2centang biru'");
    }

    public function down(): void
    {
        $this->execute('DROP INDEX idx_chat_message_id ON chat');
        $this->execute('ALTER TABLE chat DROP COLUMN message_id');
        $this->execute("ALTER TABLE chat MODIFY COLUMN status_pengiriman ENUM('berhasil','pending','gagal') DEFAULT 'pending'");
    }
}

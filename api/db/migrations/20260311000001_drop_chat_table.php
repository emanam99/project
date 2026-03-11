<?php

declare(strict_types=1);

use Phinx\Migration\AbstractMigration;

/**
 * Hapus tabel chat. Riwayat chat hanya dari tabel whatsapp (satu sumber, tidak duplikasi).
 */
final class DropChatTable extends AbstractMigration
{
    public function up(): void
    {
        $conn = $this->getAdapter()->getConnection();
        $stmt = $conn->query("SHOW TABLES LIKE 'chat'");
        if ($stmt && $stmt->rowCount() > 0) {
            $this->execute('SET FOREIGN_KEY_CHECKS = 0');
            $this->execute('DROP TABLE IF EXISTS `chat`');
            $this->execute('SET FOREIGN_KEY_CHECKS = 1');
        }
    }

    public function down(): void
    {
        // Tidak dibuat ulang tabel chat; riwayat tetap pakai whatsapp.
    }
}

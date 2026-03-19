<?php

declare(strict_types=1);

use Phinx\Migration\AbstractMigration;

/**
 * Tambah kolom last_seen_at di users untuk "terakhir online" (di-update saat user connect via socket).
 */
final class UsersLastSeenAt extends AbstractMigration
{
    public function up(): void
    {
        $this->execute("ALTER TABLE `users` ADD COLUMN `last_seen_at` datetime DEFAULT NULL COMMENT 'Terakhir terlihat online (di-update saat connect socket)' AFTER `last_login_at`");
        $this->execute("ALTER TABLE `users` ADD KEY `idx_last_seen_at` (`last_seen_at`)");
    }

    public function down(): void
    {
        $this->execute("ALTER TABLE `users` DROP KEY `idx_last_seen_at`");
        $this->execute("ALTER TABLE `users` DROP COLUMN `last_seen_at`");
    }
}

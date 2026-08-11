<?php

declare(strict_types=1);

use Phinx\Migration\AbstractMigration;

/**
 * Guard tambahan: pastikan users.no_wa dan users.email punya unique index.
 * Aman dijalankan berulang (skip jika index sudah ada).
 */
final class UsersUniqueEmailNoWaGuard extends AbstractMigration
{
    public function up(): void
    {
        $hasNoWa = $this->fetchRow("
            SELECT 1
            FROM INFORMATION_SCHEMA.STATISTICS
            WHERE TABLE_SCHEMA = DATABASE()
              AND TABLE_NAME = 'users'
              AND INDEX_NAME = 'unique_users_no_wa'
            LIMIT 1
        ");
        if (!$hasNoWa) {
            $this->execute("ALTER TABLE `users` ADD UNIQUE KEY `unique_users_no_wa` (`no_wa`)");
        }

        $hasEmail = $this->fetchRow("
            SELECT 1
            FROM INFORMATION_SCHEMA.STATISTICS
            WHERE TABLE_SCHEMA = DATABASE()
              AND TABLE_NAME = 'users'
              AND INDEX_NAME = 'unique_users_email'
            LIMIT 1
        ");
        if (!$hasEmail) {
            $this->execute("ALTER TABLE `users` ADD UNIQUE KEY `unique_users_email` (`email`)");
        }
    }

    public function down(): void
    {
        $hasNoWa = $this->fetchRow("
            SELECT 1
            FROM INFORMATION_SCHEMA.STATISTICS
            WHERE TABLE_SCHEMA = DATABASE()
              AND TABLE_NAME = 'users'
              AND INDEX_NAME = 'unique_users_no_wa'
            LIMIT 1
        ");
        if ($hasNoWa) {
            $this->execute("ALTER TABLE `users` DROP INDEX `unique_users_no_wa`");
        }

        $hasEmail = $this->fetchRow("
            SELECT 1
            FROM INFORMATION_SCHEMA.STATISTICS
            WHERE TABLE_SCHEMA = DATABASE()
              AND TABLE_NAME = 'users'
              AND INDEX_NAME = 'unique_users_email'
            LIMIT 1
        ");
        if ($hasEmail) {
            $this->execute("ALTER TABLE `users` DROP INDEX `unique_users_email`");
        }
    }
}


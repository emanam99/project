<?php

declare(strict_types=1);

use Phinx\Migration\AbstractMigration;

/**
 * Pastikan email dan no_wa di users tidak bisa duplikat.
 */
final class UsersUniqueEmailNoWa extends AbstractMigration
{
    public function up(): void
    {
        // Deduplikasi existing data:
        // - Untuk no_wa duplikat: pertahankan users.id paling kecil, hapus sisanya.
        // - Untuk email duplikat (case-insensitive): pertahankan users.id paling kecil, hapus sisanya.
        // Jika satu baris termasuk duplikat di keduanya, tetap hanya dihapus sekali (pakai temporary table + INSERT IGNORE).
        $this->execute("DROP TEMPORARY TABLE IF EXISTS tmp_users_delete");
        $this->execute("CREATE TEMPORARY TABLE tmp_users_delete (`id` INT PRIMARY KEY) ENGINE=MEMORY");

        $this->execute("
            INSERT IGNORE INTO tmp_users_delete (id)
            SELECT u.id
            FROM users u
            INNER JOIN (
                SELECT no_wa, MIN(id) AS keep_id
                FROM users
                WHERE no_wa IS NOT NULL AND TRIM(no_wa) <> ''
                GROUP BY no_wa
                HAVING COUNT(*) > 1
            ) d ON d.no_wa = u.no_wa
            WHERE u.id <> d.keep_id
        ");

        $this->execute("
            INSERT IGNORE INTO tmp_users_delete (id)
            SELECT u.id
            FROM users u
            INNER JOIN (
                SELECT LOWER(TRIM(email)) AS email_norm, MIN(id) AS keep_id
                FROM users
                WHERE email IS NOT NULL AND TRIM(email) <> ''
                GROUP BY LOWER(TRIM(email))
                HAVING COUNT(*) > 1
            ) d ON LOWER(TRIM(u.email)) = d.email_norm
            WHERE u.id <> d.keep_id
        ");

        $this->execute("
            DELETE u
            FROM users u
            INNER JOIN tmp_users_delete d ON d.id = u.id
        ");

        $idxNoWa = $this->fetchRow("
            SELECT 1
            FROM INFORMATION_SCHEMA.STATISTICS
            WHERE TABLE_SCHEMA = DATABASE()
              AND TABLE_NAME = 'users'
              AND INDEX_NAME = 'unique_users_no_wa'
            LIMIT 1
        ");
        if (!$idxNoWa) {
            $this->execute("ALTER TABLE `users` ADD UNIQUE KEY `unique_users_no_wa` (`no_wa`)");
        }

        $idxEmail = $this->fetchRow("
            SELECT 1
            FROM INFORMATION_SCHEMA.STATISTICS
            WHERE TABLE_SCHEMA = DATABASE()
              AND TABLE_NAME = 'users'
              AND INDEX_NAME = 'unique_users_email'
            LIMIT 1
        ");
        if (!$idxEmail) {
            $this->execute("ALTER TABLE `users` ADD UNIQUE KEY `unique_users_email` (`email`)");
        }

        $this->execute("DROP TEMPORARY TABLE IF EXISTS tmp_users_delete");
    }

    public function down(): void
    {
        $idxNoWa = $this->fetchRow("
            SELECT 1
            FROM INFORMATION_SCHEMA.STATISTICS
            WHERE TABLE_SCHEMA = DATABASE()
              AND TABLE_NAME = 'users'
              AND INDEX_NAME = 'unique_users_no_wa'
            LIMIT 1
        ");
        if ($idxNoWa) {
            $this->execute("ALTER TABLE `users` DROP INDEX `unique_users_no_wa`");
        }

        $idxEmail = $this->fetchRow("
            SELECT 1
            FROM INFORMATION_SCHEMA.STATISTICS
            WHERE TABLE_SCHEMA = DATABASE()
              AND TABLE_NAME = 'users'
              AND INDEX_NAME = 'unique_users_email'
            LIMIT 1
        ");
        if ($idxEmail) {
            $this->execute("ALTER TABLE `users` DROP INDEX `unique_users_email`");
        }
    }
}

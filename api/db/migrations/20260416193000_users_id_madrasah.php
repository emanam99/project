<?php

declare(strict_types=1);

use Phinx\Migration\AbstractMigration;

/**
 * Relasi akun Mybeddien (PJGT) ke madrasah: users.id_madrasah → madrasah.id.
 * Relasi balik akun login PJGT tetap madrasah.id_pjgt → users.id (sudah ada).
 */
final class UsersIdMadrasah extends AbstractMigration
{
    private function hasColumn(string $tableName, string $columnName): bool
    {
        $conn = $this->getAdapter()->getConnection();
        $stmt = $conn->prepare("
            SELECT 1 AS ok FROM information_schema.COLUMNS
            WHERE TABLE_SCHEMA = DATABASE()
              AND TABLE_NAME = ?
              AND COLUMN_NAME = ?
            LIMIT 1
        ");
        $stmt->execute([$tableName, $columnName]);
        $row = $stmt->fetch(\PDO::FETCH_ASSOC);
        return $row !== false && !empty($row);
    }

    public function up(): void
    {
        if (!$this->hasTable('users') || !$this->hasTable('madrasah')) {
            return;
        }
        if (!$this->hasColumn('users', 'id_madrasah')) {
            $this->execute("ALTER TABLE `users` ADD COLUMN `id_madrasah` int(11) NULL DEFAULT NULL COMMENT 'FK madrasah.id — akun portal PJGT / mybeddien' AFTER `role`");
        }
        if (!$this->hasColumn('users', 'id_madrasah')) {
            return;
        }
        $this->execute('SET FOREIGN_KEY_CHECKS = 0');
        try {
            $this->execute('ALTER TABLE `users` ADD KEY `idx_users_id_madrasah` (`id_madrasah`)');
        } catch (\Throwable $e) {
            if (strpos($e->getMessage(), 'Duplicate key name') === false) {
                throw $e;
            }
        }
        try {
            $this->execute('ALTER TABLE `users` ADD CONSTRAINT `fk_users_id_madrasah` FOREIGN KEY (`id_madrasah`) REFERENCES `madrasah` (`id`) ON DELETE SET NULL ON UPDATE CASCADE');
        } catch (\Throwable $e) {
            if (strpos($e->getMessage(), 'Duplicate foreign key') === false && strpos($e->getMessage(), 'already exists') === false) {
                throw $e;
            }
        }
        $this->execute('SET FOREIGN_KEY_CHECKS = 1');
    }

    public function down(): void
    {
        if (!$this->hasTable('users') || !$this->hasColumn('users', 'id_madrasah')) {
            return;
        }
        $this->execute('SET FOREIGN_KEY_CHECKS = 0');
        try {
            $this->execute('ALTER TABLE `users` DROP FOREIGN KEY `fk_users_id_madrasah`');
        } catch (\Throwable $e) {
        }
        try {
            $this->execute('ALTER TABLE `users` DROP INDEX `idx_users_id_madrasah`');
        } catch (\Throwable $e) {
        }
        $this->execute('ALTER TABLE `users` DROP COLUMN `id_madrasah`');
        $this->execute('SET FOREIGN_KEY_CHECKS = 1');
    }
}

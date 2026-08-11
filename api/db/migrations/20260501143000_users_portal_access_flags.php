<?php

declare(strict_types=1);

use Phinx\Migration\AbstractMigration;

/**
 * Flag akses per aplikasi: eBeddien vs peran Mybeddian (santri/toko/PJGT).
 * Login Mybeddian mem-filter identitas sesuai flag; login eBeddien cek access_ebeddien.
 */
final class UsersPortalAccessFlags extends AbstractMigration
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
        if (!$this->hasTable('users')) {
            return;
        }
        if (!$this->hasColumn('users', 'access_ebeddien')) {
            $this->execute("ALTER TABLE `users` ADD COLUMN `access_ebeddien` tinyint(1) NOT NULL DEFAULT 1 COMMENT '1=boleh login ke eBeddien' AFTER `is_active`");
        }
        if (!$this->hasColumn('users', 'access_mybeddian_santri')) {
            $this->execute("ALTER TABLE `users` ADD COLUMN `access_mybeddian_santri` tinyint(1) NOT NULL DEFAULT 1 COMMENT '1=boleh login Mybeddian sebagai santri' AFTER `access_ebeddien`");
        }
        if (!$this->hasColumn('users', 'access_mybeddian_toko')) {
            $this->execute("ALTER TABLE `users` ADD COLUMN `access_mybeddian_toko` tinyint(1) NOT NULL DEFAULT 1 COMMENT '1=boleh login Mybeddian sebagai toko' AFTER `access_mybeddian_santri`");
        }
        if (!$this->hasColumn('users', 'access_mybeddian_pjgt')) {
            $this->execute("ALTER TABLE `users` ADD COLUMN `access_mybeddian_pjgt` tinyint(1) NOT NULL DEFAULT 1 COMMENT '1=boleh login Mybeddian sebagai PJGT' AFTER `access_mybeddian_toko`");
        }
    }

    public function down(): void
    {
        if (!$this->hasTable('users')) {
            return;
        }
        foreach (['access_mybeddian_pjgt', 'access_mybeddian_toko', 'access_mybeddian_santri', 'access_ebeddien'] as $col) {
            if ($this->hasColumn('users', $col)) {
                $this->execute("ALTER TABLE `users` DROP COLUMN `{$col}`");
            }
        }
    }
}

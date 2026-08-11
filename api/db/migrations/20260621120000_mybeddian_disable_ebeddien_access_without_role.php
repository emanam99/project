<?php

declare(strict_types=1);

use Phinx\Migration\AbstractMigration;

/**
 * Akun yang dibuat dari MyBeddien tidak otomatis boleh login ke eBeddien.
 * Pertahankan akses hanya untuk akun yang sudah tertaut ke pengurus dan punya role.
 */
final class MybeddianDisableEbeddienAccessWithoutRole extends AbstractMigration
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
        if (
            !$this->hasTable('users')
            || !$this->hasTable('pengurus')
            || !$this->hasTable('pengurus___role')
            || !$this->hasColumn('users', 'access_ebeddien')
        ) {
            return;
        }

        $this->execute("
            UPDATE `users` u
            SET u.`access_ebeddien` = 0
            WHERE COALESCE(u.`access_ebeddien`, 1) <> 0
              AND NOT EXISTS (
                SELECT 1
                FROM `pengurus` p
                INNER JOIN `pengurus___role` pr ON pr.`pengurus_id` = p.`id`
                WHERE p.`id_user` = u.`id`
                LIMIT 1
              )
        ");
    }

    public function down(): void
    {
        // Tidak mengaktifkan ulang akses massal agar akun MyBeddien-only tetap terblokir dari eBeddien.
    }
}

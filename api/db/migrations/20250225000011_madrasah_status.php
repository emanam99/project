<?php

declare(strict_types=1);

use Phinx\Migration\AbstractMigration;

/**
 * Tambah kolom status di madrasah: Pendaftar Baru, Belum Survei, Sudah Survei, Penerima, Tidak Aktif.
 */
final class MadrasahStatus extends AbstractMigration
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
        if (!$this->hasColumn('madrasah', 'status')) {
            $this->execute("ALTER TABLE madrasah ADD COLUMN status VARCHAR(50) NULL DEFAULT NULL COMMENT 'Pendaftar Baru, Belum Survei, Sudah Survei, Penerima, Tidak Aktif' AFTER kategori");
        }
    }

    public function down(): void
    {
        if ($this->hasColumn('madrasah', 'status')) {
            $this->execute("ALTER TABLE madrasah DROP COLUMN status");
        }
    }
}

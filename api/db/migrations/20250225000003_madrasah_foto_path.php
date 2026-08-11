<?php

declare(strict_types=1);

use Phinx\Migration\AbstractMigration;

/**
 * Tambah kolom foto_path ke tabel madrasah (path relatif ke uploads/ugt/).
 */
final class MadrasahFotoPath extends AbstractMigration
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
        if (!$this->hasColumn('madrasah', 'foto_path')) {
            $this->execute("ALTER TABLE madrasah ADD COLUMN foto_path VARCHAR(500) NULL DEFAULT NULL COMMENT 'Path relatif foto madrasah (uploads/ugt/...)' AFTER jumlah_murid");
        }
    }

    public function down(): void
    {
        if ($this->hasColumn('madrasah', 'foto_path')) {
            $this->execute("ALTER TABLE madrasah DROP COLUMN foto_path");
        }
    }
}

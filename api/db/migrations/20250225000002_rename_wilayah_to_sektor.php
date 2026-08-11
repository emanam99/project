<?php

declare(strict_types=1);

use Phinx\Migration\AbstractMigration;

/**
 * Rename madrasah.wilayah -> sektor.
 */
final class RenameWilayahToSektor extends AbstractMigration
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
        if ($this->hasColumn('madrasah', 'wilayah') && !$this->hasColumn('madrasah', 'sektor')) {
            $this->execute("ALTER TABLE madrasah CHANGE COLUMN wilayah sektor VARCHAR(255) NULL DEFAULT NULL");
        }
    }

    public function down(): void
    {
        if ($this->hasColumn('madrasah', 'sektor') && !$this->hasColumn('madrasah', 'wilayah')) {
            $this->execute("ALTER TABLE madrasah CHANGE COLUMN sektor wilayah VARCHAR(255) NULL DEFAULT NULL");
        }
    }
}

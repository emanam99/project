<?php

declare(strict_types=1);

use Phinx\Migration\AbstractMigration;

/**
 * Kolom logo madrasah (PNG/JPEG), path relatif uploads/ugt/.
 */
final class MadrasahLogoPath extends AbstractMigration
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
        if (!$this->hasColumn('madrasah', 'logo_path')) {
            $this->execute("ALTER TABLE madrasah ADD COLUMN logo_path VARCHAR(500) NULL DEFAULT NULL COMMENT 'Path relatif logo madrasah (uploads/ugt/..., PNG/JPEG)' AFTER foto_path");
        }
    }

    public function down(): void
    {
        if ($this->hasColumn('madrasah', 'logo_path')) {
            $this->execute('ALTER TABLE madrasah DROP COLUMN logo_path');
        }
    }
}

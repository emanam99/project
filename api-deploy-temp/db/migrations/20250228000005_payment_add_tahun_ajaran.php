<?php

declare(strict_types=1);

use Phinx\Migration\AbstractMigration;

/**
 * Tambah kolom tahun_ajaran di payment untuk UWABA.
 * id_referensi bertipe INT sehingga "1447-1448" terpotong jadi 1447; tahun_ajaran (VARCHAR) menyimpan format penuh.
 */
final class PaymentAddTahunAjaran extends AbstractMigration
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
        if (!$this->hasColumn('payment', 'tahun_ajaran')) {
            $this->execute("ALTER TABLE payment ADD COLUMN tahun_ajaran VARCHAR(20) NULL DEFAULT NULL COMMENT 'Format 1447-1448 untuk UWABA' AFTER tabel_referensi");
        }
    }

    public function down(): void
    {
        if ($this->hasColumn('payment', 'tahun_ajaran')) {
            $this->execute('ALTER TABLE payment DROP COLUMN tahun_ajaran');
        }
    }
}

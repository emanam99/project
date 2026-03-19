<?php

declare(strict_types=1);

use Phinx\Migration\AbstractMigration;

/**
 * Hapus kolom no_telpon dari tabel pengurus.
 * Nomor WA/telepon pengurus hanya disimpan di tabel users (no_wa).
 * Semua notifikasi dan tampilan nomor pengurus memakai users.no_wa.
 */
final class PengurusDropNoTelpon extends AbstractMigration
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
        if ($this->hasColumn('pengurus', 'no_telpon')) {
            $this->execute('ALTER TABLE `pengurus` DROP COLUMN `no_telpon`');
        }
    }

    public function down(): void
    {
        if (!$this->hasColumn('pengurus', 'no_telpon')) {
            $this->execute("ALTER TABLE `pengurus` ADD COLUMN `no_telpon` VARCHAR(20) NULL DEFAULT NULL AFTER `kode_pos`");
        }
    }
}

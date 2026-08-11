<?php

declare(strict_types=1);

use Phinx\Migration\AbstractMigration;

/**
 * Tambah UNIQUE index pada pengurus.nik agar satu NIK hanya untuk satu pengurus.
 * Di MySQL, UNIQUE mengizinkan banyak NULL; hanya nilai non-NULL yang harus unik.
 * Jika ada NIK duplikat di tabel, perbaiki dulu lalu jalankan: php vendor/bin/phinx migrate
 */
final class PengurusUniqueNik extends AbstractMigration
{
    private function hasIndex(string $tableName, string $indexName): bool
    {
        $conn = $this->getAdapter()->getConnection();
        $stmt = $conn->prepare("
            SELECT 1 AS ok FROM information_schema.statistics
            WHERE table_schema = DATABASE() AND table_name = ? AND index_name = ?
            LIMIT 1
        ");
        $stmt->execute([$tableName, $indexName]);
        $row = $stmt->fetch(\PDO::FETCH_ASSOC);
        return $row !== false && !empty($row);
    }

    public function up(): void
    {
        if ($this->hasIndex('pengurus', 'unique_pengurus_nik')) {
            return;
        }
        // Normalisasi: kosongkan nik yang '' agar UNIQUE tidak bentrok (banyak NULL diperbolehkan)
        $this->execute("UPDATE pengurus SET nik = NULL WHERE TRIM(COALESCE(nik, '')) = ''");
        $this->execute('ALTER TABLE pengurus ADD UNIQUE KEY unique_pengurus_nik (nik)');
    }

    public function down(): void
    {
        if (!$this->hasIndex('pengurus', 'unique_pengurus_nik')) {
            return;
        }
        $this->execute('ALTER TABLE pengurus DROP KEY unique_pengurus_nik');
    }
}

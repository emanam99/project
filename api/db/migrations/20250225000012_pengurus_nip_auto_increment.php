<?php

declare(strict_types=1);

use Phinx\Migration\AbstractMigration;

/**
 * Pengurus: tambah kolom NIP (Nomor Induk Pengurus), isi dengan nilai id lama.
 * Kemudian ubah id menjadi AUTO_INCREMENT.
 * - nip: unik, untuk input/tampilan (daftar, koordinator, lupa password).
 * - id: tetap dipakai untuk relasi/FK di database (nilai lama TIDAK diubah, hanya new insert dapat id otomatis).
 * Semua FK di tabel lain (madrasah.id_koordinator, pengurus___role.pengurus_id, pengeluaran.id_penerima, dll)
 * tetap mengacu ke pengurus.id yang sama; tidak perlu update tabel lain.
 */
final class PengurusNipAutoIncrement extends AbstractMigration
{
    private function hasColumn(string $table, string $column): bool
    {
        $conn = $this->getAdapter()->getConnection();
        $stmt = $conn->prepare("
            SELECT 1 AS ok FROM information_schema.columns
            WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ?
            LIMIT 1
        ");
        $stmt->execute([$table, $column]);
        $row = $stmt->fetch(\PDO::FETCH_ASSOC);
        return $row !== false && !empty($row);
    }

    private function hasIndex(string $table, string $indexName): bool
    {
        $conn = $this->getAdapter()->getConnection();
        $stmt = $conn->prepare("
            SELECT 1 AS ok FROM information_schema.statistics
            WHERE table_schema = DATABASE() AND table_name = ? AND index_name = ?
            LIMIT 1
        ");
        $stmt->execute([$table, $indexName]);
        $row = $stmt->fetch(\PDO::FETCH_ASSOC);
        return $row !== false && !empty($row);
    }

    public function up(): void
    {
        // Hapus trigger lama yang mengisi id pengurus (bentrok dengan AUTO_INCREMENT)
        $this->execute('DROP TRIGGER IF EXISTS `generate_pengurus_id`');

        $this->execute('SET FOREIGN_KEY_CHECKS = 0');

        if (!$this->hasColumn('pengurus', 'nip')) {
            $this->execute('ALTER TABLE pengurus ADD COLUMN nip INT(7) NULL DEFAULT NULL COMMENT \'Nomor Induk Pengurus\' AFTER id');
            $this->execute('UPDATE pengurus SET nip = id');
            $this->execute('ALTER TABLE pengurus MODIFY COLUMN nip INT(7) NOT NULL COMMENT \'Nomor Induk Pengurus\'');
            if (!$this->hasIndex('pengurus', 'unique_pengurus_nip')) {
                $this->execute('ALTER TABLE pengurus ADD UNIQUE KEY unique_pengurus_nip (nip)');
            }
        }

        // Ubah id jadi AUTO_INCREMENT (nilai lama tetap; insert baru dapat id otomatis)
        $this->execute('ALTER TABLE pengurus MODIFY COLUMN id INT(7) NOT NULL AUTO_INCREMENT');

        $this->execute('SET FOREIGN_KEY_CHECKS = 1');
    }

    public function down(): void
    {
        $this->execute('SET FOREIGN_KEY_CHECKS = 0');

        $this->execute('ALTER TABLE pengurus MODIFY COLUMN id INT(7) NOT NULL');
        if ($this->hasIndex('pengurus', 'unique_pengurus_nip')) {
            $this->execute('ALTER TABLE pengurus DROP KEY unique_pengurus_nip');
        }
        if ($this->hasColumn('pengurus', 'nip')) {
            $this->execute('ALTER TABLE pengurus DROP COLUMN nip');
        }

        $this->execute('SET FOREIGN_KEY_CHECKS = 1');
    }
}

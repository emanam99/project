<?php

declare(strict_types=1);

use Phinx\Migration\AbstractMigration;

/**
 * Data lama: id_pengurus terisi NIP (7 digit) dari mesin, seharusnya pengurus.id.
 * 1) Drop FK absen___pengurus → pengurus (agar UPDATE aman).
 * 2) UPDATE id_pengurus lewat JOIN pengurus.nip = absen___pengurus.id_pengurus.
 * 3) Hapus baris yatim (tidak ada pengurus.id yang cocok).
 * 4) Tambah FK: ON UPDATE CASCADE, ON DELETE RESTRICT (log absensi tidak ikut terhapus saat pengurus dihapus).
 */
final class AbsenPengurusNipToIdAndFk extends AbstractMigration
{
    public function up(): void
    {
        $this->execute('SET NAMES utf8mb4');

        if (!$this->hasTable('absen___pengurus') || !$this->hasTable('pengurus')) {
            return;
        }

        $conn = $this->getAdapter()->getConnection();

        // Hanya FK yang mereferensi tabel pengurus
        $stmt = $conn->query("
            SELECT DISTINCT kcu.CONSTRAINT_NAME
            FROM information_schema.KEY_COLUMN_USAGE kcu
            WHERE kcu.TABLE_SCHEMA = DATABASE()
              AND kcu.TABLE_NAME = 'absen___pengurus'
              AND kcu.REFERENCED_TABLE_NAME = 'pengurus'
        ");
        $fkNames = $stmt ? $stmt->fetchAll(\PDO::FETCH_COLUMN) : [];
        foreach ($fkNames as $name) {
            if (!is_string($name) || $name === '') {
                continue;
            }
            $safe = str_replace('`', '``', $name);
            $this->execute("ALTER TABLE `absen___pengurus` DROP FOREIGN KEY `{$safe}`");
        }

        // Map NIP → id (baris yang sudah benar: id_pengurus = p.id dan p.nip beda → tidak ikut JOIN nip = id_pengurus kecuali kebetulan sama)
        if ($this->table('pengurus')->hasColumn('nip')) {
            $this->execute('
                UPDATE `absen___pengurus` AS a
                INNER JOIN `pengurus` AS p ON p.nip = a.id_pengurus
                SET a.id_pengurus = p.id
            ');
        }

        // Baris yang id_pengurus bukan id pengurus manapun
        $this->execute('
            DELETE a FROM `absen___pengurus` AS a
            LEFT JOIN `pengurus` AS p ON p.id = a.id_pengurus
            WHERE p.id IS NULL
        ');

        // FK sudah di-drop di awal — tambah lagi dengan ON UPDATE CASCADE + ON DELETE RESTRICT
        $this->execute('
            ALTER TABLE `absen___pengurus`
            ADD CONSTRAINT `fk_absen_pengurus_pengurus`
            FOREIGN KEY (`id_pengurus`) REFERENCES `pengurus` (`id`)
            ON DELETE RESTRICT ON UPDATE CASCADE
        ');
    }

    public function down(): void
    {
        // Tidak mengembalikan NIP di id_pengurus (data sudah diubah).
    }
}

<?php

declare(strict_types=1);

use Phinx\Migration\AbstractMigration;

/**
 * Hapus tabel alamat lama, buat ulang, seed Jember & Bondowoso (+ kode pos).
 */
final class AlamatRebuildJemberBondowoso extends AbstractMigration
{
    public function up(): void
    {
        $this->execute('SET FOREIGN_KEY_CHECKS = 0');

        // Lepas FK yang mereferensi alamat
        $this->dropFkIfExists('madrasah', 'fk_madrasah_alamat');
        $this->dropFkIfExists('alamat___khusus', 'alamat___khusus_ibfk_1');

        if ($this->hasTable('madrasah') && $this->table('madrasah')->hasColumn('id_alamat')) {
            $this->execute('UPDATE `madrasah` SET `id_alamat` = NULL');
        }
        if ($this->hasTable('alamat___khusus') && $this->table('alamat___khusus')->hasColumn('id_alamat')) {
            $this->execute('UPDATE `alamat___khusus` SET `id_alamat` = NULL');
        }

        if ($this->hasTable('alamat')) {
            $this->execute('DROP TABLE IF EXISTS `alamat`');
        }

        $this->execute(<<<'SQL'
CREATE TABLE `alamat` (
  `id` varchar(50) NOT NULL,
  `nama` varchar(200) NOT NULL,
  `tipe` enum('provinsi','kabupaten','kecamatan','desa','dusun') NOT NULL,
  `kode_pos` varchar(10) DEFAULT NULL,
  `keterangan` text DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `alamat_nama` (`nama`),
  KEY `alamat_tipe` (`tipe`),
  KEY `alamat_kode_pos` (`kode_pos`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
SQL);

        $this->execute('SET FOREIGN_KEY_CHECKS = 1');

        if ($this->hasTable('madrasah') && $this->table('madrasah')->hasColumn('id_alamat')) {
            try {
                $this->execute(
                    'ALTER TABLE `madrasah` ADD CONSTRAINT `fk_madrasah_alamat` '
                    . 'FOREIGN KEY (`id_alamat`) REFERENCES `alamat` (`id`) ON DELETE SET NULL ON UPDATE CASCADE'
                );
            } catch (\Throwable $e) {
                // ignore
            }
        }
        if ($this->hasTable('alamat___khusus') && $this->table('alamat___khusus')->hasColumn('id_alamat')) {
            try {
                $this->execute(
                    'ALTER TABLE `alamat___khusus` ADD CONSTRAINT `alamat___khusus_ibfk_1` '
                    . 'FOREIGN KEY (`id_alamat`) REFERENCES `alamat` (`id`) ON DELETE SET NULL ON UPDATE CASCADE'
                );
            } catch (\Throwable $e) {
                // ignore
            }
        }

        $jsonPath = dirname(__DIR__) . '/data/alamat_jember_bondowoso.json';
        if (!is_file($jsonPath)) {
            throw new \RuntimeException('File seed tidak ada: ' . $jsonPath);
        }
        $rows = json_decode((string) file_get_contents($jsonPath), true);
        if (!is_array($rows) || $rows === []) {
            throw new \RuntimeException('Seed alamat kosong/invalid');
        }

        $pdo = $this->getAdapter()->getConnection();
        $stmt = $pdo->prepare(
            'INSERT INTO `alamat` (`id`, `nama`, `tipe`, `kode_pos`, `keterangan`) VALUES (?, ?, ?, ?, NULL)'
        );
        foreach ($rows as $row) {
            $stmt->execute([
                (string) $row['id'],
                (string) $row['nama'],
                (string) $row['tipe'],
                $row['kode_pos'] !== null && $row['kode_pos'] !== '' ? (string) $row['kode_pos'] : null,
            ]);
        }
    }

    private function dropFkIfExists(string $table, string $constraint): void
    {
        if (!$this->hasTable($table)) {
            return;
        }
        try {
            $this->execute("ALTER TABLE `{$table}` DROP FOREIGN KEY `{$constraint}`");
        } catch (\Throwable $e) {
            // ignore
        }
    }

    public function down(): void
    {
        // tidak mengembalikan data lama
    }
}

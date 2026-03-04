<?php

declare(strict_types=1);

use Phinx\Migration\AbstractMigration;

/**
 * Sinkron semua nilai tahun_ajaran dari tabel lain ke master tahun_ajaran,
 * lalu tambah FK dari setiap tabel yang punya kolom tahun_ajaran ke tahun_ajaran.
 *
 * Tabel yang di-FK (selain lembaga___wali_kelas yang sudah di migrasi 002):
 * - uwaba, uwaba___bayar, uwaba___tunggakan, uwaba___khusus
 * - payment
 * - santri___juara, santri___ijin
 * - pengeluaran___rencana, pengeluaran, pemasukan
 *
 * Kolom yang saat ini VARCHAR < 50 akan di-MODIFY ke VARCHAR(50) agar cocok dengan PK master.
 */
final class TahunAjaranFkAll extends AbstractMigration
{
    /** Daftar tabel dan kolom tahun_ajaran. Value true = kolom NOT NULL (harus tetap NOT NULL saat MODIFY). */
    private const TABLES = [
        'uwaba' => true,
        'uwaba___bayar' => false,
        'uwaba___tunggakan' => false,
        'uwaba___khusus' => false,
        'payment' => false,
        'santri___juara' => false,
        'santri___ijin' => true,
        'pengeluaran___rencana' => false,
        'pengeluaran' => false,
        'pemasukan' => false,
    ];

    /**
     * Satu subquery untuk INSERT IGNORE: ambil distinct tahun_ajaran dari satu tabel.
     * Return SQL fragment: SELECT ta AS tahun_ajaran, kategori, dari, sampai FROM (SELECT DISTINCT TRIM(tahun_ajaran) AS ta FROM tbl WHERE ...) x
     */
    private function selectDistinctTahunAjaran(string $table): string
    {
        $safeTable = preg_replace('/[^a-z0-9_]/', '', $table);
        $safeCol = 'tahun_ajaran';
        return "
            SELECT
                ta AS tahun_ajaran,
                CASE
                    WHEN ta REGEXP '^[0-9]{4}-[0-9]{4}\$' AND LEFT(ta, 2) = '14' THEN 'hijriyah'
                    WHEN ta REGEXP '^[0-9]{4}-[0-9]{4}\$' THEN 'masehi'
                    ELSE 'hijriyah'
                END AS kategori,
                CASE
                    WHEN ta REGEXP '^[0-9]{4}-[0-9]{4}\$'
                    THEN STR_TO_DATE(CONCAT(SUBSTRING_INDEX(ta, '-', 1), '-01-01'), '%Y-%m-%d')
                    ELSE NULL
                END AS dari,
                CASE
                    WHEN ta REGEXP '^[0-9]{4}-[0-9]{4}\$'
                    THEN STR_TO_DATE(CONCAT(SUBSTRING_INDEX(ta, '-', -1), '-12-31'), '%Y-%m-%d')
                    ELSE NULL
                END AS sampai
            FROM (
                SELECT DISTINCT TRIM({$safeCol}) AS ta
                FROM {$safeTable}
                WHERE {$safeCol} IS NOT NULL AND TRIM({$safeCol}) != ''
            ) AS src
        ";
    }

    public function up(): void
    {
        $this->execute('SET FOREIGN_KEY_CHECKS = 0');

        if (!$this->hasTable('tahun_ajaran')) {
            $this->execute('SET FOREIGN_KEY_CHECKS = 1');
            return;
        }

        $adapter = $this->getAdapter();
        $conn = $adapter->getConnection();

        // Lepas sementara FK wali_kelas agar bisa ubah kolom master
        if ($this->hasTable('lembaga___wali_kelas')) {
            try {
                $this->execute('ALTER TABLE lembaga___wali_kelas DROP FOREIGN KEY fk_wali_kelas_tahun_ajaran');
            } catch (\Throwable $e) {
                // Abaikan bila constraint tidak ada
            }
        }

        // Seragamkan kolom master ke utf8mb4 agar FK dari semua tabel anak valid
        $this->execute("
            ALTER TABLE tahun_ajaran
            MODIFY COLUMN tahun_ajaran VARCHAR(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL
        ");

        // Pasang kembali FK wali_kelas
        if ($this->hasTable('lembaga___wali_kelas')) {
            try {
                $this->execute("
                    ALTER TABLE lembaga___wali_kelas
                    ADD CONSTRAINT fk_wali_kelas_tahun_ajaran
                    FOREIGN KEY (tahun_ajaran) REFERENCES tahun_ajaran (tahun_ajaran)
                    ON UPDATE CASCADE ON DELETE RESTRICT
                ");
            } catch (\Throwable $e) {
                // Constraint mungkin sudah ada
            }
        }

        // Ambil charset/collation kolom tahun_ajaran di master (agar tabel anak sama)
        $stmt = $conn->prepare("
            SELECT CHARACTER_SET_NAME AS cs, COLLATION_NAME AS coll
            FROM information_schema.COLUMNS
            WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tahun_ajaran' AND COLUMN_NAME = 'tahun_ajaran'
        ");
        $stmt->execute();
        $row = $stmt->fetch(\PDO::FETCH_ASSOC);
        $charset = $row && !empty($row['cs']) ? $row['cs'] : 'utf8mb4';
        $collation = $row && !empty($row['coll']) ? $row['coll'] : 'utf8mb4_unicode_ci';

        // 1) Sinkron semua distinct tahun_ajaran dari setiap tabel ke master
        $unions = [];
        foreach (self::TABLES as $table => $column) {
            if (!$this->hasTable($table)) {
                continue;
            }
            $unions[] = $this->selectDistinctTahunAjaran($table);
        }
        if (count($unions) > 0) {
            $unionSql = implode(' UNION ', $unions);
            $this->execute("
                INSERT IGNORE INTO tahun_ajaran (tahun_ajaran, kategori, dari, sampai)
                SELECT tahun_ajaran, MAX(kategori), MAX(dari), MAX(sampai)
                FROM (
                    " . $unionSql . "
                ) AS combined
                GROUP BY tahun_ajaran
            ");
        }

        // 2) Untuk setiap tabel: sesuaikan ukuran kolom ke VARCHAR(50), tambah index, tambah FK
        $column = 'tahun_ajaran';

        foreach (self::TABLES as $table => $notNull) {
            if (!$this->hasTable($table)) {
                continue;
            }

            // Cek ukuran kolom saat ini
            $stmt = $conn->prepare("
                SELECT CHARACTER_MAXIMUM_LENGTH AS len
                FROM information_schema.COLUMNS
                WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?
            ");
            $stmt->execute([$table, $column]);
            $row = $stmt->fetch(\PDO::FETCH_ASSOC);
            $currentLen = $row ? (int) $row['len'] : 0;
            if ($currentLen > 0 && $currentLen < 50) {
                $nullPart = $notNull ? 'NOT NULL' : 'NULL DEFAULT NULL';
                $this->execute("
                    ALTER TABLE `" . str_replace('`', '``', $table) . "`
                    MODIFY COLUMN `" . str_replace('`', '``', $column) . "` VARCHAR(50) CHARACTER SET " . $charset . " COLLATE " . $collation . " " . $nullPart . "
                ");
            }

            // Index pada tahun_ajaran (jika belum ada)
            $stmt = $conn->prepare("
                SELECT 1 FROM information_schema.STATISTICS
                WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME != 'PRIMARY'
                AND COLUMN_NAME = ?
                LIMIT 1
            ");
            $stmt->execute([$table, $column]);
            if ($stmt->fetch(\PDO::FETCH_ASSOC) === false) {
                $this->execute("
                    ALTER TABLE `" . str_replace('`', '``', $table) . "`
                    ADD INDEX idx_tahun_ajaran_fk (`" . str_replace('`', '``', $column) . "`)
                ");
            }

            $constraintName = 'fk_ta_' . preg_replace('/[^a-z0-9_]/', '_', $table);

            // Cek apakah FK sudah ada
            $stmt = $conn->prepare("
                SELECT 1 FROM information_schema.TABLE_CONSTRAINTS
                WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ?
            ");
            $stmt->execute([$table, $constraintName]);
            if ($stmt->fetch(\PDO::FETCH_ASSOC) !== false) {
                continue;
            }

            $this->execute("
                ALTER TABLE `" . str_replace('`', '``', $table) . "`
                ADD CONSTRAINT `" . $constraintName . "`
                FOREIGN KEY (`" . str_replace('`', '``', $column) . "`) REFERENCES tahun_ajaran (tahun_ajaran)
                ON UPDATE CASCADE ON DELETE RESTRICT
            ");
        }

        $this->execute('SET FOREIGN_KEY_CHECKS = 1');
    }

    public function down(): void
    {
        $this->execute('SET FOREIGN_KEY_CHECKS = 0');

        foreach (array_keys(self::TABLES) as $table) {
            if (!$this->hasTable($table)) {
                continue;
            }
            $constraintName = 'fk_ta_' . preg_replace('/[^a-z0-9_]/', '_', $table);
            try {
                $this->execute("
                    ALTER TABLE `" . str_replace('`', '``', $table) . "`
                    DROP FOREIGN KEY `" . $constraintName . "`
                ");
            } catch (\Throwable $e) {
                // Constraint mungkin tidak ada
            }
        }

        $this->execute('SET FOREIGN_KEY_CHECKS = 1');
    }
}

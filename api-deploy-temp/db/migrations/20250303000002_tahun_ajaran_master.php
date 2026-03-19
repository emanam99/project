<?php

declare(strict_types=1);

use Phinx\Migration\AbstractMigration;

/**
 * Tabel master tahun_ajaran (hijriyah / masehi).
 * - Kolom tahun_ajaran menjadi PRIMARY KEY (contoh: 1447-1448, 2025-2026)
 * - Kolom kategori: hijriyah / masehi
 * - Kolom dari & sampai: tahun awal & akhir (INT), boleh NULL untuk data lama yang tidak standar
 *
 * Sekaligus:
 * - Isi awal beberapa tahun ajaran hijriyah & masehi
 * - Sinkronisasi nilai tahun_ajaran yang sudah ada di lembaga___wali_kelas
 * - Tambah FK dari lembaga___wali_kelas.tahun_ajaran ke tahun_ajaran.tahun_ajaran
 */
final class TahunAjaranMaster extends AbstractMigration
{
    public function up(): void
    {
        $this->execute('SET FOREIGN_KEY_CHECKS = 0');

        if (!$this->hasTable('tahun_ajaran')) {
            // Tabel master tahun_ajaran tanpa kolom id; primary key langsung di kolom tahun_ajaran
            $table = $this->table('tahun_ajaran', [
                'id' => false,
                'primary_key' => ['tahun_ajaran'],
            ]);

            $table
                ->addColumn('tahun_ajaran', 'string', ['limit' => 50, 'null' => false])
                ->addColumn('kategori', 'string', ['limit' => 20, 'null' => false, 'comment' => 'hijriyah / masehi'])
                ->addColumn('dari', 'integer', ['null' => true, 'comment' => 'Tahun awal (INT)'])
                ->addColumn('sampai', 'integer', ['null' => true, 'comment' => 'Tahun akhir (INT)'])
                ->create();

            // Seed awal tahun ajaran hijriyah 1445-1446 s.d 1448-1449
            $this->execute("
                INSERT INTO tahun_ajaran (tahun_ajaran, kategori, dari, sampai) VALUES
                ('1445-1446', 'hijriyah', 1445, 1446),
                ('1446-1447', 'hijriyah', 1446, 1447),
                ('1447-1448', 'hijriyah', 1447, 1448),
                ('1448-1449', 'hijriyah', 1448, 1449)
            ");

            // Seed awal tahun ajaran masehi 2024-2025 s.d 2027-2028
            $this->execute("
                INSERT INTO tahun_ajaran (tahun_ajaran, kategori, dari, sampai) VALUES
                ('2024-2025', 'masehi', 2024, 2025),
                ('2025-2026', 'masehi', 2025, 2026),
                ('2026-2027', 'masehi', 2026, 2027),
                ('2027-2028', 'masehi', 2027, 2028)
            ");
        }

        // Pastikan semua nilai tahun_ajaran yang sudah ada di lembaga___wali_kelas ikut dimasukkan
        if ($this->hasTable('lembaga___wali_kelas')) {
            // Tambahkan semua DISTINCT tahun_ajaran lama ke master (jika belum ada)
            // Otomatis isi kategori + dari + sampai jika formatnya ####-####
            $this->execute("
                INSERT IGNORE INTO tahun_ajaran (tahun_ajaran, kategori, dari, sampai)
                SELECT DISTINCT
                    ta AS tahun_ajaran,
                    CASE
                        WHEN ta REGEXP '^[0-9]{4}-[0-9]{4}$' AND LEFT(ta, 2) = '14' THEN 'hijriyah'
                        WHEN ta REGEXP '^[0-9]{4}-[0-9]{4}$' THEN 'masehi'
                        ELSE 'hijriyah'
                    END AS kategori,
                    CASE
                        WHEN ta REGEXP '^[0-9]{4}-[0-9]{4}$'
                            THEN CAST(SUBSTRING_INDEX(ta, '-', 1) AS UNSIGNED)
                        ELSE NULL
                    END AS dari,
                    CASE
                        WHEN ta REGEXP '^[0-9]{4}-[0-9]{4}$'
                            THEN CAST(SUBSTRING_INDEX(ta, '-', -1) AS UNSIGNED)
                        ELSE NULL
                    END AS sampai
                FROM (
                    SELECT DISTINCT TRIM(tahun_ajaran) AS ta
                    FROM lembaga___wali_kelas
                    WHERE tahun_ajaran IS NOT NULL AND TRIM(tahun_ajaran) != ''
                ) AS src
            ");

            // Tambah index di kolom tahun_ajaran lembaga___wali_kelas bila belum ada
            // (dibutuhkan untuk foreign key)
            $waliTable = $this->table('lembaga___wali_kelas');
            if (!$waliTable->hasIndex(['tahun_ajaran'])) {
                $waliTable->addIndex(['tahun_ajaran'])->save();
            }

            // Tambah FK dari lembaga___wali_kelas.tahun_ajaran ke tahun_ajaran.tahun_ajaran
            // Data lama tetap aman karena sudah di-INSERT IGNORE sebelumnya.
            $this->execute("
                ALTER TABLE lembaga___wali_kelas
                ADD CONSTRAINT fk_wali_kelas_tahun_ajaran
                FOREIGN KEY (tahun_ajaran) REFERENCES tahun_ajaran (tahun_ajaran)
                ON UPDATE CASCADE
                ON DELETE RESTRICT
            ");
        }

        $this->execute('SET FOREIGN_KEY_CHECKS = 1');
    }

    public function down(): void
    {
        $this->execute('SET FOREIGN_KEY_CHECKS = 0');

        if ($this->hasTable('lembaga___wali_kelas')) {
            // Hapus FK bila ada
            // Gunakan IF EXISTS agar aman walau constraint belum/tidak ada
            $this->execute("
                ALTER TABLE lembaga___wali_kelas
                DROP FOREIGN KEY fk_wali_kelas_tahun_ajaran
            ");
        }

        if ($this->hasTable('tahun_ajaran')) {
            $this->table('tahun_ajaran')->drop()->save();
        }

        $this->execute('SET FOREIGN_KEY_CHECKS = 1');
    }
}


<?php

declare(strict_types=1);

use Phinx\Migration\AbstractMigration;

/**
 * Backfill lttq_tingkatan dari kolom santri.lttq / kelas_lttq / kel_lttq, lalu hapus kolom lama.
 */
final class LttqMigrateSantriColumns extends AbstractMigration
{
    public function up(): void
    {
        if (!$this->hasTable('lttq_tingkatan') || !$this->hasTable('santri')) {
            return;
        }
        if (!$this->table('santri')->hasColumn('lttq')) {
            return;
        }

        $this->execute('SET FOREIGN_KEY_CHECKS = 0');

        $this->execute("
            INSERT IGNORE INTO lttq_tingkatan (lembaga_id, tingkatan, kelompok, keterangan, status)
            SELECT DISTINCT
                'LTTQ',
                COALESCE(TRIM(s.lttq), ''),
                TRIM(CONCAT(
                    COALESCE(TRIM(s.kelas_lttq), ''),
                    CASE
                        WHEN TRIM(COALESCE(s.kel_lttq, '')) != '' AND TRIM(COALESCE(s.kelas_lttq, '')) != ''
                            THEN CONCAT('-', TRIM(s.kel_lttq))
                        WHEN TRIM(COALESCE(s.kel_lttq, '')) != ''
                            THEN TRIM(s.kel_lttq)
                        ELSE ''
                    END
                )),
                NULL,
                'aktif'
            FROM santri s
            WHERE TRIM(COALESCE(s.lttq, '')) != ''
               OR TRIM(COALESCE(s.kelas_lttq, '')) != ''
               OR TRIM(COALESCE(s.kel_lttq, '')) != ''
        ");

        if ($this->table('santri')->hasColumn('id_lttq_tingkatan')) {
            $this->execute("
                UPDATE santri s
                INNER JOIN lttq_tingkatan t ON t.lembaga_id = 'LTTQ'
                    AND COALESCE(TRIM(t.tingkatan), '') = COALESCE(TRIM(s.lttq), '')
                    AND COALESCE(TRIM(t.kelompok), '') = TRIM(CONCAT(
                        COALESCE(TRIM(s.kelas_lttq), ''),
                        CASE
                            WHEN TRIM(COALESCE(s.kel_lttq, '')) != '' AND TRIM(COALESCE(s.kelas_lttq, '')) != ''
                                THEN CONCAT('-', TRIM(s.kel_lttq))
                            WHEN TRIM(COALESCE(s.kel_lttq, '')) != ''
                                THEN TRIM(s.kel_lttq)
                            ELSE ''
                        END
                    ))
                SET s.id_lttq_tingkatan = t.id
                WHERE TRIM(COALESCE(s.lttq, '')) != ''
                   OR TRIM(COALESCE(s.kelas_lttq, '')) != ''
                   OR TRIM(COALESCE(s.kel_lttq, '')) != ''
            ");
        }

        if ($this->hasTable('santri___lttq') && $this->hasTable('tahun_ajaran')) {
            $this->execute("
                INSERT IGNORE INTO santri___lttq (id_lttq_tingkatan, id_santri, nim, tahun_ajaran, id_pengurus, tanggal_dibuat)
                SELECT
                    s.id_lttq_tingkatan,
                    s.id,
                    s.nis,
                    (
                        SELECT ta.tahun_ajaran FROM tahun_ajaran ta
                        WHERE ta.kategori = 'hijriyah'
                        ORDER BY ta.dari DESC, ta.tahun_ajaran DESC
                        LIMIT 1
                    ),
                    COALESCE((SELECT MIN(p.id) FROM pengurus p LIMIT 1), 1),
                    CURRENT_TIMESTAMP
                FROM santri s
                WHERE s.id_lttq_tingkatan IS NOT NULL
                  AND EXISTS (
                    SELECT 1 FROM tahun_ajaran ta2 WHERE ta2.kategori = 'hijriyah' LIMIT 1
                  )
            ");
        }

        if ($this->table('santri')->hasColumn('lttq')) {
            $this->table('santri')->removeColumn('lttq')->update();
        }
        if ($this->table('santri')->hasColumn('kelas_lttq')) {
            $this->table('santri')->removeColumn('kelas_lttq')->update();
        }
        if ($this->table('santri')->hasColumn('kel_lttq')) {
            $this->table('santri')->removeColumn('kel_lttq')->update();
        }

        $this->execute('SET FOREIGN_KEY_CHECKS = 1');
    }

    public function down(): void
    {
        if (!$this->hasTable('santri')) {
            return;
        }
        $this->execute('SET FOREIGN_KEY_CHECKS = 0');
        if (!$this->table('santri')->hasColumn('lttq')) {
            $this->table('santri')->addColumn('lttq', 'string', ['limit' => 50, 'null' => true])->update();
        }
        if (!$this->table('santri')->hasColumn('kelas_lttq')) {
            $this->table('santri')->addColumn('kelas_lttq', 'string', ['limit' => 50, 'null' => true])->update();
        }
        if (!$this->table('santri')->hasColumn('kel_lttq')) {
            $this->table('santri')->addColumn('kel_lttq', 'string', ['limit' => 50, 'null' => true])->update();
        }
        if ($this->hasTable('lttq_tingkatan')) {
            $this->execute("
                UPDATE santri s
                INNER JOIN lttq_tingkatan t ON t.id = s.id_lttq_tingkatan
                SET s.lttq = NULLIF(TRIM(t.tingkatan), ''),
                    s.kelas_lttq = CASE
                        WHEN TRIM(t.kelompok) LIKE '%-%' THEN SUBSTRING_INDEX(TRIM(t.kelompok), '-', 1)
                        ELSE TRIM(t.kelompok)
                    END,
                    s.kel_lttq = CASE
                        WHEN TRIM(t.kelompok) LIKE '%-%' THEN SUBSTRING_INDEX(TRIM(t.kelompok), '-', -1)
                        ELSE ''
                    END
            ");
        }
        $this->execute('SET FOREIGN_KEY_CHECKS = 1');
    }
}

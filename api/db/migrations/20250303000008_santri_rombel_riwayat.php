<?php

declare(strict_types=1);

use Phinx\Migration\AbstractMigration;

/**
 * Tabel santri___rombel: riwayat rombel santri.
 * Kolom: id_rombel (FK lembaga___rombel), id_santri (FK santri), nim, tahun_ajaran (FK tahun_ajaran), tanggal_dibuat.
 * Isi dari riwayat___diniyah dan riwayat___formal: jika kombinasi (diniyah/formal, kelas, kel) belum ada di lembaga___rombel
 * maka tambahkan (hanya jika lembaga valid); tahun_ajaran harus ada di master tahun_ajaran.
 */
final class SantriRombelRiwayat extends AbstractMigration
{
    public function up(): void
    {
        $this->execute('SET FOREIGN_KEY_CHECKS = 0');

        if (!$this->hasTable('lembaga___rombel') || !$this->hasTable('santri') || !$this->hasTable('tahun_ajaran')) {
            $this->execute('SET FOREIGN_KEY_CHECKS = 1');
            return;
        }

        $conn = $this->getAdapter()->getConnection();

        // 1) Buat tabel santri___rombel (charset utf8mb4 agar FK ke tahun_ajaran cocok)
        if (!$this->hasTable('santri___rombel')) {
            $this->table('santri___rombel', ['id' => true])
                ->addColumn('id_rombel', 'integer', ['signed' => true, 'null' => false])
                ->addColumn('id_santri', 'integer', ['signed' => true, 'null' => false])
                ->addColumn('nim', 'string', ['limit' => 50, 'null' => true])
                ->addColumn('tahun_ajaran', 'string', ['limit' => 50, 'null' => false])
                ->addColumn('tanggal_dibuat', 'timestamp', ['null' => true, 'default' => 'CURRENT_TIMESTAMP'])
                ->addIndex(['id_rombel'])
                ->addIndex(['id_santri'])
                ->addIndex(['tahun_ajaran'])
                ->addIndex(['id_santri', 'id_rombel', 'tahun_ajaran'], ['unique' => true])
                ->create();
            $this->execute('ALTER TABLE santri___rombel CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci');
            $this->execute('ALTER TABLE santri___rombel MODIFY tahun_ajaran VARCHAR(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL');
            $this->execute('ALTER TABLE santri___rombel ADD CONSTRAINT fk_santri_rombel_id_rombel FOREIGN KEY (id_rombel) REFERENCES lembaga___rombel (id) ON DELETE CASCADE ON UPDATE CASCADE');
            $this->execute('ALTER TABLE santri___rombel ADD CONSTRAINT fk_santri_rombel_id_santri FOREIGN KEY (id_santri) REFERENCES santri (id) ON DELETE CASCADE ON UPDATE CASCADE');
            $this->execute('ALTER TABLE santri___rombel ADD CONSTRAINT fk_santri_rombel_tahun_ajaran FOREIGN KEY (tahun_ajaran) REFERENCES tahun_ajaran (tahun_ajaran) ON DELETE RESTRICT ON UPDATE CASCADE');
        }

        // 2) Sinkron tahun_ajaran dari riwayat ke master (agar FK bisa dipenuhi)
        foreach (['riwayat___diniyah', 'riwayat___formal'] as $tbl) {
            if (!$this->hasTable($tbl)) {
                continue;
            }
            $col = $tbl === 'riwayat___diniyah' ? 'tahun_ajaran' : 'tahun_ajaran';
            $kategori = $tbl === 'riwayat___diniyah' ? 'hijriyah' : 'masehi';
            $this->execute("
                INSERT IGNORE INTO tahun_ajaran (tahun_ajaran, kategori, dari, sampai)
                SELECT DISTINCT TRIM(r.{$col}), '{$kategori}', NULL, NULL
                FROM {$tbl} r
                WHERE r.{$col} IS NOT NULL AND TRIM(r.{$col}) != ''
            ");
        }

        // 3) Dari riwayat___diniyah: pastikan rombel ada (diniyah = lembaga_id), lalu isi santri___rombel
        if ($this->hasTable('riwayat___diniyah') && $this->hasTable('lembaga')) {
            $this->execute("
                INSERT IGNORE INTO lembaga___rombel (lembaga_id, kelas, kel, keterangan, status)
                SELECT DISTINCT
                    TRIM(rd.diniyah),
                    COALESCE(TRIM(rd.kelas_diniyah), ''),
                    COALESCE(TRIM(rd.kel_diniyah), ''),
                    TRIM(rd.diniyah),
                    'aktif'
                FROM riwayat___diniyah rd
                INNER JOIN lembaga l ON l.id = TRIM(rd.diniyah)
                WHERE rd.diniyah IS NOT NULL AND TRIM(rd.diniyah) != ''
                AND NOT EXISTS (
                    SELECT 1 FROM lembaga___rombel r
                    WHERE r.lembaga_id = TRIM(rd.diniyah)
                    AND COALESCE(TRIM(r.kelas), '') = COALESCE(TRIM(rd.kelas_diniyah), '')
                    AND COALESCE(TRIM(r.kel), '') = COALESCE(TRIM(rd.kel_diniyah), '')
                )
            ");

            $this->execute("
                INSERT IGNORE INTO santri___rombel (id_rombel, id_santri, nim, tahun_ajaran, tanggal_dibuat)
                SELECT
                    r.id,
                    rd.id_santri,
                    rd.nim_diniyah,
                    TRIM(rd.tahun_ajaran),
                    rd.tanggal_dibuat
                FROM riwayat___diniyah rd
                INNER JOIN lembaga l ON l.id = TRIM(rd.diniyah)
                INNER JOIN lembaga___rombel r ON r.lembaga_id = TRIM(rd.diniyah)
                    AND COALESCE(TRIM(r.kelas), '') = COALESCE(TRIM(rd.kelas_diniyah), '')
                    AND COALESCE(TRIM(r.kel), '') = COALESCE(TRIM(rd.kel_diniyah), '')
                INNER JOIN tahun_ajaran ta ON ta.tahun_ajaran = TRIM(rd.tahun_ajaran)
                WHERE rd.diniyah IS NOT NULL AND TRIM(rd.diniyah) != ''
                AND rd.tahun_ajaran IS NOT NULL AND TRIM(rd.tahun_ajaran) != ''
            ");
        }

        // 4) Dari riwayat___formal: pastikan rombel ada (formal = lembaga_id), lalu isi santri___rombel
        if ($this->hasTable('riwayat___formal') && $this->hasTable('lembaga')) {
            $this->execute("
                INSERT IGNORE INTO lembaga___rombel (lembaga_id, kelas, kel, keterangan, status)
                SELECT DISTINCT
                    TRIM(rf.formal),
                    COALESCE(TRIM(rf.kelas_formal), ''),
                    COALESCE(TRIM(rf.kel_formal), ''),
                    TRIM(rf.formal),
                    'aktif'
                FROM riwayat___formal rf
                INNER JOIN lembaga l ON l.id = TRIM(rf.formal)
                WHERE rf.formal IS NOT NULL AND TRIM(rf.formal) != ''
                AND NOT EXISTS (
                    SELECT 1 FROM lembaga___rombel r
                    WHERE r.lembaga_id = TRIM(rf.formal)
                    AND COALESCE(TRIM(r.kelas), '') = COALESCE(TRIM(rf.kelas_formal), '')
                    AND COALESCE(TRIM(r.kel), '') = COALESCE(TRIM(rf.kel_formal), '')
                )
            ");

            $this->execute("
                INSERT IGNORE INTO santri___rombel (id_rombel, id_santri, nim, tahun_ajaran, tanggal_dibuat)
                SELECT
                    r.id,
                    rf.id_santri,
                    rf.nim_formal,
                    TRIM(rf.tahun_ajaran),
                    rf.tanggal_dibuat
                FROM riwayat___formal rf
                INNER JOIN lembaga l ON l.id = TRIM(rf.formal)
                INNER JOIN lembaga___rombel r ON r.lembaga_id = TRIM(rf.formal)
                    AND COALESCE(TRIM(r.kelas), '') = COALESCE(TRIM(rf.kelas_formal), '')
                    AND COALESCE(TRIM(r.kel), '') = COALESCE(TRIM(rf.kel_formal), '')
                INNER JOIN tahun_ajaran ta ON ta.tahun_ajaran = TRIM(rf.tahun_ajaran)
                WHERE rf.formal IS NOT NULL AND TRIM(rf.formal) != ''
                AND rf.tahun_ajaran IS NOT NULL AND TRIM(rf.tahun_ajaran) != ''
            ");
        }

        $this->execute('SET FOREIGN_KEY_CHECKS = 1');
    }

    public function down(): void
    {
        $this->execute('SET FOREIGN_KEY_CHECKS = 0');
        if ($this->hasTable('santri___rombel')) {
            $this->table('santri___rombel')->drop()->save();
        }
        $this->execute('SET FOREIGN_KEY_CHECKS = 1');
    }
}

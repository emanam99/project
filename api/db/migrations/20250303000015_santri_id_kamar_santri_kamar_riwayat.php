<?php

declare(strict_types=1);

use Phinx\Migration\AbstractMigration;

/**
 * - Tambah kolom id_kamar di santri (FK daerah___kamar) = kamar aktif.
 * - Buat tabel santri___kamar (riwayat kamar), pola sama dengan santri___rombel:
 *   id_kamar, id_santri, tahun_ajaran, id_pengurus, status_santri, kategori, tanggal_dibuat.
 * - Isi santri.id_kamar dari santri.daerah + santri.kamar + santri.kategori (match daerah___kamar).
 * - Isi santri___kamar dari riwayat___domisili (jika ada), lalu hapus tabel riwayat___domisili.
 */
final class SantriIdKamarSantriKamarRiwayat extends AbstractMigration
{
    public function up(): void
    {
        $this->execute('SET FOREIGN_KEY_CHECKS = 0');
        $conn = $this->getAdapter()->getConnection();

        if (!$this->hasTable('santri') || !$this->hasTable('daerah___kamar') || !$this->hasTable('daerah')) {
            $this->execute('SET FOREIGN_KEY_CHECKS = 1');
            return;
        }

        // 1) Tambah id_kamar di santri (FK ke daerah___kamar)
        $santriTable = $this->table('santri');
        if (!$santriTable->hasColumn('id_kamar')) {
            $this->table('santri')
                ->addColumn('id_kamar', 'integer', ['signed' => true, 'null' => true])
                ->addIndex(['id_kamar'])
                ->update();
            $stmt = $conn->query("
                SELECT 1 FROM information_schema.TABLE_CONSTRAINTS
                WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'santri' AND CONSTRAINT_NAME = 'fk_santri_id_kamar'
            ");
            if ($stmt->fetch(\PDO::FETCH_ASSOC) === false) {
                $this->execute('ALTER TABLE santri ADD CONSTRAINT fk_santri_id_kamar FOREIGN KEY (id_kamar) REFERENCES daerah___kamar (id) ON DELETE SET NULL ON UPDATE CASCADE');
            }
        }

        // 2) Isi santri.id_kamar dari kolom daerah, kamar, kategori (match ke daerah + daerah___kamar)
        if ($this->table('santri')->hasColumn('daerah') && $this->table('santri')->hasColumn('kamar') && $this->table('santri')->hasColumn('kategori')) {
            $conn->exec("
                UPDATE santri s
                INNER JOIN daerah d ON d.kategori = TRIM(s.kategori) AND d.daerah = TRIM(s.daerah)
                INNER JOIN daerah___kamar dk ON dk.id_daerah = d.id AND dk.kamar = TRIM(s.kamar)
                SET s.id_kamar = dk.id
                WHERE s.daerah IS NOT NULL AND TRIM(s.daerah) <> ''
                  AND s.kamar IS NOT NULL AND TRIM(s.kamar) <> ''
                  AND s.kategori IS NOT NULL AND TRIM(s.kategori) <> ''
            ");
        }

        // 3) Buat tabel santri___kamar (riwayat kamar), pola seperti santri___rombel + status_santri, kategori
        if (!$this->hasTable('santri___kamar')) {
            $this->table('santri___kamar', ['id' => true])
                ->addColumn('id_kamar', 'integer', ['signed' => true, 'null' => false])
                ->addColumn('id_santri', 'integer', ['signed' => true, 'null' => false])
                ->addColumn('tahun_ajaran', 'string', ['limit' => 50, 'null' => false])
                ->addColumn('id_pengurus', 'integer', ['signed' => true, 'null' => false])
                ->addColumn('status_santri', 'string', ['limit' => 50, 'null' => true])
                ->addColumn('kategori', 'string', ['limit' => 50, 'null' => true])
                ->addColumn('tanggal_dibuat', 'timestamp', ['null' => true, 'default' => 'CURRENT_TIMESTAMP'])
                ->addIndex(['id_kamar'])
                ->addIndex(['id_santri'])
                ->addIndex(['tahun_ajaran'])
                ->addIndex(['id_pengurus'])
                ->addIndex(['id_santri', 'id_kamar', 'tahun_ajaran'], ['unique' => true, 'name' => 'uq_santri_kamar_santri_kamar_ta'])
                ->create();
            $this->execute('ALTER TABLE santri___kamar CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci');
            $this->execute('ALTER TABLE santri___kamar MODIFY tahun_ajaran VARCHAR(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL');
            $this->execute('ALTER TABLE santri___kamar ADD CONSTRAINT fk_santri_kamar_id_kamar FOREIGN KEY (id_kamar) REFERENCES daerah___kamar (id) ON DELETE CASCADE ON UPDATE CASCADE');
            $this->execute('ALTER TABLE santri___kamar ADD CONSTRAINT fk_santri_kamar_id_santri FOREIGN KEY (id_santri) REFERENCES santri (id) ON DELETE CASCADE ON UPDATE CASCADE');
            $this->execute('ALTER TABLE santri___kamar ADD CONSTRAINT fk_santri_kamar_tahun_ajaran FOREIGN KEY (tahun_ajaran) REFERENCES tahun_ajaran (tahun_ajaran) ON DELETE RESTRICT ON UPDATE CASCADE');
            $this->execute('ALTER TABLE santri___kamar ADD CONSTRAINT fk_santri_kamar_id_pengurus FOREIGN KEY (id_pengurus) REFERENCES pengurus (id) ON DELETE RESTRICT ON UPDATE CASCADE');
        }

        // 4) Sinkron tahun_ajaran dari riwayat___domisili ke master (jika tabel ada dan punya kolom tahun_ajaran)
        if ($this->hasTable('riwayat___domisili') && $this->hasTable('tahun_ajaran')) {
            $cols = $this->getColumnNames($conn, 'riwayat___domisili');
            if (in_array('tahun_ajaran', $cols, true)) {
                $conn->exec("
                    INSERT IGNORE INTO tahun_ajaran (tahun_ajaran, kategori, dari, sampai)
                    SELECT DISTINCT TRIM(rd.tahun_ajaran), 'hijriyah', NULL, NULL
                    FROM riwayat___domisili rd
                    WHERE rd.tahun_ajaran IS NOT NULL AND TRIM(rd.tahun_ajaran) <> ''
                ");
            }
        }

        // 5) Isi santri___kamar dari riwayat___domisili (id_santri, daerah, kamar -> id_kamar; status_santri, kategori dari santri)
        if ($this->hasTable('riwayat___domisili')) {
            $cols = $this->getColumnNames($conn, 'riwayat___domisili');
            $hasIdSantri = in_array('id_santri', $cols, true);
            $hasDaerah = in_array('daerah', $cols, true);
            $hasKamar = in_array('kamar', $cols, true);
            $hasTahunAjaran = in_array('tahun_ajaran', $cols, true);
            $hasTanggalDibuat = in_array('tanggal_dibuat', $cols, true);

            if ($hasIdSantri && $hasDaerah && $hasKamar) {
                $tahunCol = $hasTahunAjaran ? "COALESCE(NULLIF(TRIM(rd.tahun_ajaran), ''), '1445-1446')" : "'1445-1446'";
                $tanggalCol = $hasTanggalDibuat ? 'COALESCE(rd.tanggal_dibuat, CURRENT_TIMESTAMP)' : 'CURRENT_TIMESTAMP';
                $conn->exec("
                    INSERT IGNORE INTO santri___kamar (id_kamar, id_santri, tahun_ajaran, id_pengurus, status_santri, kategori, tanggal_dibuat)
                    SELECT dk.id, rd.id_santri, {$tahunCol}, 1,
                           COALESCE(TRIM(s.status_santri), ''),
                           COALESCE(TRIM(s.kategori), ''),
                           {$tanggalCol}
                    FROM riwayat___domisili rd
                    INNER JOIN santri s ON s.id = rd.id_santri
                    INNER JOIN daerah d ON d.kategori = TRIM(s.kategori) AND d.daerah = TRIM(rd.daerah)
                    INNER JOIN daerah___kamar dk ON dk.id_daerah = d.id AND dk.kamar = TRIM(rd.kamar)
                    WHERE rd.daerah IS NOT NULL AND TRIM(rd.daerah) <> ''
                      AND rd.kamar IS NOT NULL AND TRIM(rd.kamar) <> ''
                ");
            }

            // 6) Hapus tabel riwayat___domisili
            $this->table('riwayat___domisili')->drop()->save();
        }

        $this->execute('SET FOREIGN_KEY_CHECKS = 1');
    }

    private function getColumnNames(\PDO $conn, string $table): array
    {
        $stmt = $conn->prepare("
            SELECT COLUMN_NAME FROM information_schema.COLUMNS
            WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?
            ORDER BY ORDINAL_POSITION
        ");
        $stmt->execute([$table]);
        return $stmt->fetchAll(\PDO::FETCH_COLUMN);
    }

    public function down(): void
    {
        $this->execute('SET FOREIGN_KEY_CHECKS = 0');

        if ($this->hasTable('santri___kamar')) {
            $this->table('santri___kamar')->drop()->save();
        }

        if ($this->hasTable('santri')) {
            $santriTable = $this->table('santri');
            if ($santriTable->hasColumn('id_kamar')) {
                try {
                    $this->execute('ALTER TABLE santri DROP FOREIGN KEY fk_santri_id_kamar');
                } catch (\Throwable $e) {}
                try {
                    $this->execute('ALTER TABLE santri DROP COLUMN id_kamar');
                } catch (\Throwable $e) {}
            }
        }

        $this->execute('SET FOREIGN_KEY_CHECKS = 1');
    }
}

<?php

declare(strict_types=1);

use Phinx\Migration\AbstractMigration;

/**
 * 1) Tambah kolom id_diniyah dan id_formal di santri (FK ke lembaga___rombel.id).
 * 2) Isi lembaga___rombel dari kombinasi unik santri: diniyah=lembaga_id (hanya jika diniyah = id lembaga), formal=lembaga_id (hanya jika formal = id lembaga). Lewati jika null/tidak sesuai.
 * 3) Isi santri.id_diniyah dan santri.id_formal dari rombel yang sudah ada.
 */
final class SantriIdDiniyahIdFormalRombel extends AbstractMigration
{
    public function up(): void
    {
        $this->execute('SET FOREIGN_KEY_CHECKS = 0');

        if (!$this->hasTable('santri') || !$this->hasTable('lembaga___rombel') || !$this->hasTable('lembaga')) {
            $this->execute('SET FOREIGN_KEY_CHECKS = 1');
            return;
        }

        $adapter = $this->getAdapter();
        $conn = $adapter->getConnection();

        // 1) Tambah kolom id_diniyah, id_formal di santri
        $santriTable = $this->table('santri');
        if (!$santriTable->hasColumn('id_diniyah')) {
            $this->table('santri')
                ->addColumn('id_diniyah', 'integer', ['signed' => true, 'null' => true, 'default' => null])
                ->addIndex(['id_diniyah'])
                ->update();
        }
        if (!$santriTable->hasColumn('id_formal')) {
            $this->table('santri')
                ->addColumn('id_formal', 'integer', ['signed' => true, 'null' => true, 'default' => null])
                ->addIndex(['id_formal'])
                ->update();
        }

        // 2a) Insert lembaga___rombel dari kombinasi unik (diniyah, kelas_diniyah, kel_diniyah) — hanya jika diniyah = id lembaga
        $sqlDiniyah = "
            INSERT INTO lembaga___rombel (lembaga_id, kelas, kel, keterangan, status)
            SELECT DISTINCT
                TRIM(s.diniyah),
                COALESCE(TRIM(s.kelas_diniyah), ''),
                COALESCE(TRIM(s.kel_diniyah), ''),
                TRIM(s.diniyah),
                'aktif'
            FROM santri s
            INNER JOIN lembaga l ON l.id = TRIM(s.diniyah)
            WHERE s.diniyah IS NOT NULL AND TRIM(s.diniyah) != ''
            AND NOT EXISTS (
                SELECT 1 FROM lembaga___rombel r
                WHERE r.lembaga_id = TRIM(s.diniyah)
                AND COALESCE(TRIM(r.kelas), '') = COALESCE(TRIM(s.kelas_diniyah), '')
                AND COALESCE(TRIM(r.kel), '') = COALESCE(TRIM(s.kel_diniyah), '')
            )
        ";
        try {
            $this->execute($sqlDiniyah);
        } catch (\Throwable $e) {
            // Abaikan jika duplikat atau constraint
        }

        // 2b) Insert lembaga___rombel dari kombinasi unik (formal, kelas_formal, kel_formal) — hanya jika formal = id lembaga
        $sqlFormal = "
            INSERT INTO lembaga___rombel (lembaga_id, kelas, kel, keterangan, status)
            SELECT DISTINCT
                TRIM(s.formal),
                COALESCE(TRIM(s.kelas_formal), ''),
                COALESCE(TRIM(s.kel_formal), ''),
                TRIM(s.formal),
                'aktif'
            FROM santri s
            INNER JOIN lembaga l ON l.id = TRIM(s.formal)
            WHERE s.formal IS NOT NULL AND TRIM(s.formal) != ''
            AND NOT EXISTS (
                SELECT 1 FROM lembaga___rombel r
                WHERE r.lembaga_id = TRIM(s.formal)
                AND COALESCE(TRIM(r.kelas), '') = COALESCE(TRIM(s.kelas_formal), '')
                AND COALESCE(TRIM(r.kel), '') = COALESCE(TRIM(s.kel_formal), '')
            )
        ";
        try {
            $this->execute($sqlFormal);
        } catch (\Throwable $e) {
            // Abaikan jika duplikat atau constraint
        }

        // 3) Update santri.id_diniyah dari lembaga___rombel (diniyah = lembaga_id, kelas_diniyah = kelas, kel_diniyah = kel)
        $stmt = $conn->prepare("
            UPDATE santri s
            INNER JOIN lembaga l ON l.id = TRIM(s.diniyah)
            INNER JOIN lembaga___rombel r ON r.lembaga_id = TRIM(s.diniyah)
                AND COALESCE(TRIM(r.kelas), '') = COALESCE(TRIM(s.kelas_diniyah), '')
                AND COALESCE(TRIM(r.kel), '') = COALESCE(TRIM(s.kel_diniyah), '')
            SET s.id_diniyah = r.id
            WHERE s.diniyah IS NOT NULL AND TRIM(s.diniyah) != ''
        ");
        $stmt->execute();

        // 4) Update santri.id_formal dari lembaga___rombel (formal = lembaga_id, kelas_formal = kelas, kel_formal = kel)
        $stmt = $conn->prepare("
            UPDATE santri s
            INNER JOIN lembaga l ON l.id = TRIM(s.formal)
            INNER JOIN lembaga___rombel r ON r.lembaga_id = TRIM(s.formal)
                AND COALESCE(TRIM(r.kelas), '') = COALESCE(TRIM(s.kelas_formal), '')
                AND COALESCE(TRIM(r.kel), '') = COALESCE(TRIM(s.kel_formal), '')
            SET s.id_formal = r.id
            WHERE s.formal IS NOT NULL AND TRIM(s.formal) != ''
        ");
        $stmt->execute();

        // 5) Tambah FK id_diniyah -> lembaga___rombel.id
        $stmt = $conn->prepare("
            SELECT 1 FROM information_schema.TABLE_CONSTRAINTS
            WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'santri' AND CONSTRAINT_NAME = 'fk_santri_id_diniyah'
        ");
        $stmt->execute();
        if ($stmt->fetch(\PDO::FETCH_ASSOC) === false) {
            $this->execute("
                ALTER TABLE santri
                ADD CONSTRAINT fk_santri_id_diniyah
                FOREIGN KEY (id_diniyah) REFERENCES lembaga___rombel (id) ON DELETE SET NULL ON UPDATE CASCADE
            ");
        }

        // 6) Tambah FK id_formal -> lembaga___rombel.id
        $stmt = $conn->prepare("
            SELECT 1 FROM information_schema.TABLE_CONSTRAINTS
            WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'santri' AND CONSTRAINT_NAME = 'fk_santri_id_formal'
        ");
        $stmt->execute();
        if ($stmt->fetch(\PDO::FETCH_ASSOC) === false) {
            $this->execute("
                ALTER TABLE santri
                ADD CONSTRAINT fk_santri_id_formal
                FOREIGN KEY (id_formal) REFERENCES lembaga___rombel (id) ON DELETE SET NULL ON UPDATE CASCADE
            ");
        }

        $this->execute('SET FOREIGN_KEY_CHECKS = 1');
    }

    public function down(): void
    {
        $this->execute('SET FOREIGN_KEY_CHECKS = 0');

        if ($this->hasTable('santri')) {
            try {
                $this->execute('ALTER TABLE santri DROP FOREIGN KEY fk_santri_id_diniyah');
            } catch (\Throwable $e) {}
            try {
                $this->execute('ALTER TABLE santri DROP FOREIGN KEY fk_santri_id_formal');
            } catch (\Throwable $e) {}
            $santriTable = $this->table('santri');
            if ($santriTable->hasColumn('id_diniyah')) {
                $this->table('santri')->removeColumn('id_diniyah')->update();
            }
            if ($santriTable->hasColumn('id_formal')) {
                $this->table('santri')->removeColumn('id_formal')->update();
            }
        }

        $this->execute('SET FOREIGN_KEY_CHECKS = 1');
    }
}

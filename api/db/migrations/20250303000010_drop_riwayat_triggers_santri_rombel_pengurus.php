<?php

declare(strict_types=1);

use Phinx\Migration\AbstractMigration;

/**
 * - Hapus trigger santri: trg_riwayat_diniyah_after_update, trg_riwayat_domisili_after_update, trg_riwayat_formal_after_update.
 * - Hapus tabel riwayat___diniyah dan riwayat___formal.
 * - Hapus kolom santri: diniyah, kelas_diniyah, kel_diniyah, formal, kelas_formal, kel_formal (sudah diganti id_diniyah, id_formal).
 * - Tambah kolom id_pengurus di santri___rombel (NOT NULL, FK pengurus); data lama diisi 1 (super admin).
 */
final class DropRiwayatTriggersSantriRombelPengurus extends AbstractMigration
{
    public function up(): void
    {
        $this->execute('SET FOREIGN_KEY_CHECKS = 0');

        $triggers = [
            'trg_riwayat_diniyah_after_update',
            'trg_riwayat_domisili_after_update',
            'trg_riwayat_formal_after_update',
        ];
        foreach ($triggers as $name) {
            try {
                $this->execute(sprintf('DROP TRIGGER IF EXISTS `%s`', $name));
            } catch (\Throwable $e) {
                // Abaikan jika trigger tidak ada
            }
        }

        foreach (['riwayat___diniyah', 'riwayat___formal'] as $tbl) {
            if ($this->hasTable($tbl)) {
                $this->table($tbl)->drop()->save();
            }
        }

        if ($this->hasTable('santri')) {
            $conn = $this->getAdapter()->getConnection();
            $cols = ['diniyah', 'kelas_diniyah', 'kel_diniyah', 'formal', 'kelas_formal', 'kel_formal'];
            foreach ($cols as $col) {
                if ($this->table('santri')->hasColumn($col)) {
                    try {
                        $this->execute("ALTER TABLE santri DROP COLUMN `{$col}`");
                    } catch (\Throwable $e) {
                        // Abaikan jika kolom tidak ada
                    }
                }
            }
        }

        if ($this->hasTable('santri___rombel') && $this->hasTable('pengurus')) {
            if (!$this->table('santri___rombel')->hasColumn('id_pengurus')) {
                $this->table('santri___rombel')
                    ->addColumn('id_pengurus', 'integer', ['signed' => true, 'null' => true])
                    ->addIndex(['id_pengurus'])
                    ->update();
                $this->execute('UPDATE santri___rombel SET id_pengurus = 1 WHERE id_pengurus IS NULL');
                $this->execute('ALTER TABLE santri___rombel MODIFY COLUMN id_pengurus INT(11) NOT NULL');
                $stmt = $this->getAdapter()->getConnection()->prepare("
                    SELECT 1 FROM information_schema.TABLE_CONSTRAINTS
                    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'santri___rombel' AND CONSTRAINT_NAME = 'fk_santri_rombel_id_pengurus'
                ");
                $stmt->execute();
                if ($stmt->fetch(\PDO::FETCH_ASSOC) === false) {
                    $this->execute('ALTER TABLE santri___rombel ADD CONSTRAINT fk_santri_rombel_id_pengurus FOREIGN KEY (id_pengurus) REFERENCES pengurus (id) ON DELETE RESTRICT ON UPDATE CASCADE');
                }
            }
        }

        $this->execute('SET FOREIGN_KEY_CHECKS = 1');
    }

    public function down(): void
    {
        $this->execute('SET FOREIGN_KEY_CHECKS = 0');

        if ($this->hasTable('santri___rombel')) {
            try {
                $this->execute('ALTER TABLE santri___rombel DROP FOREIGN KEY fk_santri_rombel_id_pengurus');
            } catch (\Throwable $e) {}
            if ($this->table('santri___rombel')->hasColumn('id_pengurus')) {
                $this->execute('ALTER TABLE santri___rombel DROP COLUMN id_pengurus');
            }
        }

        // Restore kolom santri (tipe asal dari migrasi 003)
        if ($this->hasTable('santri')) {
            $add = [
                'diniyah' => "ADD COLUMN diniyah VARCHAR(255) NULL DEFAULT NULL",
                'kelas_diniyah' => "ADD COLUMN kelas_diniyah VARCHAR(255) NULL DEFAULT NULL",
                'kel_diniyah' => "ADD COLUMN kel_diniyah VARCHAR(255) NULL DEFAULT NULL",
                'formal' => "ADD COLUMN formal VARCHAR(255) NULL DEFAULT NULL",
                'kelas_formal' => "ADD COLUMN kelas_formal VARCHAR(50) NULL DEFAULT NULL",
                'kel_formal' => "ADD COLUMN kel_formal VARCHAR(50) NULL DEFAULT NULL",
            ];
            foreach ($add as $col => $def) {
                if (!$this->table('santri')->hasColumn($col)) {
                    try {
                        $this->execute("ALTER TABLE santri {$def}");
                    } catch (\Throwable $e) {}
                }
            }
        }

        // Tabel riwayat dan trigger tidak di-restore di down (harus manual bila perlu)
        $this->execute('SET FOREIGN_KEY_CHECKS = 1');
    }
}

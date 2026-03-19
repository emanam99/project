<?php

declare(strict_types=1);

use Phinx\Migration\AbstractMigration;

/**
 * Tabel lembaga___rombel (kelas per lembaga) dan lembaga___wali_kelas
 * (wali kelas + struktur kelas: ketua, wakil, sekretaris, bendahara).
 * Data tidak dihapus; riwayat disimpan via status aktif/nonaktif.
 */
final class LembagaRombelWaliKelas extends AbstractMigration
{
    public function up(): void
    {
        $this->execute('SET FOREIGN_KEY_CHECKS = 0');

        if (!$this->hasTable('lembaga___rombel')) {
            $this->table('lembaga___rombel', ['id' => true])
                ->addColumn('lembaga_id', 'string', ['limit' => 50, 'null' => false])
                ->addColumn('kelas', 'string', ['limit' => 100, 'null' => true])
                ->addColumn('kel', 'string', ['limit' => 50, 'null' => true])
                ->addColumn('keterangan', 'text', ['null' => true])
                ->addColumn('status', 'string', ['limit' => 20, 'default' => 'aktif'])
                ->addColumn('tanggal_dibuat', 'timestamp', ['null' => true, 'default' => 'CURRENT_TIMESTAMP'])
                ->addIndex(['lembaga_id'])
                ->addIndex(['status'])
                ->create();
            $this->execute('ALTER TABLE lembaga___rombel CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci');
            $this->execute('ALTER TABLE lembaga___rombel ADD CONSTRAINT fk_rombel_lembaga FOREIGN KEY (lembaga_id) REFERENCES lembaga (id) ON DELETE CASCADE ON UPDATE CASCADE');
        }

        if (!$this->hasTable('lembaga___wali_kelas')) {
            $this->table('lembaga___wali_kelas', ['id' => true])
                ->addColumn('id_kelas', 'integer', ['signed' => true, 'null' => false])
                ->addColumn('id_pengurus', 'integer', ['signed' => true, 'null' => true])
                ->addColumn('id_ketua', 'integer', ['signed' => true, 'null' => true])
                ->addColumn('id_wakil', 'integer', ['signed' => true, 'null' => true])
                ->addColumn('id_sekretaris', 'integer', ['signed' => true, 'null' => true])
                ->addColumn('id_bendahara', 'integer', ['signed' => true, 'null' => true])
                ->addColumn('tahun_ajaran', 'string', ['limit' => 50, 'null' => true])
                ->addColumn('gedung', 'string', ['limit' => 100, 'null' => true])
                ->addColumn('ruang', 'string', ['limit' => 100, 'null' => true])
                ->addColumn('status', 'string', ['limit' => 20, 'default' => 'aktif'])
                ->addColumn('tanggal_dibuat', 'timestamp', ['null' => true, 'default' => 'CURRENT_TIMESTAMP'])
                ->addIndex(['id_kelas'])
                ->addIndex(['id_pengurus'])
                ->addIndex(['status'])
                ->addForeignKey('id_kelas', 'lembaga___rombel', 'id', ['delete' => 'CASCADE', 'update' => 'CASCADE'])
                ->create();

            // FK ke pengurus dan santri (riwayat tidak dihapus, SET NULL)
            foreach (['id_pengurus' => 'pengurus', 'id_ketua' => 'santri', 'id_wakil' => 'santri', 'id_sekretaris' => 'santri', 'id_bendahara' => 'santri'] as $col => $refTable) {
                $fkName = 'fk_lembaga_wali_kelas_' . $col;
                $this->execute(sprintf(
                    'ALTER TABLE lembaga___wali_kelas ADD CONSTRAINT %s FOREIGN KEY (%s) REFERENCES %s (id) ON DELETE SET NULL ON UPDATE CASCADE',
                    $fkName,
                    $col,
                    $refTable
                ));
            }
        }

        $this->execute('SET FOREIGN_KEY_CHECKS = 1');
    }

    public function down(): void
    {
        $this->execute('SET FOREIGN_KEY_CHECKS = 0');
        if ($this->hasTable('lembaga___wali_kelas')) {
            $this->table('lembaga___wali_kelas')->drop()->save();
        }
        if ($this->hasTable('lembaga___rombel')) {
            $this->table('lembaga___rombel')->drop()->save();
        }
        $this->execute('SET FOREIGN_KEY_CHECKS = 1');
    }
}

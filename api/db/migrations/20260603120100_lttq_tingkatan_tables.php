<?php

declare(strict_types=1);

use Phinx\Migration\AbstractMigration;

/**
 * Tabel lttq_tingkatan, lttq___mualim, santri___lttq, kolom santri.id_lttq_tingkatan.
 */
final class LttqTingkatanTables extends AbstractMigration
{
    public function up(): void
    {
        $this->execute('SET FOREIGN_KEY_CHECKS = 0');

        if (!$this->hasTable('lttq_tingkatan')) {
            $this->table('lttq_tingkatan', ['id' => true])
                ->addColumn('lembaga_id', 'string', ['limit' => 50, 'null' => false])
                ->addColumn('tingkatan', 'string', ['limit' => 100, 'null' => true])
                ->addColumn('kelompok', 'string', ['limit' => 100, 'null' => true])
                ->addColumn('keterangan', 'text', ['null' => true])
                ->addColumn('status', 'string', ['limit' => 20, 'default' => 'aktif'])
                ->addColumn('tanggal_dibuat', 'timestamp', ['null' => true, 'default' => 'CURRENT_TIMESTAMP'])
                ->addIndex(['lembaga_id'])
                ->addIndex(['status'])
                ->addIndex(['lembaga_id', 'tingkatan', 'kelompok'], ['unique' => true])
                ->create();
            $this->execute('ALTER TABLE lttq_tingkatan CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci');
            $this->execute('ALTER TABLE lttq_tingkatan ADD CONSTRAINT fk_lttq_tingkatan_lembaga FOREIGN KEY (lembaga_id) REFERENCES lembaga (id) ON DELETE CASCADE ON UPDATE CASCADE');
        }

        if ($this->hasTable('santri') && !$this->table('santri')->hasColumn('id_lttq_tingkatan')) {
            $this->table('santri')
                ->addColumn('id_lttq_tingkatan', 'integer', ['signed' => true, 'null' => true, 'default' => null])
                ->addIndex(['id_lttq_tingkatan'])
                ->update();
        }
        if ($this->hasTable('santri') && $this->hasTable('lttq_tingkatan')) {
            $fkCheck = $this->fetchRow("
                SELECT 1 FROM information_schema.TABLE_CONSTRAINTS
                WHERE CONSTRAINT_SCHEMA = DATABASE()
                  AND TABLE_NAME = 'santri'
                  AND CONSTRAINT_NAME = 'fk_santri_lttq_tingkatan'
                LIMIT 1
            ");
            if ($fkCheck === false || $fkCheck === null) {
                try {
                    $this->execute('ALTER TABLE santri ADD CONSTRAINT fk_santri_lttq_tingkatan FOREIGN KEY (id_lttq_tingkatan) REFERENCES lttq_tingkatan (id) ON DELETE SET NULL ON UPDATE CASCADE');
                } catch (\Throwable $e) {
                    // Beberapa instalasi MySQL/MariaDB menolak FK pada santri; kolom tetap dipakai aplikasi.
                    error_log('LttqTingkatanTables: skip FK santri.id_lttq_tingkatan — ' . $e->getMessage());
                }
            }
        }

        if (!$this->hasTable('lttq___mualim')) {
            $this->table('lttq___mualim', ['id' => true])
                ->addColumn('id_lttq_tingkatan', 'integer', ['signed' => true, 'null' => false])
                ->addColumn('id_pengurus', 'integer', ['signed' => true, 'null' => true])
                ->addColumn('id_santri', 'integer', ['signed' => true, 'null' => true])
                ->addColumn('tahun_ajaran', 'string', ['limit' => 50, 'null' => true])
                ->addColumn('status', 'string', ['limit' => 20, 'default' => 'aktif'])
                ->addColumn('tanggal_dibuat', 'timestamp', ['null' => true, 'default' => 'CURRENT_TIMESTAMP'])
                ->addIndex(['id_lttq_tingkatan'])
                ->addIndex(['id_pengurus'])
                ->addIndex(['id_santri'])
                ->addIndex(['status'])
                ->addForeignKey('id_lttq_tingkatan', 'lttq_tingkatan', 'id', ['delete' => 'CASCADE', 'update' => 'CASCADE'])
                ->create();
            $this->execute('ALTER TABLE lttq___mualim CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci');
            $this->execute('ALTER TABLE lttq___mualim ADD CONSTRAINT fk_lttq_mualim_pengurus FOREIGN KEY (id_pengurus) REFERENCES pengurus (id) ON DELETE SET NULL ON UPDATE CASCADE');
            $this->execute('ALTER TABLE lttq___mualim ADD CONSTRAINT fk_lttq_mualim_santri FOREIGN KEY (id_santri) REFERENCES santri (id) ON DELETE SET NULL ON UPDATE CASCADE');
        }

        if (!$this->hasTable('santri___lttq') && $this->hasTable('tahun_ajaran')) {
            $this->table('santri___lttq', ['id' => true])
                ->addColumn('id_lttq_tingkatan', 'integer', ['signed' => true, 'null' => false])
                ->addColumn('id_santri', 'integer', ['signed' => true, 'null' => false])
                ->addColumn('nim', 'string', ['limit' => 50, 'null' => true])
                ->addColumn('tahun_ajaran', 'string', ['limit' => 50, 'null' => false])
                ->addColumn('id_pengurus', 'integer', ['signed' => true, 'null' => false])
                ->addColumn('tanggal_dibuat', 'timestamp', ['null' => true, 'default' => 'CURRENT_TIMESTAMP'])
                ->addIndex(['id_lttq_tingkatan'])
                ->addIndex(['id_santri'])
                ->addIndex(['tahun_ajaran'])
                ->addIndex(['id_santri', 'id_lttq_tingkatan', 'tahun_ajaran'], ['unique' => true])
                ->create();
            $this->execute('ALTER TABLE santri___lttq CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci');
            $this->execute('ALTER TABLE santri___lttq MODIFY tahun_ajaran VARCHAR(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL');
            $this->execute('ALTER TABLE santri___lttq ADD CONSTRAINT fk_santri_lttq_tingkatan FOREIGN KEY (id_lttq_tingkatan) REFERENCES lttq_tingkatan (id) ON DELETE CASCADE ON UPDATE CASCADE');
            $this->execute('ALTER TABLE santri___lttq ADD CONSTRAINT fk_santri_lttq_santri FOREIGN KEY (id_santri) REFERENCES santri (id) ON DELETE CASCADE ON UPDATE CASCADE');
            $this->execute('ALTER TABLE santri___lttq ADD CONSTRAINT fk_santri_lttq_tahun_ajaran FOREIGN KEY (tahun_ajaran) REFERENCES tahun_ajaran (tahun_ajaran) ON DELETE RESTRICT ON UPDATE CASCADE');
            $this->execute('ALTER TABLE santri___lttq ADD CONSTRAINT fk_santri_lttq_pengurus FOREIGN KEY (id_pengurus) REFERENCES pengurus (id) ON DELETE RESTRICT ON UPDATE CASCADE');
        }

        $this->execute('SET FOREIGN_KEY_CHECKS = 1');
    }

    public function down(): void
    {
        $this->execute('SET FOREIGN_KEY_CHECKS = 0');
        if ($this->hasTable('santri___lttq')) {
            $this->table('santri___lttq')->drop()->save();
        }
        if ($this->hasTable('lttq___mualim')) {
            $this->table('lttq___mualim')->drop()->save();
        }
        if ($this->hasTable('santri') && $this->table('santri')->hasColumn('id_lttq_tingkatan')) {
            $this->execute('ALTER TABLE santri DROP FOREIGN KEY fk_santri_lttq_tingkatan');
            $this->table('santri')->removeColumn('id_lttq_tingkatan')->update();
        }
        if ($this->hasTable('lttq_tingkatan')) {
            $this->table('lttq_tingkatan')->drop()->save();
        }
        $this->execute('SET FOREIGN_KEY_CHECKS = 1');
    }
}

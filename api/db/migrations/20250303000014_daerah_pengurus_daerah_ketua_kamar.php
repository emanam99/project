<?php

declare(strict_types=1);

use Phinx\Migration\AbstractMigration;

/**
 * daerah___pengurus: siapa pengurus yang menjabat aktif di daerah (id_daerah), jabatan (id_jabatan), per tahun_ajaran.
 * daerah___ketua_kamar: ketua kamar per daerah___kamar (id_daerah_kamar), santri (id_ketua_kamar), tahun_ajaran.
 */
final class DaerahPengurusDaerahKetuaKamar extends AbstractMigration
{
    public function up(): void
    {
        $this->execute('SET FOREIGN_KEY_CHECKS = 0');

        // 1) Tabel daerah___pengurus
        if (!$this->hasTable('daerah___pengurus')) {
            $this->table('daerah___pengurus', ['id' => true])
                ->addColumn('id_daerah', 'integer', ['signed' => true, 'null' => false])
                ->addColumn('id_pengurus', 'integer', ['signed' => true, 'null' => false])
                ->addColumn('id_jabatan', 'integer', ['signed' => true, 'null' => true])
                ->addColumn('tahun_ajaran', 'string', ['limit' => 50, 'null' => true])
                ->addColumn('status', 'string', ['limit' => 20, 'default' => 'aktif'])
                ->addColumn('keterangan', 'text', ['null' => true])
                ->addColumn('tanggal_dibuat', 'timestamp', ['null' => true, 'default' => 'CURRENT_TIMESTAMP'])
                ->addIndex(['id_daerah'])
                ->addIndex(['id_pengurus'])
                ->addIndex(['id_jabatan'])
                ->addIndex(['tahun_ajaran'])
                ->addIndex(['status'])
                ->addForeignKey('id_daerah', 'daerah', 'id', ['delete' => 'CASCADE', 'update' => 'CASCADE'])
                ->addForeignKey('id_pengurus', 'pengurus', 'id', ['delete' => 'CASCADE', 'update' => 'CASCADE'])
                ->create();
            $this->execute('ALTER TABLE daerah___pengurus CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci');
            $this->execute('ALTER TABLE daerah___pengurus MODIFY tahun_ajaran VARCHAR(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL');
            $conn = $this->getAdapter()->getConnection();
            $stmt = $conn->query("SELECT 1 FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'daerah___pengurus' AND CONSTRAINT_NAME = 'fk_daerah_pengurus_jabatan'");
            if ($stmt->fetch(\PDO::FETCH_ASSOC) === false) {
                $this->execute('ALTER TABLE daerah___pengurus ADD CONSTRAINT fk_daerah_pengurus_jabatan FOREIGN KEY (id_jabatan) REFERENCES jabatan (id) ON DELETE SET NULL ON UPDATE CASCADE');
            }
            $stmt = $conn->query("SELECT 1 FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'daerah___pengurus' AND CONSTRAINT_NAME = 'fk_daerah_pengurus_tahun_ajaran'");
            if ($stmt->fetch(\PDO::FETCH_ASSOC) === false) {
                $this->execute('ALTER TABLE daerah___pengurus ADD CONSTRAINT fk_daerah_pengurus_tahun_ajaran FOREIGN KEY (tahun_ajaran) REFERENCES tahun_ajaran (tahun_ajaran) ON DELETE SET NULL ON UPDATE CASCADE');
            }
        }

        // 2) Tabel daerah___ketua_kamar
        if (!$this->hasTable('daerah___ketua_kamar')) {
            $this->table('daerah___ketua_kamar', ['id' => true])
                ->addColumn('id_daerah_kamar', 'integer', ['signed' => true, 'null' => false])
                ->addColumn('id_ketua_kamar', 'integer', ['signed' => true, 'null' => false])
                ->addColumn('tahun_ajaran', 'string', ['limit' => 50, 'null' => true])
                ->addColumn('status', 'string', ['limit' => 20, 'default' => 'aktif'])
                ->addColumn('keterangan', 'text', ['null' => true])
                ->addColumn('tanggal_dibuat', 'timestamp', ['null' => true, 'default' => 'CURRENT_TIMESTAMP'])
                ->addIndex(['id_daerah_kamar'])
                ->addIndex(['id_ketua_kamar'])
                ->addIndex(['tahun_ajaran'])
                ->addIndex(['status'])
                ->addForeignKey('id_daerah_kamar', 'daerah___kamar', 'id', ['delete' => 'CASCADE', 'update' => 'CASCADE'])
                ->addForeignKey('id_ketua_kamar', 'santri', 'id', ['delete' => 'CASCADE', 'update' => 'CASCADE'])
                ->create();
            $this->execute('ALTER TABLE daerah___ketua_kamar CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci');
            $this->execute('ALTER TABLE daerah___ketua_kamar MODIFY tahun_ajaran VARCHAR(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL');
            $conn = $this->getAdapter()->getConnection();
            $stmt = $conn->query("SELECT 1 FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'daerah___ketua_kamar' AND CONSTRAINT_NAME = 'fk_daerah_ketua_kamar_tahun_ajaran'");
            if ($stmt->fetch(\PDO::FETCH_ASSOC) === false) {
                $this->execute('ALTER TABLE daerah___ketua_kamar ADD CONSTRAINT fk_daerah_ketua_kamar_tahun_ajaran FOREIGN KEY (tahun_ajaran) REFERENCES tahun_ajaran (tahun_ajaran) ON DELETE SET NULL ON UPDATE CASCADE');
            }
        }

        $this->execute('SET FOREIGN_KEY_CHECKS = 1');
    }

    public function down(): void
    {
        $this->execute('SET FOREIGN_KEY_CHECKS = 0');
        if ($this->hasTable('daerah___ketua_kamar')) {
            $this->table('daerah___ketua_kamar')->drop()->save();
        }
        if ($this->hasTable('daerah___pengurus')) {
            $this->table('daerah___pengurus')->drop()->save();
        }
        $this->execute('SET FOREIGN_KEY_CHECKS = 1');
    }
}

<?php

declare(strict_types=1);

use Phinx\Migration\AbstractMigration;

/**
 * Tabel daerah (kategori, daerah, keterangan, status, tanggal_dibuat).
 * Tabel daerah___kamar (id_daerah, kamar, status, keterangan, tanggal_dibuat).
 * Isi daerah dari santri: DISTINCT kategori, daerah, keterangan hanya untuk kategori Banin/Banat.
 * Isi daerah___kamar dari santri: match daerah → id_daerah, kolom kamar.
 */
final class DaerahDanDaerahKamar extends AbstractMigration
{
    public function up(): void
    {
        $this->execute('SET FOREIGN_KEY_CHECKS = 0');

        // 1) Tabel daerah
        if (!$this->hasTable('daerah')) {
            $this->table('daerah', ['id' => true])
                ->addColumn('kategori', 'string', ['limit' => 50, 'null' => false])
                ->addColumn('daerah', 'string', ['limit' => 255, 'null' => false])
                ->addColumn('keterangan', 'text', ['null' => true])
                ->addColumn('status', 'string', ['limit' => 20, 'default' => 'aktif'])
                ->addColumn('tanggal_dibuat', 'timestamp', ['null' => true, 'default' => 'CURRENT_TIMESTAMP'])
                ->addIndex(['kategori'])
                ->addIndex(['status'])
                ->addIndex(['kategori', 'daerah'], ['unique' => true, 'name' => 'uq_daerah_kategori_daerah'])
                ->create();
            $this->execute('ALTER TABLE daerah CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci');
        }

        // 2) Isi daerah dari santri: hanya Banin / Banat, distinct (kategori, daerah), keterangan NULL
        if ($this->hasTable('santri')) {
            $conn = $this->getAdapter()->getConnection();
            $conn->exec("
                INSERT IGNORE INTO daerah (kategori, daerah, keterangan, status, tanggal_dibuat)
                SELECT DISTINCT
                    TRIM(s.kategori),
                    TRIM(s.daerah),
                    NULL,
                    'aktif',
                    CURRENT_TIMESTAMP
                FROM santri s
                WHERE s.kategori IN ('Banin', 'Banat')
                  AND s.daerah IS NOT NULL AND TRIM(s.daerah) <> ''
            ");
        }

        // 3) Tabel daerah___kamar
        if (!$this->hasTable('daerah___kamar')) {
            $this->table('daerah___kamar', ['id' => true])
                ->addColumn('id_daerah', 'integer', ['signed' => true, 'null' => false])
                ->addColumn('kamar', 'string', ['limit' => 100, 'null' => false])
                ->addColumn('status', 'string', ['limit' => 20, 'default' => 'aktif'])
                ->addColumn('keterangan', 'text', ['null' => true])
                ->addColumn('tanggal_dibuat', 'timestamp', ['null' => true, 'default' => 'CURRENT_TIMESTAMP'])
                ->addIndex(['id_daerah'])
                ->addIndex(['status'])
                ->addIndex(['id_daerah', 'kamar'], ['unique' => true, 'name' => 'uq_daerah_kamar_daerah_kamar'])
                ->addForeignKey('id_daerah', 'daerah', 'id', ['delete' => 'CASCADE', 'update' => 'CASCADE'])
                ->create();
            $this->execute('ALTER TABLE daerah___kamar CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci');
        }

        // 4) Isi daerah___kamar dari santri: match (kategori, daerah) → id_daerah, distinct kamar
        if ($this->hasTable('santri') && $this->hasTable('daerah')) {
            $conn = $this->getAdapter()->getConnection();
            $conn->exec("
                INSERT IGNORE INTO daerah___kamar (id_daerah, kamar, status, keterangan, tanggal_dibuat)
                SELECT DISTINCT
                    d.id,
                    TRIM(s.kamar),
                    'aktif',
                    NULL,
                    CURRENT_TIMESTAMP
                FROM santri s
                INNER JOIN daerah d ON d.kategori = TRIM(s.kategori) AND d.daerah = TRIM(s.daerah)
                WHERE s.kamar IS NOT NULL AND TRIM(s.kamar) <> ''
            ");
        }

        $this->execute('SET FOREIGN_KEY_CHECKS = 1');
    }

    public function down(): void
    {
        $this->execute('SET FOREIGN_KEY_CHECKS = 0');
        if ($this->hasTable('daerah___kamar')) {
            $this->table('daerah___kamar')->drop()->save();
        }
        if ($this->hasTable('daerah')) {
            $this->table('daerah')->drop()->save();
        }
        $this->execute('SET FOREIGN_KEY_CHECKS = 1');
    }
}

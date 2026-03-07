<?php

declare(strict_types=1);

use Phinx\Migration\AbstractMigration;

/**
 * Tabel santri___lulusan: pencatatan lulusan per lembaga per tahun ajaran.
 * Setiap santri yang lulus dari suatu lembaga pada tahun ajaran tertentu tercatat di sini.
 * Kolom: id_santri (FK santri), id_lembaga (FK lembaga), tahun_ajaran (FK tahun_ajaran), tanggal_dibuat.
 */
final class SantriLulusan extends AbstractMigration
{
    public function up(): void
    {
        $this->execute('SET FOREIGN_KEY_CHECKS = 0');

        if (!$this->hasTable('santri') || !$this->hasTable('lembaga') || !$this->hasTable('tahun_ajaran')) {
            $this->execute('SET FOREIGN_KEY_CHECKS = 1');
            return;
        }

        if (!$this->hasTable('santri___lulusan')) {
            $this->table('santri___lulusan', ['id' => true])
                ->addColumn('id_santri', 'integer', ['signed' => true, 'null' => false])
                ->addColumn('id_lembaga', 'string', ['limit' => 50, 'null' => false])
                ->addColumn('tahun_ajaran', 'string', ['limit' => 50, 'null' => false])
                ->addColumn('tanggal_dibuat', 'timestamp', ['null' => true, 'default' => 'CURRENT_TIMESTAMP'])
                ->addIndex(['id_santri'])
                ->addIndex(['id_lembaga'])
                ->addIndex(['tahun_ajaran'])
                ->addIndex(['id_santri', 'id_lembaga', 'tahun_ajaran'], ['unique' => true, 'name' => 'uq_santri_lulusan_santri_lembaga_ta'])
                ->create();

            $this->execute('ALTER TABLE santri___lulusan CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci');
            $this->execute('ALTER TABLE santri___lulusan MODIFY id_lembaga VARCHAR(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL');
            $this->execute('ALTER TABLE santri___lulusan MODIFY tahun_ajaran VARCHAR(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL');

            $this->execute('ALTER TABLE santri___lulusan ADD CONSTRAINT fk_santri_lulusan_id_santri FOREIGN KEY (id_santri) REFERENCES santri (id) ON DELETE CASCADE ON UPDATE CASCADE');
            $this->execute('ALTER TABLE santri___lulusan ADD CONSTRAINT fk_santri_lulusan_id_lembaga FOREIGN KEY (id_lembaga) REFERENCES lembaga (id) ON DELETE CASCADE ON UPDATE CASCADE');
            $this->execute('ALTER TABLE santri___lulusan ADD CONSTRAINT fk_santri_lulusan_tahun_ajaran FOREIGN KEY (tahun_ajaran) REFERENCES tahun_ajaran (tahun_ajaran) ON DELETE RESTRICT ON UPDATE CASCADE');
        }

        $this->execute('SET FOREIGN_KEY_CHECKS = 1');
    }

    public function down(): void
    {
        $this->execute('SET FOREIGN_KEY_CHECKS = 0');
        if ($this->hasTable('santri___lulusan')) {
            $this->table('santri___lulusan')->drop()->save();
        }
        $this->execute('SET FOREIGN_KEY_CHECKS = 1');
    }
}

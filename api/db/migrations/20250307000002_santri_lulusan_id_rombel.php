<?php

declare(strict_types=1);

use Phinx\Migration\AbstractMigration;

/**
 * santri___lulusan: tambah id_rombel (FK lembaga___rombel), hapus id_lembaga.
 * Lembaga tercakup dari rombel (lembaga___rombel.lembaga_id).
 */
final class SantriLulusanIdRombel extends AbstractMigration
{
    public function up(): void
    {
        $conn = $this->getAdapter()->getConnection();

        if (!$this->hasTable('santri___lulusan') || !$this->hasTable('lembaga___rombel')) {
            return;
        }

        $this->execute('SET FOREIGN_KEY_CHECKS = 0');

        // 1) Tambah kolom id_rombel (nullable dulu)
        if (!$this->table('santri___lulusan')->hasColumn('id_rombel')) {
            $this->execute('ALTER TABLE santri___lulusan ADD COLUMN id_rombel INT NULL AFTER id_lembaga');
        }

        // 2) Backfill id_rombel dari id_lembaga (ambil satu rombel per lembaga)
        $this->execute(
            "UPDATE santri___lulusan sl
             SET id_rombel = (
                 SELECT r.id FROM lembaga___rombel r
                 WHERE r.lembaga_id = sl.id_lembaga
                 ORDER BY r.id LIMIT 1
             )
             WHERE sl.id_rombel IS NULL"
        );

        // 3) Hapus baris yang tidak bisa di-backfill (lembaga tanpa rombel)
        $this->execute('DELETE FROM santri___lulusan WHERE id_rombel IS NULL');

        // 4) id_rombel NOT NULL
        $this->execute('ALTER TABLE santri___lulusan MODIFY id_rombel INT NOT NULL');

        // 5) Hapus FK dan unique lama
        $stmt = $conn->query("SELECT CONSTRAINT_NAME FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'santri___lulusan' AND CONSTRAINT_NAME = 'fk_santri_lulusan_id_lembaga'");
        if ($stmt->rowCount() > 0) {
            $this->execute('ALTER TABLE santri___lulusan DROP FOREIGN KEY fk_santri_lulusan_id_lembaga');
        }
        $stmt = $conn->query("SELECT CONSTRAINT_NAME FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'santri___lulusan' AND CONSTRAINT_NAME = 'uq_santri_lulusan_santri_lembaga_ta'");
        if ($stmt->rowCount() > 0) {
            $this->execute('ALTER TABLE santri___lulusan DROP INDEX uq_santri_lulusan_santri_lembaga_ta');
        }

        // 6) Hapus kolom id_lembaga
        if ($this->table('santri___lulusan')->hasColumn('id_lembaga')) {
            $this->execute('ALTER TABLE santri___lulusan DROP COLUMN id_lembaga');
        }

        // 7) Unique baru dan FK id_rombel
        $this->execute('ALTER TABLE santri___lulusan ADD UNIQUE KEY uq_santri_lulusan_santri_rombel_ta (id_santri, id_rombel, tahun_ajaran)');
        $stmt = $conn->query("SELECT CONSTRAINT_NAME FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'santri___lulusan' AND CONSTRAINT_NAME = 'fk_santri_lulusan_id_rombel'");
        if ($stmt->rowCount() === 0) {
            $this->execute('ALTER TABLE santri___lulusan ADD CONSTRAINT fk_santri_lulusan_id_rombel FOREIGN KEY (id_rombel) REFERENCES lembaga___rombel (id) ON DELETE CASCADE ON UPDATE CASCADE');
        }

        $this->execute('SET FOREIGN_KEY_CHECKS = 1');
    }

    public function down(): void
    {
        $conn = $this->getAdapter()->getConnection();

        if (!$this->hasTable('santri___lulusan') || !$this->hasTable('lembaga')) {
            return;
        }

        $this->execute('SET FOREIGN_KEY_CHECKS = 0');

        if ($this->table('santri___lulusan')->hasColumn('id_rombel')) {
            $stmt = $conn->query("SELECT CONSTRAINT_NAME FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'santri___lulusan' AND CONSTRAINT_NAME = 'fk_santri_lulusan_id_rombel'");
            if ($stmt->rowCount() > 0) {
                $this->execute('ALTER TABLE santri___lulusan DROP FOREIGN KEY fk_santri_lulusan_id_rombel');
            }
            $stmt = $conn->query("SELECT CONSTRAINT_NAME FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'santri___lulusan' AND CONSTRAINT_NAME = 'uq_santri_lulusan_santri_rombel_ta'");
            if ($stmt->rowCount() > 0) {
                $this->execute('ALTER TABLE santri___lulusan DROP INDEX uq_santri_lulusan_santri_rombel_ta');
            }

            $this->execute('ALTER TABLE santri___lulusan ADD COLUMN id_lembaga VARCHAR(50) NULL AFTER id_santri');
            $this->execute(
                "UPDATE santri___lulusan sl
                 INNER JOIN lembaga___rombel r ON r.id = sl.id_rombel
                 SET sl.id_lembaga = r.lembaga_id"
            );
            $this->execute('ALTER TABLE santri___lulusan MODIFY id_lembaga VARCHAR(50) NOT NULL');
            $this->execute('ALTER TABLE santri___lulusan DROP COLUMN id_rombel');
            $this->execute('ALTER TABLE santri___lulusan ADD CONSTRAINT fk_santri_lulusan_id_lembaga FOREIGN KEY (id_lembaga) REFERENCES lembaga (id) ON DELETE CASCADE ON UPDATE CASCADE');
            $this->execute('ALTER TABLE santri___lulusan ADD UNIQUE KEY uq_santri_lulusan_santri_lembaga_ta (id_santri, id_lembaga, tahun_ajaran)');
        }

        $this->execute('SET FOREIGN_KEY_CHECKS = 1');
    }
}

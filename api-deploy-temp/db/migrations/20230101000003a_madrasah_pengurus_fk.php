<?php

declare(strict_types=1);

use Phinx\Migration\AbstractMigration;

/**
 * Tambah FK madrasah -> pengurus (id_pengasuh, id_pjgt).
 * Dijalankan setelah 003 (users, santri, pengurus) agar tabel pengurus sudah ada.
 */
final class MadrasahPengurusFk extends AbstractMigration
{
    public function up(): void
    {
        if (!$this->hasTable('madrasah') || !$this->hasTable('pengurus')) {
            return;
        }

        $conn = $this->getAdapter()->getConnection();
        $conn->exec('SET FOREIGN_KEY_CHECKS = 0');

        // Cek apakah constraint sudah ada (idempotent)
        $rows = $this->fetchAll(
            "SELECT CONSTRAINT_NAME FROM information_schema.TABLE_CONSTRAINTS 
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'madrasah' 
             AND CONSTRAINT_NAME IN ('fk_madrasah_pengasuh', 'fk_madrasah_pjgt')"
        );
        $existing = array_column($rows, 'CONSTRAINT_NAME');

        if (!in_array('fk_madrasah_pengasuh', $existing, true)) {
            $this->execute('ALTER TABLE madrasah ADD CONSTRAINT fk_madrasah_pengasuh FOREIGN KEY (id_pengasuh) REFERENCES pengurus (id) ON DELETE SET NULL ON UPDATE CASCADE');
        }
        if (!in_array('fk_madrasah_pjgt', $existing, true)) {
            $this->execute('ALTER TABLE madrasah ADD CONSTRAINT fk_madrasah_pjgt FOREIGN KEY (id_pjgt) REFERENCES pengurus (id) ON DELETE SET NULL ON UPDATE CASCADE');
        }

        $conn->exec('SET FOREIGN_KEY_CHECKS = 1');
    }

    public function down(): void
    {
        if (!$this->hasTable('madrasah')) {
            return;
        }
        $rows = $this->fetchAll(
            "SELECT CONSTRAINT_NAME FROM information_schema.TABLE_CONSTRAINTS 
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'madrasah' 
             AND CONSTRAINT_NAME IN ('fk_madrasah_pengasuh', 'fk_madrasah_pjgt')"
        );
        $this->execute('SET FOREIGN_KEY_CHECKS = 0');
        foreach ($rows as $r) {
            $name = $r['CONSTRAINT_NAME'] ?? null;
            if ($name) {
                $this->execute('ALTER TABLE madrasah DROP FOREIGN KEY `' . $name . '`');
            }
        }
        $this->execute('SET FOREIGN_KEY_CHECKS = 1');
    }
}

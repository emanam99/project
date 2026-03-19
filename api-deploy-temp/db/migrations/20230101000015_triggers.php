<?php

declare(strict_types=1);

use Phinx\Migration\AbstractMigration;

/**
 * Trigger MySQL (generate_pengurus_id, before_insert_psb_pengeluaran, generate_nis, dll).
 * Up: hanya DROP TRIGGER IF EXISTS agar idempotent.
 * CREATE TRIGGER harus dijalankan manual (DELIMITER ;; tidak didukung PDO per-statement).
 */
final class Triggers extends AbstractMigration
{
    public function up(): void
    {
        $triggers = [
            'generate_pengurus_id',
            'before_insert_psb_pengeluaran',
            'generate_nis',
        ];
        foreach ($triggers as $name) {
            $this->execute(sprintf('DROP TRIGGER IF EXISTS `%s`', $name));
        }
        // CREATE TRIGGER must be run manually (DELIMITER ;; not supported via PDO).
    }

    public function down(): void
    {
        $triggers = [
            'generate_pengurus_id',
            'before_insert_psb_pengeluaran',
            'generate_nis',
        ];
        foreach ($triggers as $name) {
            $this->execute(sprintf('DROP TRIGGER IF EXISTS `%s`', $name));
        }
    }
}

<?php

declare(strict_types=1);

use Phinx\Migration\AbstractMigration;

/**
 * Tipe input kolom Bisyaroh: checkbox (nilai 1/0 untuk rumus).
 */
final class BisyarohKolomInputTipeCheckbox extends AbstractMigration
{
    public function up(): void
    {
        if (!$this->hasTable('bisyaroh___kolom')) {
            return;
        }

        $this->execute(
            "ALTER TABLE `bisyaroh___kolom`
             MODIFY `input_tipe` enum('angka','rupiah','teks','persen','checkbox') NOT NULL DEFAULT 'angka'"
        );
    }

    public function down(): void
    {
        if (!$this->hasTable('bisyaroh___kolom')) {
            return;
        }

        $this->execute(
            "UPDATE `bisyaroh___kolom` SET `input_tipe` = 'angka' WHERE `input_tipe` = 'checkbox'"
        );
        $this->execute(
            "ALTER TABLE `bisyaroh___kolom`
             MODIFY `input_tipe` enum('angka','rupiah','teks','persen') NOT NULL DEFAULT 'angka'"
        );
    }
}

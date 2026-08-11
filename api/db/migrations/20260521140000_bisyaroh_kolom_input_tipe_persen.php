<?php

declare(strict_types=1);

use Phinx\Migration\AbstractMigration;

/**
 * Tipe tampilan kolom rumus: angka, rupiah, atau persen (selain teks untuk input).
 */
final class BisyarohKolomInputTipePersen extends AbstractMigration
{
    public function up(): void
    {
        if (!$this->hasTable('bisyaroh___kolom')) {
            return;
        }

        $this->execute(
            "ALTER TABLE `bisyaroh___kolom`
             MODIFY `input_tipe` enum('angka','rupiah','teks','persen') NOT NULL DEFAULT 'angka'"
        );
    }

    public function down(): void
    {
        if (!$this->hasTable('bisyaroh___kolom')) {
            return;
        }

        $this->execute(
            "UPDATE `bisyaroh___kolom` SET `input_tipe` = 'angka' WHERE `input_tipe` = 'persen'"
        );
        $this->execute(
            "ALTER TABLE `bisyaroh___kolom`
             MODIFY `input_tipe` enum('angka','rupiah','teks') NOT NULL DEFAULT 'angka'"
        );
    }
}

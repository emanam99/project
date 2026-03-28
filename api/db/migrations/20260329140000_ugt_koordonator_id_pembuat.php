<?php

declare(strict_types=1);

use Phinx\Migration\AbstractMigration;

/**
 * Pengurus yang menyimpan/membuat baris laporan koordinator UGT.
 */
final class UgtKoordonatorIdPembuat extends AbstractMigration
{
    public function up(): void
    {
        $this->execute('SET NAMES utf8mb4');
        $this->execute('SET FOREIGN_KEY_CHECKS = 0');

        $this->execute(<<<'SQL'
ALTER TABLE `ugt___koordonator`
  ADD COLUMN `id_pembuat` int(11) DEFAULT NULL COMMENT 'FK pengurus yang menyimpan laporan' AFTER `id_koordinator`,
  ADD KEY `idx_pembuat` (`id_pembuat`)
SQL);

        $this->execute(<<<'SQL'
ALTER TABLE `ugt___koordonator`
  ADD CONSTRAINT `fk_ugt_koordonator_pembuat` FOREIGN KEY (`id_pembuat`) REFERENCES `pengurus` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
SQL);

        $this->execute('SET FOREIGN_KEY_CHECKS = 1');
    }

    public function down(): void
    {
        $this->execute('SET FOREIGN_KEY_CHECKS = 0');
        $this->execute('ALTER TABLE `ugt___koordonator` DROP FOREIGN KEY `fk_ugt_koordonator_pembuat`');
        $this->execute('ALTER TABLE `ugt___koordonator` DROP COLUMN `id_pembuat`');
        $this->execute('SET FOREIGN_KEY_CHECKS = 1');
    }
}

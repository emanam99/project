<?php

declare(strict_types=1);

use Phinx\Migration\AbstractMigration;

/**
 * FK laporan koordinator UGT ke pengurus (koordinator).
 */
final class UgtKoordonatorIdKoordinator extends AbstractMigration
{
    public function up(): void
    {
        $this->execute('SET NAMES utf8mb4');
        $this->execute('SET FOREIGN_KEY_CHECKS = 0');

        $this->execute(<<<'SQL'
ALTER TABLE `ugt___koordonator`
  ADD COLUMN `id_koordinator` int(11) DEFAULT NULL COMMENT 'FK pengurus (koordinator)' AFTER `id_santri`,
  ADD KEY `idx_koordinator` (`id_koordinator`)
SQL);

        $this->execute(<<<'SQL'
UPDATE `ugt___koordonator` k
INNER JOIN `madrasah` m ON m.id = k.id_madrasah
SET k.id_koordinator = m.id_koordinator
SQL);

        $this->execute(<<<'SQL'
ALTER TABLE `ugt___koordonator`
  ADD CONSTRAINT `fk_ugt_koordonator_pengurus` FOREIGN KEY (`id_koordinator`) REFERENCES `pengurus` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
SQL);

        $this->execute('SET FOREIGN_KEY_CHECKS = 1');
    }

    public function down(): void
    {
        $this->execute('SET FOREIGN_KEY_CHECKS = 0');
        $this->execute('ALTER TABLE `ugt___koordonator` DROP FOREIGN KEY `fk_ugt_koordonator_pengurus`');
        $this->execute('ALTER TABLE `ugt___koordonator` DROP COLUMN `id_koordinator`');
        $this->execute('SET FOREIGN_KEY_CHECKS = 1');
    }
}

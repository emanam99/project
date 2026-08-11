<?php

declare(strict_types=1);

use Phinx\Migration\AbstractMigration;

/**
 * Set Bisyaroh boleh belum terikat lembaga (dihubungkan lewat bisyaroh___lembaga / Kelola lembaga).
 */
final class BisyarohLembagaIdNullable extends AbstractMigration
{
    public function up(): void
    {
        if (!$this->hasTable('bisyaroh') || !$this->hasTable('lembaga')) {
            return;
        }

        $this->execute('ALTER TABLE `bisyaroh` DROP FOREIGN KEY `fk_bisyaroh_lembaga`');
        $this->execute('ALTER TABLE `bisyaroh` MODIFY `lembaga_id` varchar(50) NULL COMMENT \'Lembaga utama (legacy); boleh NULL jika hanya junction\'');
        $this->execute(<<<'SQL'
ALTER TABLE `bisyaroh`
  ADD CONSTRAINT `fk_bisyaroh_lembaga`
  FOREIGN KEY (`lembaga_id`) REFERENCES `lembaga` (`id`)
  ON DELETE SET NULL ON UPDATE CASCADE
SQL);
    }

    public function down(): void
    {
        if (!$this->hasTable('bisyaroh')) {
            return;
        }
        // Isi NULL dari junction jika ada
        $this->execute(<<<'SQL'
UPDATE `bisyaroh` b
LEFT JOIN (
  SELECT `bisyaroh_id`, MIN(`lembaga_id`) AS `lid` FROM `bisyaroh___lembaga` GROUP BY `bisyaroh_id`
) x ON x.`bisyaroh_id` = b.`id`
SET b.`lembaga_id` = COALESCE(b.`lembaga_id`, x.`lid`)
WHERE b.`lembaga_id` IS NULL AND x.`lid` IS NOT NULL
SQL);
        $this->execute('DELETE FROM `bisyaroh` WHERE `lembaga_id` IS NULL');
        $this->execute('ALTER TABLE `bisyaroh` DROP FOREIGN KEY `fk_bisyaroh_lembaga`');
        $this->execute('ALTER TABLE `bisyaroh` MODIFY `lembaga_id` varchar(50) NOT NULL');
        $this->execute(<<<'SQL'
ALTER TABLE `bisyaroh`
  ADD CONSTRAINT `fk_bisyaroh_lembaga`
  FOREIGN KEY (`lembaga_id`) REFERENCES `lembaga` (`id`)
  ON DELETE CASCADE ON UPDATE CASCADE
SQL);
    }
}

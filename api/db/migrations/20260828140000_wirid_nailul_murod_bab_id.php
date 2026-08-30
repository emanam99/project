<?php

declare(strict_types=1);

use Phinx\Migration\AbstractMigration;

/**
 * Relasi wirid → bab via bab_id (FK).
 * Dedupe metadata bab dari data lama; backfill bab_id; sinkron kolom bab (denormalized).
 */
final class WiridNailulMurodBabId extends AbstractMigration
{
    private function hasFk(string $table, string $constraint): bool
    {
        if (!$this->hasTable($table)) {
            return false;
        }
        $row = $this->fetchRow(
            "SELECT COUNT(*) AS c FROM information_schema.TABLE_CONSTRAINTS
             WHERE CONSTRAINT_SCHEMA = DATABASE()
               AND TABLE_NAME = '{$table}'
               AND CONSTRAINT_NAME = '{$constraint}'
               AND CONSTRAINT_TYPE = 'FOREIGN KEY'"
        );

        return isset($row['c']) && (int) $row['c'] > 0;
    }

    public function up(): void
    {
        if (!$this->hasTable('wirid___nailul_murod_bab') || !$this->hasTable('wirid___nailul_murod')) {
            return;
        }

        $wirid = $this->table('wirid___nailul_murod');

        $this->execute('SET NAMES utf8mb4');
        $this->execute('SET FOREIGN_KEY_CHECKS = 0');

        $this->execute("UPDATE `wirid___nailul_murod` SET `bab` = TRIM(`bab`) WHERE `bab` <> TRIM(`bab`)");
        $this->execute("UPDATE `wirid___nailul_murod_bab` SET `nama` = TRIM(`nama`) WHERE `nama` <> TRIM(`nama`)");

        // Satukan entri bab duplikat (beda kapital/spasi) — wirid mengikuti nama kanonik
        $this->execute(<<<'SQL'
UPDATE `wirid___nailul_murod` w
INNER JOIN `wirid___nailul_murod_bab` b ON b.`nama` = w.`bab`
INNER JOIN (
  SELECT LOWER(TRIM(`nama`)) AS `nk`, MIN(`id`) AS `keeper_id`
  FROM `wirid___nailul_murod_bab`
  GROUP BY LOWER(TRIM(`nama`))
) g ON LOWER(TRIM(b.`nama`)) = g.`nk`
INNER JOIN `wirid___nailul_murod_bab` bk ON bk.`id` = g.`keeper_id`
SET w.`bab` = bk.`nama`
WHERE b.`id` <> g.`keeper_id`
SQL);

        $this->execute(<<<'SQL'
DELETE b FROM `wirid___nailul_murod_bab` b
INNER JOIN (
  SELECT LOWER(TRIM(`nama`)) AS `nk`, MIN(`id`) AS `keeper_id`
  FROM `wirid___nailul_murod_bab`
  GROUP BY LOWER(TRIM(`nama`))
) g ON LOWER(TRIM(b.`nama`)) = g.`nk`
WHERE b.`id` <> g.`keeper_id`
SQL);

        // Bab dari wirid lama yang belum ada di metadata
        $this->execute(<<<'SQL'
INSERT IGNORE INTO `wirid___nailul_murod_bab` (`nama`, `urutan`)
SELECT d.`nama`, (@row := @row + 1)
FROM (
  SELECT MIN(TRIM(`bab`)) AS `nama`
  FROM `wirid___nailul_murod`
  WHERE TRIM(`bab`) <> ''
  GROUP BY LOWER(TRIM(`bab`))
) d
CROSS JOIN (SELECT @row := COALESCE(MAX(`urutan`), 0) FROM `wirid___nailul_murod_bab`) r
ORDER BY d.`nama` ASC
SQL);

        if (!$wirid->hasColumn('bab_id')) {
            $this->execute(<<<'SQL'
ALTER TABLE `wirid___nailul_murod`
  ADD COLUMN `bab_id` int(11) NULL DEFAULT NULL COMMENT 'FK ke wirid___nailul_murod_bab' AFTER `id`,
  ADD KEY `idx_nailul_wirid_bab_id` (`bab_id`)
SQL);
        }

        $this->execute(<<<'SQL'
UPDATE `wirid___nailul_murod` w
INNER JOIN `wirid___nailul_murod_bab` b ON b.`nama` = w.`bab`
SET w.`bab_id` = b.`id`
WHERE TRIM(w.`bab`) <> '' AND (w.`bab_id` IS NULL OR w.`bab_id` <> b.`id`)
SQL);

        $this->execute(<<<'SQL'
UPDATE `wirid___nailul_murod` w
INNER JOIN `wirid___nailul_murod_bab` b ON b.`id` = w.`bab_id`
SET w.`bab` = b.`nama`
WHERE w.`bab` <> b.`nama`
SQL);

        $this->execute("UPDATE `wirid___nailul_murod` SET `bab_id` = NULL WHERE TRIM(`bab`) = ''");

        if (!$this->hasFk('wirid___nailul_murod', 'fk_nailul_wirid_bab')) {
            $this->execute(<<<'SQL'
ALTER TABLE `wirid___nailul_murod`
  ADD CONSTRAINT `fk_nailul_wirid_bab`
  FOREIGN KEY (`bab_id`) REFERENCES `wirid___nailul_murod_bab` (`id`)
  ON DELETE RESTRICT ON UPDATE CASCADE
SQL);
        }

        $this->execute('SET FOREIGN_KEY_CHECKS = 1');
    }

    public function down(): void
    {
        if (!$this->hasTable('wirid___nailul_murod')) {
            return;
        }

        $this->execute('SET FOREIGN_KEY_CHECKS = 0');

        if ($this->hasFk('wirid___nailul_murod', 'fk_nailul_wirid_bab')) {
            $this->execute('ALTER TABLE `wirid___nailul_murod` DROP FOREIGN KEY `fk_nailul_wirid_bab`');
        }

        if ($this->table('wirid___nailul_murod')->hasColumn('bab_id')) {
            $this->execute('ALTER TABLE `wirid___nailul_murod` DROP COLUMN `bab_id`');
        }

        $this->execute('SET FOREIGN_KEY_CHECKS = 1');
    }
}

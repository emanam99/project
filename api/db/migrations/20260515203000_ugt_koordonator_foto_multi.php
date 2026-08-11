<?php

declare(strict_types=1);

use Phinx\Migration\AbstractMigration;

/**
 * Laporan koordinator: kolom foto menampung JSON array path (maks. 5) — sebelumnya satu path varchar(500).
 */
final class UgtKoordonatorFotoMulti extends AbstractMigration
{
    public function up(): void
    {
        $this->execute('SET NAMES utf8mb4');
        $this->execute(<<<'SQL'
ALTER TABLE `ugt___koordonator`
  MODIFY COLUMN `foto` text DEFAULT NULL COMMENT 'JSON array path uploads/ugt/... (maks. 5); legacy: satu path string'
SQL);
    }

    public function down(): void
    {
        $this->execute('SET NAMES utf8mb4');
        $this->execute(<<<'SQL'
ALTER TABLE `ugt___koordonator`
  MODIFY COLUMN `foto` varchar(500) DEFAULT NULL COMMENT 'Path relatif upload (mis. uploads/ugt/...)'
SQL);
    }
}

<?php

declare(strict_types=1);

use Phinx\Migration\AbstractMigration;

/**
 * Hari penting tipe per pekan: hari_pekan bisa beberapa hari (CSV, mis. "1,3,5").
 */
final class HariPentingPekanMulti extends AbstractMigration
{
    public function up(): void
    {
        $this->execute('ALTER TABLE `psa___hari_penting` MODIFY COLUMN `hari_pekan` VARCHAR(32) DEFAULT NULL');
    }

    public function down(): void
    {
        $this->execute('ALTER TABLE `psa___hari_penting` MODIFY COLUMN `hari_pekan` TINYINT(4) DEFAULT NULL');
    }
}

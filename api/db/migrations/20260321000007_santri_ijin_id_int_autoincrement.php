<?php

declare(strict_types=1);

use Phinx\Migration\AbstractMigration;

/**
 * santri___ijin.id: VARCHAR PK → INT UNSIGNED AUTO_INCREMENT.
 * Nilai lama (string) dibuang; baris tetap ada dengan id numerik baru.
 */
final class SantriIjinIdIntAutoincrement extends AbstractMigration
{
    public function up(): void
    {
        if (!$this->hasTable('santri___ijin')) {
            return;
        }

        $conn = $this->getAdapter()->getConnection();
        $stmt = $conn->prepare("
            SELECT DATA_TYPE
            FROM information_schema.COLUMNS
            WHERE TABLE_SCHEMA = DATABASE()
              AND TABLE_NAME = 'santri___ijin'
              AND COLUMN_NAME = 'id'
        ");
        $stmt->execute();
        $row = $stmt->fetch(\PDO::FETCH_ASSOC);
        if (!$row) {
            return;
        }
        if (($row['DATA_TYPE'] ?? '') === 'int') {
            return;
        }

        $this->execute('SET FOREIGN_KEY_CHECKS = 0');

        $this->execute('ALTER TABLE `santri___ijin` DROP PRIMARY KEY');
        $this->execute('ALTER TABLE `santri___ijin` CHANGE COLUMN `id` `id_legacy` VARCHAR(50) NOT NULL');
        $this->execute(
            'ALTER TABLE `santri___ijin` ADD COLUMN `id` INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY FIRST'
        );
        $this->execute('ALTER TABLE `santri___ijin` DROP COLUMN `id_legacy`');

        $this->execute('SET FOREIGN_KEY_CHECKS = 1');
    }

    public function down(): void
    {
        // Tidak mendukung rollback: mapping VARCHAR → INT tidak dapat dipulihkan.
    }
}

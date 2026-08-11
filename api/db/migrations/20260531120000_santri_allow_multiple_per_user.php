<?php

declare(strict_types=1);

use Phinx\Migration\AbstractMigration;

/**
 * Satu akun users boleh menautkan lebih dari satu baris santri (id_user tidak lagi unik).
 * Sebelumnya UNIQUE unique_santri_id_user membatasi satu santri per user.
 */
final class SantriAllowMultiplePerUser extends AbstractMigration
{
    public function up(): void
    {
        $rows = $this->fetchAll(
            "SELECT 1 FROM information_schema.STATISTICS
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'santri' AND INDEX_NAME = 'unique_santri_id_user'
             LIMIT 1"
        );
        if (!empty($rows)) {
            $this->execute('ALTER TABLE santri DROP INDEX unique_santri_id_user');
        }
    }

    public function down(): void
    {
        $this->execute('ALTER TABLE santri ADD UNIQUE KEY unique_santri_id_user (id_user)');
    }
}

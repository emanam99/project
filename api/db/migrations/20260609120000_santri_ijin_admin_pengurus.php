<?php

declare(strict_types=1);

use Phinx\Migration\AbstractMigration;

/**
 * santri___ijin: petugas yang mencatat ijin dan yang mencatat kembali (FK pengurus).
 */
final class SantriIjinAdminPengurus extends AbstractMigration
{
    public function up(): void
    {
        if (!$this->hasTable('santri___ijin')) {
            return;
        }

        try {
            $this->execute(
                'ALTER TABLE `santri___ijin` ADD COLUMN `admin_ijin` int(7) DEFAULT NULL AFTER `perpanjang_masehi`'
            );
        } catch (\Throwable $e) {
            if (stripos($e->getMessage(), 'Duplicate column') === false) {
                throw $e;
            }
        }

        try {
            $this->execute(
                'ALTER TABLE `santri___ijin` ADD COLUMN `admin_kembali` int(7) DEFAULT NULL AFTER `admin_ijin`'
            );
        } catch (\Throwable $e) {
            if (stripos($e->getMessage(), 'Duplicate column') === false) {
                throw $e;
            }
        }

        try {
            $this->execute(
                'ALTER TABLE `santri___ijin` ADD KEY `idx_santri_ijin_admin_ijin` (`admin_ijin`)'
            );
        } catch (\Throwable $e) {
            if (stripos($e->getMessage(), 'Duplicate key') === false) {
                throw $e;
            }
        }

        try {
            $this->execute(
                'ALTER TABLE `santri___ijin` ADD KEY `idx_santri_ijin_admin_kembali` (`admin_kembali`)'
            );
        } catch (\Throwable $e) {
            if (stripos($e->getMessage(), 'Duplicate key') === false) {
                throw $e;
            }
        }

        try {
            $this->execute(
                'ALTER TABLE `santri___ijin` ADD CONSTRAINT `fk_santri_ijin_admin_ijin` FOREIGN KEY (`admin_ijin`) REFERENCES `pengurus` (`id`) ON DELETE SET NULL ON UPDATE CASCADE'
            );
        } catch (\Throwable $e) {
            if (stripos($e->getMessage(), 'Duplicate') === false && stripos($e->getMessage(), 'already exists') === false) {
                throw $e;
            }
        }

        try {
            $this->execute(
                'ALTER TABLE `santri___ijin` ADD CONSTRAINT `fk_santri_ijin_admin_kembali` FOREIGN KEY (`admin_kembali`) REFERENCES `pengurus` (`id`) ON DELETE SET NULL ON UPDATE CASCADE'
            );
        } catch (\Throwable $e) {
            if (stripos($e->getMessage(), 'Duplicate') === false && stripos($e->getMessage(), 'already exists') === false) {
                throw $e;
            }
        }
    }

    public function down(): void
    {
        if (!$this->hasTable('santri___ijin')) {
            return;
        }

        try {
            $this->execute('ALTER TABLE `santri___ijin` DROP FOREIGN KEY `fk_santri_ijin_admin_kembali`');
        } catch (\Throwable $e) {
            // ignore
        }
        try {
            $this->execute('ALTER TABLE `santri___ijin` DROP FOREIGN KEY `fk_santri_ijin_admin_ijin`');
        } catch (\Throwable $e) {
            // ignore
        }
        try {
            $this->execute('ALTER TABLE `santri___ijin` DROP COLUMN `admin_kembali`');
        } catch (\Throwable $e) {
            // ignore
        }
        try {
            $this->execute('ALTER TABLE `santri___ijin` DROP COLUMN `admin_ijin`');
        } catch (\Throwable $e) {
            // ignore
        }
    }
}

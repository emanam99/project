<?php

declare(strict_types=1);

use Phinx\Migration\AbstractMigration;

/**
 * Tambah kategori rencana/realisasi pengeluaran: Rapat, Setoran.
 */
final class PengeluaranKategoriRapatSetoran extends AbstractMigration
{
    private const ENUM = "ENUM('Bisyaroh','Acara','Pengadaan','Perbaikan','ATK','lainnya','Listrik','Wifi','Langganan','Rapat','Setoran') DEFAULT NULL COMMENT 'Kategori pengeluaran'";

    public function up(): void
    {
        $this->execute('SET NAMES utf8mb4');
        $this->execute(
            'ALTER TABLE `pengeluaran___rencana` MODIFY COLUMN `kategori` ' . self::ENUM
        );
        $this->execute(
            'ALTER TABLE `pengeluaran` MODIFY COLUMN `kategori` ' . self::ENUM
        );
    }

    public function down(): void
    {
        $this->execute('SET NAMES utf8mb4');
        $old = "ENUM('Bisyaroh','Acara','Pengadaan','Perbaikan','ATK','lainnya','Listrik','Wifi','Langganan') DEFAULT NULL COMMENT 'Kategori pengeluaran'";
        $this->execute(
            "UPDATE `pengeluaran___rencana` SET `kategori` = 'lainnya' WHERE `kategori` IN ('Rapat','Setoran')"
        );
        $this->execute(
            "UPDATE `pengeluaran` SET `kategori` = 'lainnya' WHERE `kategori` IN ('Rapat','Setoran')"
        );
        $this->execute(
            'ALTER TABLE `pengeluaran___rencana` MODIFY COLUMN `kategori` ' . $old
        );
        $this->execute(
            'ALTER TABLE `pengeluaran` MODIFY COLUMN `kategori` ' . $old
        );
    }
}

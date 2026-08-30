<?php

declare(strict_types=1);

use Phinx\Migration\AbstractMigration;

/**
 * Tambah jenis pembayaran Cashless (top-up wallet myBeddian via gateway).
 * Sebelum migrasi ini, INSERT 'Cashless' ke enum lama tersimpan sebagai '' (kosong).
 */
final class PaymentJenisCashless extends AbstractMigration
{
    public function up(): void
    {
        $this->execute(
            "ALTER TABLE `payment` MODIFY COLUMN `jenis_pembayaran` "
            . "enum('Pendaftaran','Uwaba','Tunggakan','Khusus','Tabungan','Umroh','Cashless') NOT NULL"
        );

        $this->execute(
            "UPDATE `payment` SET `jenis_pembayaran` = 'Cashless' "
            . "WHERE `tabel_referensi` = 'cashless___accounts' "
            . "AND (`jenis_pembayaran` = '' OR `jenis_pembayaran` IS NULL)"
        );
    }

    public function down(): void
    {
        $this->execute(
            "UPDATE `payment` SET `jenis_pembayaran` = 'Tabungan' "
            . "WHERE `jenis_pembayaran` = 'Cashless'"
        );

        $this->execute(
            "ALTER TABLE `payment` MODIFY COLUMN `jenis_pembayaran` "
            . "enum('Pendaftaran','Uwaba','Tunggakan','Khusus','Tabungan','Umroh') NOT NULL"
        );
    }
}

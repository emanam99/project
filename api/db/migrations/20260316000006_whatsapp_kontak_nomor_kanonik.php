<?php

declare(strict_types=1);

use Phinx\Migration\AbstractMigration;

/**
 * Tambah nomor_kanonik di whatsapp___kontak: nomor dari form (No WA di pesan Daftar Notifikasi) untuk tampil/lookup.
 */
final class WhatsappKontakNomorKanonik extends AbstractMigration
{
    public function up(): void
    {
        $this->execute("ALTER TABLE `whatsapp___kontak` ADD COLUMN `nomor_kanonik` varchar(20) DEFAULT NULL COMMENT 'ID WA/LID (dari pengirim) jika baris ini nomor asli dari form; untuk lookup balas ke chat yang benar' AFTER `nomor`");
    }

    public function down(): void
    {
        $this->execute('ALTER TABLE `whatsapp___kontak` DROP COLUMN `nomor_kanonik`');
    }
}

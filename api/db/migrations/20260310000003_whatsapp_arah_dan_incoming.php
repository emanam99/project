<?php

declare(strict_types=1);

use Phinx\Migration\AbstractMigration;

/**
 * Tabel whatsapp: tambah kolom arah (keluar/masuk) untuk menyimpan pesan masuk.
 * Untuk pesan masuk: arah='masuk', nomor_tujuan = nomor pengirim, isi_pesan = isi.
 * wa_message_id: id pesan dari WA (untuk deduplikasi saat WA kirim ulang).
 */
final class WhatsappArahDanIncoming extends AbstractMigration
{
    public function up(): void
    {
        $this->execute('SET NAMES utf8mb4');

        // Kolom arah + wa_message_id: untuk pesan masuk dan deduplikasi retry
        $this->execute(<<<'SQL'
ALTER TABLE `whatsapp`
  ADD COLUMN `arah` enum('keluar','masuk') NOT NULL DEFAULT 'keluar'
    COMMENT 'keluar=pesan dikirim oleh sistem, masuk=pesan diterima dari WA'
    AFTER `response_message`,
  ADD COLUMN `wa_message_id` varchar(100) DEFAULT NULL
    COMMENT 'ID pesan dari WA (untuk deduplikasi retry)'
    AFTER `arah`
SQL
        );

        $this->execute('CREATE INDEX idx_whatsapp_arah ON whatsapp (arah)');
        $this->execute('CREATE INDEX idx_whatsapp_wa_message_id ON whatsapp (wa_message_id)');
    }

    public function down(): void
    {
        $this->execute('DROP INDEX idx_whatsapp_wa_message_id ON whatsapp');
        $this->execute('DROP INDEX idx_whatsapp_arah ON whatsapp');
        $this->execute('ALTER TABLE whatsapp DROP COLUMN wa_message_id');
        $this->execute('ALTER TABLE whatsapp DROP COLUMN arah');
    }
}

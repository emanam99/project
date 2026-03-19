<?php

declare(strict_types=1);

use Phinx\Migration\AbstractMigration;

/**
 * Isi whatsapp___kontak dari notifikasi yang sudah pernah terkirim (tabel whatsapp).
 * Untuk yang sudah menjalankan 20260316000001 sebelum ada backfill; atau isi ulang aman (INSERT IGNORE).
 */
final class WhatsappKontakBackfill extends AbstractMigration
{
    public function up(): void
    {
        $hasKontak = $this->fetchRow("SHOW TABLES LIKE 'whatsapp___kontak'");
        if (!$hasKontak) {
            return;
        }
        $hasTable = $this->fetchRow("SHOW TABLES LIKE 'whatsapp'");
        if (!$hasTable) {
            return;
        }
        $hasArah = $this->fetchRow("SHOW COLUMNS FROM whatsapp LIKE 'arah'");
        $whereArah = $hasArah ? "AND (arah = 'keluar' OR arah IS NULL)" : '';
        $sql = "INSERT IGNORE INTO `whatsapp___kontak` (nomor, siap_terima_notif)
SELECT DISTINCT nomor_tujuan, 1
FROM whatsapp
WHERE nomor_tujuan IS NOT NULL AND TRIM(nomor_tujuan) != '' AND LENGTH(TRIM(nomor_tujuan)) >= 10
{$whereArah}";
        $this->execute($sql);
    }

    public function down(): void
    {
        // Backfill tidak di-rollback (data kontak tetap dipakai)
    }
}

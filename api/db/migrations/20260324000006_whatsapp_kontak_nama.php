<?php

declare(strict_types=1);

use Phinx\Migration\AbstractMigration;

/**
 * Tambah kolom nama di whatsapp___kontak agar pelacakan kontak lebih mudah di UI.
 */
final class WhatsappKontakNama extends AbstractMigration
{
    public function up(): void
    {
        $hasNamaKontak = $this->fetchRow("SHOW COLUMNS FROM `whatsapp___kontak` LIKE 'nama'");
        if (!$hasNamaKontak) {
            $this->execute("ALTER TABLE `whatsapp___kontak` ADD COLUMN `nama` varchar(120) DEFAULT NULL COMMENT 'Nama kontak (jika diketahui dari flow daftar notifikasi)' AFTER `nomor`");
        }

        // Backfill nama dari daftar_notif_pending (jika tabel/kolom tersedia) berdasarkan nomor atau nomor_kanonik.
        $hasPending = $this->fetchRow("SHOW TABLES LIKE 'daftar_notif_pending'");
        if ($hasPending) {
            $hasNama = $this->fetchRow("SHOW COLUMNS FROM `daftar_notif_pending` LIKE 'nama'");
            if ($hasNama) {
                $this->execute(<<<'SQL'
UPDATE whatsapp___kontak k
JOIN daftar_notif_pending d ON d.nomor = k.nomor
SET k.nama = d.nama
WHERE (k.nama IS NULL OR TRIM(k.nama) = '')
  AND d.nomor IS NOT NULL
  AND TRIM(d.nomor) != ''
  AND d.nama IS NOT NULL
  AND TRIM(d.nama) != ''
SQL);

                $hasNomorKanonik = $this->fetchRow("SHOW COLUMNS FROM `daftar_notif_pending` LIKE 'nomor_kanonik'");
                if ($hasNomorKanonik) {
                    $this->execute(<<<'SQL'
UPDATE whatsapp___kontak k
JOIN daftar_notif_pending d ON d.nomor_kanonik = k.nomor
SET k.nama = d.nama
WHERE (k.nama IS NULL OR TRIM(k.nama) = '')
  AND d.nomor_kanonik IS NOT NULL
  AND TRIM(d.nomor_kanonik) != ''
  AND d.nama IS NOT NULL
  AND TRIM(d.nama) != ''
SQL);
                }
            }
        }
    }

    public function down(): void
    {
        $this->execute('ALTER TABLE `whatsapp___kontak` DROP COLUMN `nama`');
    }
}


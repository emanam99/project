<?php

declare(strict_types=1);

use Phinx\Migration\AbstractMigration;

/**
 * Tabel whatsapp___kontak: daftar nomor yang pernah/siap menerima notifikasi WA.
 * Nomor unik (tidak double). Setiap kirim notif ke nomor baru disimpan di sini.
 * siap_terima_notif: pengaturan per kontak (masing-masing user/kontak bisa menolak notif).
 */
final class WhatsappKontak extends AbstractMigration
{
    public function up(): void
    {
        $this->execute(<<<'SQL'
CREATE TABLE IF NOT EXISTS `whatsapp___kontak` (
  `id` int(11) unsigned NOT NULL AUTO_INCREMENT,
  `nomor` varchar(20) NOT NULL COMMENT 'Nomor WA format 62xxx, unik',
  `siap_terima_notif` tinyint(1) NOT NULL DEFAULT 1 COMMENT '1 = siap terima notif, 0 = tidak',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_nomor` (`nomor`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Kontak WA: nomor unik, pengaturan siap terima notif per kontak'
SQL);

        // Isi awal dari notifikasi yang sudah pernah terkirim (tabel whatsapp, pesan keluar)
        $hasTable = $this->fetchRow("SHOW TABLES LIKE 'whatsapp'");
        if ($hasTable) {
            $hasArah = $this->fetchRow("SHOW COLUMNS FROM whatsapp LIKE 'arah'");
            $whereArah = $hasArah ? "AND (arah = 'keluar' OR arah IS NULL)" : '';
            $sql = "INSERT IGNORE INTO `whatsapp___kontak` (nomor, siap_terima_notif)
SELECT DISTINCT nomor_tujuan, 1
FROM whatsapp
WHERE nomor_tujuan IS NOT NULL AND TRIM(nomor_tujuan) != '' AND LENGTH(TRIM(nomor_tujuan)) >= 10
{$whereArah}";
            $this->execute($sql);
        }
    }

    public function down(): void
    {
        $this->execute('DROP TABLE IF EXISTS `whatsapp___kontak`');
    }
}

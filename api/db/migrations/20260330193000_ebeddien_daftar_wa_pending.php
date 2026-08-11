<?php

declare(strict_types=1);

use Phinx\Migration\AbstractMigration;

/**
 * State percakapan aktivasi akun eBeddien via WA (setelah user kirim template dari wa.me).
 * Step 1 = tunggu jawaban sudah simpan nomor QR?; setelah "iya" kirim link setup-akun.
 */
final class EbeddienDaftarWaPending extends AbstractMigration
{
    public function up(): void
    {
        $this->execute(<<<'SQL'
CREATE TABLE IF NOT EXISTS `ebeddien_daftar_wa_pending` (
  `nomor` varchar(32) NOT NULL COMMENT 'Nomor chat (62xxx atau digit LID mentah)',
  `from_jid` varchar(128) DEFAULT NULL COMMENT 'JID asli WA bila ada',
  `step` tinyint(1) NOT NULL DEFAULT 1 COMMENT '1=tunggu jawaban simpan nomor',
  `token_plain` char(64) NOT NULL COMMENT 'Token setup akun (sekali pakai, sinkron user___setup_tokens)',
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`nomor`),
  KEY `idx_ebeddien_daftar_wa_pending_updated` (`updated_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
SQL);
    }

    public function down(): void
    {
        $this->execute('DROP TABLE IF EXISTS `ebeddien_daftar_wa_pending`');
    }
}

<?php

declare(strict_types=1);

use Phinx\Migration\AbstractMigration;

/**
 * Pengaturan instansi untuk AI WhatsApp + kontak pengirim (JID terpisah dari nomor).
 * Preferensi mode chat web (utama/alternatif) per user.
 */
final class AiWaInstansiPengaturan extends AbstractMigration
{
    public function up(): void
    {
        $this->execute(<<<'SQL'
CREATE TABLE IF NOT EXISTS `ai___wa_instansi_pengaturan` (
  `id` tinyint unsigned NOT NULL DEFAULT 1,
  `ai_wa_aktif` tinyint(1) NOT NULL DEFAULT 1 COMMENT 'Master: mati = tidak ada balasan AI WA (aktivasi token tetap lewat alur lain jika perlu)',
  `terima_semua_pengirim` tinyint(1) NOT NULL DEFAULT 0 COMMENT '1 = balas siapa pun yang chat ke nomor WA lembaga',
  `kuota_users_id` int(11) DEFAULT NULL COMMENT 'users.id untuk limit harian + FK ai___chat pengunjung tak terdaftar',
  `updated_at` datetime DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_kuota_user` (`kuota_users_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
SQL);

        $this->execute(
            "INSERT IGNORE INTO `ai___wa_instansi_pengaturan` (`id`, `ai_wa_aktif`, `terima_semua_pengirim`, `kuota_users_id`) "
            . "VALUES (1, 1, 0, NULL)"
        );

        $this->execute(<<<'SQL'
CREATE TABLE IF NOT EXISTS `ai___wa_obrolan_kontak` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `wa_jid` varchar(190) NOT NULL COMMENT 'JID penuh Baileys; tidak dicampur ke kolom nomor',
  `phone_normalized` varchar(32) DEFAULT NULL COMMENT 'Hanya digit MSISDN (62…); NULL untuk @lid',
  `first_seen_at` datetime NOT NULL DEFAULT current_timestamp(),
  `last_seen_at` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_wa_jid` (`wa_jid`),
  KEY `idx_phone_norm` (`phone_normalized`),
  KEY `idx_last_seen` (`last_seen_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
SQL);

        if ($this->hasTable('users') && !$this->migrationColumnExists('users', 'ai_chat_mode_pref')) {
            $this->execute(
                "ALTER TABLE `users` ADD COLUMN `ai_chat_mode_pref` varchar(16) NOT NULL DEFAULT 'api' "
                . "COMMENT 'api|proxy — preferensi tab Obrolan Chat AI'"
            );
        }
    }

    public function down(): void
    {
        if ($this->hasTable('users') && $this->migrationColumnExists('users', 'ai_chat_mode_pref')) {
            $this->execute('ALTER TABLE `users` DROP COLUMN `ai_chat_mode_pref`');
        }
        $this->execute('DROP TABLE IF EXISTS `ai___wa_obrolan_kontak`');
        $this->execute('DROP TABLE IF EXISTS `ai___wa_instansi_pengaturan`');
    }

    private function migrationColumnExists(string $table, string $column): bool
    {
        $t = str_replace('`', '``', $table);
        $c = str_replace('`', '``', $column);
        $rows = $this->fetchAll("SHOW COLUMNS FROM `{$t}` LIKE '{$c}'");

        return is_array($rows) && count($rows) > 0;
    }
}

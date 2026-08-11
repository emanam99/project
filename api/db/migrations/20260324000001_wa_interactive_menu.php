<?php

declare(strict_types=1);

use Phinx\Migration\AbstractMigration;

/**
 * Menu balasan otomatis WA (pohon + trigger), sesi per nomor/JID.
 * Nama tabel mengikuti pola whatsapp___* seperti tabel lain.
 */
final class WaInteractiveMenu extends AbstractMigration
{
    public function up(): void
    {
        $this->execute(<<<'SQL'
CREATE TABLE IF NOT EXISTS `whatsapp___menu_node` (
  `id` int UNSIGNED NOT NULL AUTO_INCREMENT,
  `parent_id` int UNSIGNED DEFAULT NULL,
  `sort_order` int NOT NULL DEFAULT 0,
  `title` varchar(255) NOT NULL DEFAULT '',
  `body_text` mediumtext,
  `triggers_json` text,
  `action_type` varchar(32) NOT NULL DEFAULT 'menu',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_parent_sort` (`parent_id`, `sort_order`),
  CONSTRAINT `fk_whatsapp_menu_node_parent` FOREIGN KEY (`parent_id`) REFERENCES `whatsapp___menu_node` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
SQL);

        $this->execute(<<<'SQL'
CREATE TABLE IF NOT EXISTS `whatsapp___menu_session` (
  `session_key` varchar(192) NOT NULL,
  `nomor` varchar(32) NOT NULL,
  `from_jid` varchar(160) DEFAULT NULL,
  `current_node_id` int UNSIGNED DEFAULT NULL,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`session_key`),
  KEY `idx_nomor` (`nomor`),
  KEY `idx_jid` (`from_jid`),
  CONSTRAINT `fk_whatsapp_menu_session_node` FOREIGN KEY (`current_node_id`) REFERENCES `whatsapp___menu_node` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
SQL);

        $this->execute("INSERT IGNORE INTO `app___settings` (`key`, `value`) VALUES ('wa_interactive_menu_enabled', '0')");
    }

    public function down(): void
    {
        $this->execute('DROP TABLE IF EXISTS `whatsapp___menu_session`');
        $this->execute('DROP TABLE IF EXISTS `whatsapp___menu_node`');
        $this->execute("DELETE FROM `app___settings` WHERE `key` = 'wa_interactive_menu_enabled'");
    }
}

<?php

declare(strict_types=1);

use Phinx\Migration\AbstractMigration;

/**
 * Selector kode fitur untuk EbeddienFiturMiddleware — sumber utama di DB (seed EbeddienFiturSelectorSeed).
 * Fallback PHP di EbeddienFiturAccessDefinitions jika baris belum ada.
 */
final class EbeddienFiturSelector extends AbstractMigration
{
    public function up(): void
    {
        $this->execute(<<<'SQL'
CREATE TABLE IF NOT EXISTS `ebeddien_fitur_selector` (
  `selector_key` varchar(64) NOT NULL COMMENT 'nama method EbeddienFiturAccess, mis. financeMenus',
  `codes_json` json NOT NULL COMMENT 'array string: kode menu/aksi atau PREFIX:...',
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`selector_key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci ROW_FORMAT=DYNAMIC
SQL);
    }

    public function down(): void
    {
        $this->execute('DROP TABLE IF EXISTS `ebeddien_fitur_selector`');
    }
}

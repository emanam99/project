<?php

declare(strict_types=1);

use Phinx\Migration\AbstractMigration;

/**
 * Limit global per pengunjung: rentang besar (INT UNSIGNED), bukan smallint.
 */
final class WaGlobalLimitIntUnsigned extends AbstractMigration
{
    public function up(): void
    {
        if (!$this->hasTable('ai___wa_instansi_pengaturan')) {
            return;
        }
        if (!$this->tableHasColumn('ai___wa_instansi_pengaturan', 'wa_global_harian_per_pengirim')) {
            return;
        }
        $this->execute(
            'ALTER TABLE `ai___wa_instansi_pengaturan` MODIFY COLUMN `wa_global_harian_per_pengirim` '
            . 'int unsigned NOT NULL DEFAULT 10 COMMENT \'Maks balasan AI per pengunjung global per hari (per MSISDN atau per JID @lid)\''
        );
    }

    public function down(): void
    {
        if (!$this->hasTable('ai___wa_instansi_pengaturan') || !$this->tableHasColumn('ai___wa_instansi_pengaturan', 'wa_global_harian_per_pengirim')) {
            return;
        }
        $this->execute(
            'ALTER TABLE `ai___wa_instansi_pengaturan` MODIFY COLUMN `wa_global_harian_per_pengirim` '
            . 'smallint unsigned NOT NULL DEFAULT 10 COMMENT \'Maks balasan AI per pengunjung global per hari (per JID)\''
        );
    }

    private function tableHasColumn(string $table, string $column): bool
    {
        $t = str_replace('`', '``', $table);
        $c = str_replace('`', '``', $column);
        $rows = $this->fetchAll("SHOW COLUMNS FROM `{$t}` LIKE '{$c}'");

        return is_array($rows) && count($rows) > 0;
    }
}

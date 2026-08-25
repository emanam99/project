<?php

declare(strict_types=1);

use Phinx\Migration\AbstractMigration;

/**
 * Ambang belanja wajib PIN kartu santri — bisa diubah admin di Pengaturan Cashless.
 * Default 10000 (perilaku lama di kode).
 */
final class CashlessBatasPinBelanja extends AbstractMigration
{
    public function up(): void
    {
        if (!$this->hasTable('cashless___config')) {
            return;
        }
        $this->execute(
            "INSERT IGNORE INTO `cashless___config` (`kunci`, `nilai`) VALUES ('batas_pin_belanja', '10000')"
        );
    }

    public function down(): void
    {
        if (!$this->hasTable('cashless___config')) {
            return;
        }
        $this->execute("DELETE FROM `cashless___config` WHERE `kunci` = 'batas_pin_belanja'");
    }
}

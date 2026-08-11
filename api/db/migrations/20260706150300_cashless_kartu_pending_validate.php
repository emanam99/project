<?php

declare(strict_types=1);

use Phinx\Migration\AbstractMigration;

/**
 * Kartu pending sampai discan setelah cetak; validasi mengaktifkan & mencabut kartu aktif lama.
 */
final class CashlessKartuPendingValidate extends AbstractMigration
{
    public function up(): void
    {
        if (!$this->hasTable('cashless___kartu')) {
            return;
        }

        $this->execute(
            "ALTER TABLE `cashless___kartu`
             MODIFY COLUMN `status` enum('pending','active','revoked') NOT NULL DEFAULT 'pending'
             COMMENT 'pending=menunggu scan setelah cetak; active=divalidasi'"
        );

        $table = $this->table('cashless___kartu');
        if (!$table->hasColumn('validated_at')) {
            $table->addColumn('validated_at', 'timestamp', [
                'null' => true,
                'default' => null,
                'after' => 'printed_by',
            ])->update();
        }
        if (!$table->hasColumn('validated_by')) {
            $table->addColumn('validated_by', 'integer', [
                'null' => true,
                'default' => null,
                'signed' => false,
                'after' => 'validated_at',
            ])->update();
        }

        // Kartu aktif lama tetap active; yang baru diterbitkan setelah migrasi tetap bisa dipakai.
        $this->execute("UPDATE `cashless___kartu` SET `status` = 'active' WHERE `status` = 'pending' AND `validated_at` IS NULL AND `printed_at` IS NOT NULL");
        $this->execute("UPDATE `cashless___kartu` SET `status` = 'active', `validated_at` = COALESCE(`printed_at`, `issued_at`) WHERE `status` = 'pending' AND `printed_at` IS NULL");
    }

    public function down(): void
    {
        if (!$this->hasTable('cashless___kartu')) {
            return;
        }
        $this->execute("UPDATE `cashless___kartu` SET `status` = 'active' WHERE `status` = 'pending'");
        $table = $this->table('cashless___kartu');
        if ($table->hasColumn('validated_by')) {
            $table->removeColumn('validated_by')->update();
        }
        if ($table->hasColumn('validated_at')) {
            $table->removeColumn('validated_at')->update();
        }
        $this->execute(
            "ALTER TABLE `cashless___kartu`
             MODIFY COLUMN `status` enum('active','revoked') NOT NULL DEFAULT 'active'"
        );
    }
}

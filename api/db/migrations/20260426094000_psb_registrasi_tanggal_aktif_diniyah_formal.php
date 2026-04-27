<?php

declare(strict_types=1);

use Phinx\Migration\AbstractMigration;

final class PsbRegistrasiTanggalAktifDiniyahFormal extends AbstractMigration
{
    public function up(): void
    {
        if (!$this->hasTable('psb___registrasi')) {
            return;
        }

        $table = $this->table('psb___registrasi');

        if (!$table->hasColumn('tanggal_aktif_diniyah')) {
            $this->execute(
                "ALTER TABLE `psb___registrasi` ADD COLUMN `tanggal_aktif_diniyah` DATETIME DEFAULT NULL COMMENT 'Tanggal aktif di diniyah' AFTER `tanggal_aktif_pondok`"
            );
        }

        if (!$table->hasColumn('tanggal_aktif_formal')) {
            $this->execute(
                "ALTER TABLE `psb___registrasi` ADD COLUMN `tanggal_aktif_formal` DATETIME DEFAULT NULL COMMENT 'Tanggal aktif di formal' AFTER `tanggal_aktif_diniyah`"
            );
        }
    }

    public function down(): void
    {
        if (!$this->hasTable('psb___registrasi')) {
            return;
        }

        $table = $this->table('psb___registrasi');

        if ($table->hasColumn('tanggal_aktif_formal')) {
            $this->execute('ALTER TABLE `psb___registrasi` DROP COLUMN `tanggal_aktif_formal`');
        }

        if ($table->hasColumn('tanggal_aktif_diniyah')) {
            $this->execute('ALTER TABLE `psb___registrasi` DROP COLUMN `tanggal_aktif_diniyah`');
        }
    }
}

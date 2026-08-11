<?php

declare(strict_types=1);

use Phinx\Migration\AbstractMigration;

final class PsbRegistrasiWaPendaftar extends AbstractMigration
{
    public function up(): void
    {
        if (!$this->hasTable('psb___registrasi')) {
            return;
        }
        $table = $this->table('psb___registrasi');
        if (!$table->hasColumn('no_wa_tercatat')) {
            $this->execute(
                "ALTER TABLE `psb___registrasi`
                 ADD COLUMN `no_wa_tercatat` VARCHAR(20) NULL DEFAULT NULL
                 COMMENT 'Nomor WA diisi di form login daftar'
                 AFTER `id_admin`"
            );
        }
        if (!$table->hasColumn('no_wa_pengirim')) {
            $this->execute(
                "ALTER TABLE `psb___registrasi`
                 ADD COLUMN `no_wa_pengirim` VARCHAR(20) NULL DEFAULT NULL
                 COMMENT 'Nomor WA yang mengirim token verifikasi'
                 AFTER `no_wa_tercatat`"
            );
        }
    }

    public function down(): void
    {
        if (!$this->hasTable('psb___registrasi')) {
            return;
        }
        $table = $this->table('psb___registrasi');
        if ($table->hasColumn('no_wa_pengirim')) {
            $this->execute('ALTER TABLE `psb___registrasi` DROP COLUMN `no_wa_pengirim`');
        }
        if ($table->hasColumn('no_wa_tercatat')) {
            $this->execute('ALTER TABLE `psb___registrasi` DROP COLUMN `no_wa_tercatat`');
        }
    }
}

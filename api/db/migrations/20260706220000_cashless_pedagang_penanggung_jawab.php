<?php

declare(strict_types=1);

use Phinx\Migration\AbstractMigration;

/**
 * Data penanggung jawab toko cashless: nama, NIK, foto, scan KTP.
 */
final class CashlessPedagangPenanggungJawab extends AbstractMigration
{
    public function up(): void
    {
        $table = $this->table('cashless___pedagang');
        if (!$table->hasColumn('penanggung_jawab_nama')) {
            $table->addColumn('penanggung_jawab_nama', 'string', [
                'limit' => 255,
                'null' => true,
                'after' => 'foto_path',
            ])->update();
        }
        $table = $this->table('cashless___pedagang');
        if (!$table->hasColumn('penanggung_jawab_nik')) {
            $table->addColumn('penanggung_jawab_nik', 'string', [
                'limit' => 20,
                'null' => true,
                'after' => 'penanggung_jawab_nama',
            ])->update();
        }
        $table = $this->table('cashless___pedagang');
        if (!$table->hasColumn('penanggung_jawab_ktp_path')) {
            $table->addColumn('penanggung_jawab_ktp_path', 'string', [
                'limit' => 500,
                'null' => true,
                'after' => 'penanggung_jawab_nik',
            ])->update();
        }
        $table = $this->table('cashless___pedagang');
        if (!$table->hasColumn('penanggung_jawab_foto_path')) {
            $table->addColumn('penanggung_jawab_foto_path', 'string', [
                'limit' => 500,
                'null' => true,
                'after' => 'penanggung_jawab_ktp_path',
            ])->update();
        }
    }

    public function down(): void
    {
        $table = $this->table('cashless___pedagang');
        foreach (['penanggung_jawab_foto_path', 'penanggung_jawab_ktp_path', 'penanggung_jawab_nik', 'penanggung_jawab_nama'] as $col) {
            if ($table->hasColumn($col)) {
                $table->removeColumn($col)->update();
            }
            $table = $this->table('cashless___pedagang');
        }
    }
}

<?php

declare(strict_types=1);

use Phinx\Migration\AbstractMigration;

/**
 * Gelombang tes (1–5) — terpisah dari gelombang pendaftaran di psb___registrasi.
 */
final class AddGelombangToPsbTes extends AbstractMigration
{
    public function up(): void
    {
        if (!$this->hasTable('psb___tes')) {
            return;
        }

        $table = $this->table('psb___tes');
        if (!$table->hasColumn('gelombang')) {
            $table->addColumn('gelombang', 'string', [
                'limit' => 10,
                'null' => true,
                'default' => null,
                'comment' => 'Gelombang tes masuk (1-5), bukan gelombang pendaftaran',
                'after' => 'tahun_masehi',
            ])->update();
        }
    }

    public function down(): void
    {
        if (!$this->hasTable('psb___tes')) {
            return;
        }

        $table = $this->table('psb___tes');
        if ($table->hasColumn('gelombang')) {
            $table->removeColumn('gelombang')->update();
        }
    }
}

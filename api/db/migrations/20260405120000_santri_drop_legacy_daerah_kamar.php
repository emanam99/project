<?php

declare(strict_types=1);

use Phinx\Migration\AbstractMigration;

/**
 * Hapus kolom legacy santri.daerah & santri.kamar — domisili hanya id_kamar + join daerah___kamar/daerah.
 * Pastikan migrasi 20250303000015 sudah jalan (backfill id_kamar) sebelum ini.
 */
final class SantriDropLegacyDaerahKamar extends AbstractMigration
{
    public function up(): void
    {
        $santri = $this->table('santri');
        if ($santri->hasColumn('daerah')) {
            $santri->removeColumn('daerah')->update();
        }
        if ($santri->hasColumn('kamar')) {
            $santri->removeColumn('kamar')->update();
        }
    }

    public function down(): void
    {
        $santri = $this->table('santri');
        if (!$santri->hasColumn('daerah')) {
            $santri->addColumn('daerah', 'string', ['limit' => 50, 'null' => true])->update();
        }
        if (!$santri->hasColumn('kamar')) {
            $santri->addColumn('kamar', 'string', ['limit' => 50, 'null' => true])->update();
        }
    }
}

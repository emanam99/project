<?php

declare(strict_types=1);

use Phinx\Migration\AbstractMigration;

/**
 * Log ack «Terima kasih. permintaan sedang diproses» — max 1× per nomor WA per bulan kalender.
 */
final class WaPermintaanProsesAck extends AbstractMigration
{
    public function change(): void
    {
        if ($this->hasTable('wa_permintaan_proses_ack')) {
            return;
        }
        $this->table('wa_permintaan_proses_ack', ['id' => false, 'primary_key' => ['id']])
            ->addColumn('id', 'integer', ['identity' => true, 'signed' => false])
            ->addColumn('no_wa', 'string', ['limit' => 20, 'null' => false])
            ->addColumn('tahun_bulan', 'string', ['limit' => 7, 'null' => false]) // YYYY-MM
            ->addColumn('sent_at', 'datetime', ['null' => false, 'default' => 'CURRENT_TIMESTAMP'])
            ->addIndex(['no_wa', 'tahun_bulan'], ['unique' => true, 'name' => 'uq_wa_permintaan_proses_ack_wa_bulan'])
            ->create();
    }
}

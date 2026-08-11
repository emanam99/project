<?php

declare(strict_types=1);

use Phinx\Migration\AbstractMigration;

/**
 * Tambah kolom kode_barang (QR/barcode) di cashless___barang.
 * Unik per toko (pedagang_id). Kosongkan saat input = kode otomatis (B0001, B0002, ...).
 */
final class CashlessBarangKode extends AbstractMigration
{
    public function up(): void
    {
        $table = $this->table('cashless___barang');
        if (!$table->hasColumn('kode_barang')) {
            $table->addColumn('kode_barang', 'string', ['limit' => 100, 'null' => true, 'after' => 'pedagang_id'])
                ->update();
        }

        $this->execute("UPDATE cashless___barang SET kode_barang = CONCAT('B', LPAD(id, 4, '0')) WHERE kode_barang IS NULL OR kode_barang = ''");
        $this->execute("ALTER TABLE cashless___barang MODIFY COLUMN kode_barang VARCHAR(100) NOT NULL DEFAULT ''");
        $this->execute("ALTER TABLE cashless___barang ADD UNIQUE KEY unique_pedagang_kode (pedagang_id, kode_barang)");
    }

    public function down(): void
    {
        $this->execute('ALTER TABLE cashless___barang DROP INDEX unique_pedagang_kode');
        $table = $this->table('cashless___barang');
        if ($table->hasColumn('kode_barang')) {
            $table->removeColumn('kode_barang')->update();
        }
    }
}

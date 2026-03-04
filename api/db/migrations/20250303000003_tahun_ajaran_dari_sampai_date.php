<?php

declare(strict_types=1);

use Phinx\Migration\AbstractMigration;

/**
 * Ubah kolom dari & sampai di tabel tahun_ajaran menjadi tipe DATE.
 *
 * Strategi:
 * - Tambah kolom sementara dari_tanggal & sampai_tanggal (DATE)
 * - Isi nilainya dari kolom INT lama (YYYY-01-01 dan YYYY-12-31)
 * - Hapus kolom INT lama, lalu rename kolom DATE ke dari & sampai
 */
final class TahunAjaranDariSampaiDate extends AbstractMigration
{
    public function up(): void
    {
        $this->execute('SET FOREIGN_KEY_CHECKS = 0');

        if ($this->hasTable('tahun_ajaran')) {
            $table = $this->table('tahun_ajaran');

            // Tambah kolom DATE sementara jika belum ada
            if (!$table->hasColumn('dari_tanggal')) {
                $table
                    ->addColumn('dari_tanggal', 'date', ['null' => true, 'comment' => 'Tanggal awal tahun ajaran'])
                    ->addColumn('sampai_tanggal', 'date', ['null' => true, 'comment' => 'Tanggal akhir tahun ajaran'])
                    ->save();
            }

            // Migrasi data dari INT ke DATE (asumsi awal & akhir tahun)
            $this->execute("
                UPDATE tahun_ajaran
                SET 
                    dari_tanggal = CASE 
                        WHEN dari IS NOT NULL THEN STR_TO_DATE(CONCAT(dari, '-01-01'), '%Y-%m-%d')
                        ELSE NULL
                    END,
                    sampai_tanggal = CASE 
                        WHEN sampai IS NOT NULL THEN STR_TO_DATE(CONCAT(sampai, '-12-31'), '%Y-%m-%d')
                        ELSE NULL
                    END
            ");

            // Hapus kolom INT lama dan rename kolom DATE ke nama asli
            if ($table->hasColumn('dari')) {
                $table->removeColumn('dari')->save();
            }
            if ($table->hasColumn('sampai')) {
                $table->removeColumn('sampai')->save();
            }

            // Ambil ulang definisi tabel setelah drop kolom
            $table = $this->table('tahun_ajaran');

            if ($table->hasColumn('dari_tanggal')) {
                $table->renameColumn('dari_tanggal', 'dari')->save();
            }
            if ($table->hasColumn('sampai_tanggal')) {
                $table->renameColumn('sampai_tanggal', 'sampai')->save();
            }
        }

        $this->execute('SET FOREIGN_KEY_CHECKS = 1');
    }

    public function down(): void
    {
        $this->execute('SET FOREIGN_KEY_CHECKS = 0');

        if ($this->hasTable('tahun_ajaran')) {
            $table = $this->table('tahun_ajaran');

            // Tambah kolom INT sementara untuk rollback
            if (!$table->hasColumn('dari_int')) {
                $table
                    ->addColumn('dari_int', 'integer', ['null' => true, 'comment' => 'Tahun awal (INT)'])
                    ->addColumn('sampai_int', 'integer', ['null' => true, 'comment' => 'Tahun akhir (INT)'])
                    ->save();
            }

            // Isi kembali dari tahun (YEAR) dari kolom DATE
            $this->execute("
                UPDATE tahun_ajaran
                SET 
                    dari_int = CASE 
                        WHEN dari IS NOT NULL THEN YEAR(dari)
                        ELSE NULL
                    END,
                    sampai_int = CASE 
                        WHEN sampai IS NOT NULL THEN YEAR(sampai)
                        ELSE NULL
                    END
            ");

            // Hapus kolom DATE dan rename INT ke nama asli
            if ($table->hasColumn('dari')) {
                $table->removeColumn('dari')->save();
            }
            if ($table->hasColumn('sampai')) {
                $table->removeColumn('sampai')->save();
            }

            $table = $this->table('tahun_ajaran');

            if ($table->hasColumn('dari_int')) {
                $table->renameColumn('dari_int', 'dari')->save();
            }
            if ($table->hasColumn('sampai_int')) {
                $table->renameColumn('sampai_int', 'sampai')->save();
            }
        }

        $this->execute('SET FOREIGN_KEY_CHECKS = 1');
    }
}


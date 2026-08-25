<?php

declare(strict_types=1);

use Phinx\Migration\AbstractMigration;

/**
 * Data ijin: catat kembali otomatis jika deadline Masehi lewat >30 hari;
 * hapus duplikat (id_santri + dari + sampai sama), sisakan id terkecil.
 */
final class IjinCleanupKembaliDanDuplikat extends AbstractMigration
{
    public function up(): void
    {
        if (!$this->hasTable('santri___ijin')) {
            return;
        }

        $deadline = "COALESCE(NULLIF(TRIM(perpanjang_masehi), ''), NULLIF(TRIM(sampai_masehi), ''), NULLIF(TRIM(dari_masehi), ''))";

        $this->execute(
            "UPDATE santri___ijin
             SET tanggal_kembali = CURDATE()
             WHERE tanggal_kembali IS NULL
               AND {$deadline} IS NOT NULL
               AND {$deadline} <> ''
               AND {$deadline} REGEXP '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
               AND DATEDIFF(CURDATE(), {$deadline}) > 30"
        );

        // Hapus duplikat: santri + dari + sampai sama (keduanya terisi), keep MIN(id)
        $this->execute(
            'DELETE i FROM santri___ijin i
             INNER JOIN (
               SELECT id_santri, dari, sampai, MIN(id) AS keep_id
               FROM santri___ijin
               WHERE dari IS NOT NULL AND TRIM(dari) <> \'\'
                 AND sampai IS NOT NULL AND TRIM(sampai) <> \'\'
               GROUP BY id_santri, dari, sampai
               HAVING COUNT(*) > 1
             ) d ON i.id_santri = d.id_santri
                AND i.dari = d.dari
                AND i.sampai = d.sampai
                AND i.id <> d.keep_id'
        );
    }

    public function down(): void
    {
        // Data cleanup tidak bisa di-rollback aman.
    }
}

<?php

declare(strict_types=1);

use App\Helpers\AlumniHelper;
use Phinx\Migration\AbstractMigration;

/**
 * Perbaiki alumni.tahun_boyong_masehi yang tidak konsisten dengan tahun_boyong_hijriyah.
 * Contoh: hijriyah 1446 benar, masehi 2029 (dari seed normalizeYear "2029-2030" di boyong).
 * Idempotent: hanya UPDATE baris yang masehi null/inkonsisten; hijriyah tidak diubah.
 */
final class AlumniFixTahunBoyongMasehi extends AbstractMigration
{
    public function up(): void
    {
        if (!$this->hasTable('alumni')) {
            return;
        }

        $pdo = $this->getAdapter()->getConnection();
        $rows = $pdo->query(
            'SELECT id, tahun_boyong_masehi, tahun_boyong_hijriyah
             FROM alumni
             WHERE tahun_boyong_hijriyah IS NOT NULL
               AND TRIM(tahun_boyong_hijriyah) <> \'\''
        )->fetchAll(\PDO::FETCH_ASSOC);

        if (!$rows) {
            return;
        }

        $update = $pdo->prepare(
            'UPDATE alumni SET tahun_boyong_masehi = ? WHERE id = ? AND (
                tahun_boyong_masehi IS NULL
                OR TRIM(tahun_boyong_masehi) = \'\'
                OR tahun_boyong_masehi <> ?
             )'
        );

        $fixed = 0;
        foreach ($rows as $row) {
            $h = AlumniHelper::normalizeYear($row['tahun_boyong_hijriyah'] ?? null);
            if ($h === null || strlen($h) < 4 || (int) $h < 1300) {
                continue;
            }

            $m = AlumniHelper::normalizeYear($row['tahun_boyong_masehi'] ?? null);
            if (
                $m !== null
                && AlumniHelper::isMasehiConsistentWithHijriyah((int) $m, (int) $h)
            ) {
                continue;
            }

            $expected = AlumniHelper::hijriyahYearToMasehiYear($pdo, (int) $h);
            if ($expected === null) {
                continue;
            }
            if ($m !== null && $m === $expected) {
                continue;
            }

            $update->execute([$expected, (int) $row['id'], $expected]);
            if ($update->rowCount() > 0) {
                $fixed++;
            }
        }

        if ($fixed > 0) {
            error_log("AlumniFixTahunBoyongMasehi: updated {$fixed} row(s)");
        }
    }

    public function down(): void
    {
        // Data koreksi satu arah; tidak mengembalikan nilai masehi yang salah.
    }
}

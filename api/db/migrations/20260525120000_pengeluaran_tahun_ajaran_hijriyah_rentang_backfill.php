<?php

declare(strict_types=1);

use App\Helpers\KalenderHelper;
use App\Helpers\TahunAjaranActiveHelper;
use Phinx\Migration\AbstractMigration;

/**
 * Sesuaikan tahun_ajaran rencana & pengeluaran ke TA hijriyah yang rentang masehi-nya
 * mencakup tanggal acuan (kolom hijriyah → konversi kalender, atau tanggal_dibuat).
 */
final class PengeluaranTahunAjaranHijriyahRentangBackfill extends AbstractMigration
{
    public function up(): void
    {
        require dirname(__DIR__, 2) . '/vendor/autoload.php';

        if (!$this->hasTable('tahun_ajaran')) {
            return;
        }

        $pdo = $this->getAdapter()->getConnection();
        $updatedRencana = 0;
        $updatedPengeluaran = 0;

        if ($this->hasTable('pengeluaran___rencana')) {
            $updatedRencana = $this->backfillTable($pdo, 'pengeluaran___rencana');
        }
        if ($this->hasTable('pengeluaran')) {
            $updatedPengeluaran = $this->backfillTable($pdo, 'pengeluaran');
        }

        if ($updatedRencana > 0 || $updatedPengeluaran > 0) {
            error_log(sprintf(
                'PengeluaranTahunAjaranHijriyahRentangBackfill: %d rencana, %d pengeluaran diperbarui.',
                $updatedRencana,
                $updatedPengeluaran
            ));
        }
    }

    public function down(): void
    {
        // Tidak reversible tanpa backup kolom lama.
    }

    private function backfillTable(\PDO $pdo, string $table): int
    {
        $stmt = $pdo->query(
            'SELECT id, hijriyah, tahun_ajaran, tanggal_dibuat FROM `' . str_replace('`', '``', $table) . '`'
        );
        if ($stmt === false) {
            return 0;
        }

        $upd = $pdo->prepare(
            'UPDATE `' . str_replace('`', '``', $table) . '` SET tahun_ajaran = ? WHERE id = ?'
        );
        $count = 0;

        while ($row = $stmt->fetch(\PDO::FETCH_ASSOC)) {
            $id = (int) ($row['id'] ?? 0);
            if ($id < 1) {
                continue;
            }

            $masehiRef = $this->resolveMasehiReference($pdo, $row);
            if ($masehiRef === null) {
                continue;
            }

            $resolved = TahunAjaranActiveHelper::resolveHijriyahKonteksForMasehiDate($pdo, $masehiRef);
            $newTa = isset($resolved['tahun_ajaran']) ? trim((string) $resolved['tahun_ajaran']) : '';
            if ($newTa === '') {
                continue;
            }

            $current = trim((string) ($row['tahun_ajaran'] ?? ''));
            if ($current === $newTa) {
                continue;
            }

            $upd->execute([$newTa, $id]);
            ++$count;
        }

        return $count;
    }

    /**
     * @param array<string, mixed> $row
     */
    private function resolveMasehiReference(\PDO $pdo, array $row): ?string
    {
        $hijriRaw = trim((string) ($row['hijriyah'] ?? ''));
        if ($hijriRaw !== '') {
            $hijriYmd = substr($hijriRaw, 0, 10);
            if (preg_match('/^\d{4}-\d{2}-\d{2}$/', $hijriYmd)) {
                $fromKalender = KalenderHelper::hijriyahToMasehi($pdo, $hijriYmd);
                if ($fromKalender !== null && preg_match('/^\d{4}-\d{2}-\d{2}$/', $fromKalender)) {
                    return $fromKalender;
                }
            }
        }

        $created = $row['tanggal_dibuat'] ?? null;
        if ($created !== null && $created !== '') {
            $ts = strtotime((string) $created);
            if ($ts !== false) {
                return date('Y-m-d', $ts);
            }
        }

        return null;
    }
}

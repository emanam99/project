<?php

declare(strict_types=1);

use App\Helpers\TahunAjaranActiveHelper;
use Phinx\Migration\AbstractMigration;

/**
 * Sesuaikan tahun_ajaran pemasukan ke TA hijriyah menurut rentang masehi master
 * (sama seperti backfill pengeluaran/rencana).
 */
final class PemasukanTahunAjaranHijriyahRentangBackfill extends AbstractMigration
{
    public function up(): void
    {
        require dirname(__DIR__, 2) . '/vendor/autoload.php';

        if (!$this->hasTable('tahun_ajaran') || !$this->hasTable('pemasukan')) {
            return;
        }

        $pdo = $this->getAdapter()->getConnection();
        $stmt = $pdo->query('SELECT id, hijriyah, tahun_ajaran, tanggal_dibuat FROM pemasukan');
        if ($stmt === false) {
            return;
        }

        $upd = $pdo->prepare('UPDATE pemasukan SET tahun_ajaran = ? WHERE id = ?');
        $count = 0;

        while ($row = $stmt->fetch(\PDO::FETCH_ASSOC)) {
            $id = (int) ($row['id'] ?? 0);
            if ($id < 1) {
                continue;
            }

            $masehiRef = null;
            $created = $row['tanggal_dibuat'] ?? null;
            if ($created !== null && $created !== '') {
                $ts = strtotime((string) $created);
                if ($ts !== false) {
                    $masehiRef = date('Y-m-d', $ts);
                }
            }
            if ($masehiRef === null) {
                continue;
            }

            $newTa = TahunAjaranActiveHelper::resolveTahunAjaranForTransaction(
                $pdo,
                isset($row['hijriyah']) ? (string) $row['hijriyah'] : null,
                $masehiRef
            );
            if ($newTa === null || $newTa === '') {
                continue;
            }

            $current = trim((string) ($row['tahun_ajaran'] ?? ''));
            if ($current === $newTa) {
                continue;
            }

            $upd->execute([$newTa, $id]);
            ++$count;
        }

        if ($count > 0) {
            error_log(sprintf('PemasukanTahunAjaranHijriyahRentangBackfill: %d pemasukan diperbarui.', $count));
        }
    }

    public function down(): void
    {
        // Tidak reversible tanpa backup kolom lama.
    }
}

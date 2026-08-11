<?php

declare(strict_types=1);

use App\Helpers\BisyarohRekapSnapshotHelper;
use Phinx\Migration\AbstractMigration;

/**
 * Backfill snapshot rekap Bisyaroh untuk periode yang sudah berstatus rilis,
 * agar total & kolom rumus tidak berubah saat definisi rumus diubah kemudian.
 */
final class BisyarohRekapSnapshotBackfill extends AbstractMigration
{
    public function up(): void
    {
        if (!$this->hasTable('bisyaroh___rekap_baris') || !$this->hasTable('bisyaroh___rekap_status_lembaga')) {
            return;
        }
        $conn = $this->getAdapter()->getConnection();
        if (!$conn instanceof \PDO) {
            return;
        }
        BisyarohRekapSnapshotHelper::backfillReleasedSnapshots($conn);
    }

    public function down(): void
    {
        // Snapshot tidak dihapus otomatis (data historis).
    }
}

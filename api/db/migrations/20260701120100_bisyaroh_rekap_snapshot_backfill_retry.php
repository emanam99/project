<?php

declare(strict_types=1);

use App\Helpers\BisyarohRekapSnapshotHelper;
use Phinx\Migration\AbstractMigration;

/**
 * Ulang backfill snapshot (perbaikan ORDER BY; idempotent — lewati baris yang sudah punya snapshot).
 */
final class BisyarohRekapSnapshotBackfillRetry extends AbstractMigration
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
    }
}

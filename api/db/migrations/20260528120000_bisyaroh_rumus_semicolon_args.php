<?php

declare(strict_types=1);

use App\Helpers\BisyarohFormulaEvaluator;
use Phinx\Migration\AbstractMigration;

/**
 * Normalisasi rumus kolom Bisyaroh: pemisah argumen fungsi koma → titik koma (desimal 0,5 tetap).
 */
final class BisyarohRumusSemicolonArgs extends AbstractMigration
{
    public function up(): void
    {
        if (!$this->hasTable('bisyaroh___kolom')) {
            return;
        }
        $conn = $this->getAdapter()->getConnection();
        $stmt = $conn->query(
            "SELECT `id`, `rumus` FROM `bisyaroh___kolom` WHERE `kind` = 'formula' AND `rumus` IS NOT NULL AND TRIM(`rumus`) <> '' AND `rumus` LIKE '%,%'"
        );
        if ($stmt === false) {
            return;
        }
        $upd = $conn->prepare('UPDATE `bisyaroh___kolom` SET `rumus` = ? WHERE `id` = ?');
        while (($row = $stmt->fetch(\PDO::FETCH_ASSOC)) !== false) {
            $raw = trim((string) ($row['rumus'] ?? ''));
            if ($raw === '') {
                continue;
            }
            $norm = BisyarohFormulaEvaluator::normalizeFunctionArgCommas($raw);
            if ($norm !== $raw) {
                $upd->execute([$norm, (int) $row['id']]);
            }
        }
    }

    public function down(): void
    {
        // Tidak mengembalikan koma pemisah argumen (tidak reversibel aman).
    }
}

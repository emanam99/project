<?php

declare(strict_types=1);

use Phinx\Migration\AbstractMigration;

/**
 * Indeks tambahan untuk query Manage Data (grid UWABA + agregat ijin).
 *
 * @see DashboardController::getDataSantri
 */
final class ManageDataPerformanceIndexes extends AbstractMigration
{
    /** @var array<int, array{0:string,1:string,2:string}> */
    private const INDEXES = [
        ['uwaba', 'idx_uwaba_manage_data_id_santri_tahun', '`id_santri`,`tahun_ajaran`'],
        ['santri___ijin', 'idx_santri_ijin_manage_count', '`id_santri`,`tahun_ajaran`'],
    ];

    public function up(): void
    {
        $conn = $this->getAdapter()->getConnection();
        foreach (self::INDEXES as [$table, $indexName, $columns]) {
            if (!$this->tableExists($conn, $table)) {
                continue;
            }
            if (!$this->allColumnsExist($conn, $table, $columns)) {
                continue;
            }
            if ($this->indexExists($conn, $table, $indexName)) {
                continue;
            }
            $this->execute(sprintf('ALTER TABLE `%s` ADD INDEX `%s` (%s)', $table, $indexName, $columns));
        }
    }

    public function down(): void
    {
        $conn = $this->getAdapter()->getConnection();
        foreach (self::INDEXES as [$table, $indexName]) {
            if (!$this->tableExists($conn, $table)) {
                continue;
            }
            if (!$this->indexExists($conn, $table, $indexName)) {
                continue;
            }
            $this->execute(sprintf('ALTER TABLE `%s` DROP INDEX `%s`', $table, $indexName));
        }
    }

    private function tableExists(\PDO $conn, string $table): bool
    {
        $stmt = $conn->prepare('SELECT 1 FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? LIMIT 1');
        $stmt->execute([$table]);

        return (bool) $stmt->fetchColumn();
    }

    private function indexExists(\PDO $conn, string $table, string $indexName): bool
    {
        $stmt = $conn->prepare('SELECT 1 FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ? LIMIT 1');
        $stmt->execute([$table, $indexName]);

        return (bool) $stmt->fetchColumn();
    }

    private function allColumnsExist(\PDO $conn, string $table, string $columnsCsv): bool
    {
        $cols = preg_split('/\s*,\s*/', $columnsCsv) ?: [];
        $stmt = $conn->prepare('SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ? LIMIT 1');
        foreach ($cols as $col) {
            $clean = trim(str_replace('`', '', $col));
            if ($clean === '') {
                continue;
            }
            $stmt->execute([$table, $clean]);
            if (!$stmt->fetchColumn()) {
                return false;
            }
        }

        return true;
    }
}

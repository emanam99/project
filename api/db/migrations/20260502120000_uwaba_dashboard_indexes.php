<?php

declare(strict_types=1);

use Phinx\Migration\AbstractMigration;

/**
 * Tambahkan composite index untuk query dashboard uwaba (tunggakan & khusus) serta tabel bayar.
 *
 * Sasaran query (DashboardController):
 *  - SUM/JOIN pada uwaba___tunggakan dan uwaba___khusus dengan filter tahun_ajaran/lembaga/keterangan_1.
 *  - Aggregasi nominal pada uwaba___bayar_tunggakan dan uwaba___bayar_khusus melalui id_tunggakan/id_khusus.
 *
 * Idempotent: setiap index hanya dibuat bila belum ada (cek information_schema.STATISTICS).
 */
final class UwabaDashboardIndexes extends AbstractMigration
{
    /**
     * Pasangan index yang akan dibuat.
     * Format: [table, index_name, columns_csv]
     *
     * @var array<int, array{0:string,1:string,2:string}>
     */
    private const INDEXES = [
        // Covering composite index untuk filter dashboard tunggakan + grouping per lembaga/tahun_ajaran/keterangan_1
        ['uwaba___tunggakan',         'idx_uwaba_tunggakan_dashboard',  '`tahun_ajaran`,`lembaga`,`keterangan_1`,`id_santri`'],
        // Covering composite index untuk filter dashboard khusus + grouping per lembaga/tahun_ajaran/keterangan_1
        ['uwaba___khusus',            'idx_uwaba_khusus_dashboard',     '`tahun_ajaran`,`lembaga`,`keterangan_1`,`id_santri`'],
        // Covering index untuk SUM(nominal) GROUP BY id_tunggakan / id_khusus.
        ['uwaba___bayar_tunggakan',   'idx_uwaba_bayar_tunggakan_join', '`id_tunggakan`,`nominal`'],
        ['uwaba___bayar_khusus',      'idx_uwaba_bayar_khusus_join',    '`id_khusus`,`nominal`'],
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
            $sql = sprintf('ALTER TABLE `%s` ADD INDEX `%s` (%s)', $table, $indexName, $columns);
            $this->execute($sql);
        }
    }

    public function down(): void
    {
        $conn = $this->getAdapter()->getConnection();
        foreach (self::INDEXES as [$table, $indexName, $columns]) {
            if (!$this->tableExists($conn, $table)) {
                continue;
            }
            if (!$this->indexExists($conn, $table, $indexName)) {
                continue;
            }
            $sql = sprintf('ALTER TABLE `%s` DROP INDEX `%s`', $table, $indexName);
            $this->execute($sql);
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

    /**
     * Pastikan setiap kolom di list ada di tabel sebelum membuat index.
     */
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

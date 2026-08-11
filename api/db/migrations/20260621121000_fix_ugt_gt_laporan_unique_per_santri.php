<?php

declare(strict_types=1);

use Phinx\Migration\AbstractMigration;

/**
 * Laporan GT harus unik per madrasah + santri + tahun ajaran + bulan.
 * Jika ada unique index lama yang hanya mengunci periode madrasah, santri GT kedua
 * di madrasah dan bulan yang sama ikut tertolak.
 */
final class FixUgtGtLaporanUniquePerSantri extends AbstractMigration
{
    private const TABLE = 'ugt___gt';
    private const DESIRED_INDEX = 'uq_gt_m_s_ta_bulan';
    private const DESIRED_COLUMNS = ['id_madrasah', 'id_santri', 'id_tahun_ajaran', 'bulan'];

    public function up(): void
    {
        if (!$this->hasTable(self::TABLE)) {
            return;
        }

        $this->dedupeExactLaporanGroups();

        foreach ($this->uniqueIndexes() as $name => $columns) {
            if ($name === 'PRIMARY') {
                continue;
            }

            $isDesiredNameWithWrongShape = $name === self::DESIRED_INDEX && $columns !== self::DESIRED_COLUMNS;
            $blocksMultiSantri = !in_array('id_santri', $columns, true)
                && in_array('id_madrasah', $columns, true)
                && in_array('id_tahun_ajaran', $columns, true)
                && in_array('bulan', $columns, true);

            if ($isDesiredNameWithWrongShape || $blocksMultiSantri) {
                $this->execute(sprintf('ALTER TABLE `%s` DROP INDEX `%s`', self::TABLE, str_replace('`', '``', $name)));
            }
        }

        if (!$this->hasDesiredUniqueIndex()) {
            $this->execute(sprintf(
                'ALTER TABLE `%s` ADD UNIQUE KEY `%s` (`id_madrasah`, `id_santri`, `id_tahun_ajaran`, `bulan`)',
                self::TABLE,
                self::DESIRED_INDEX
            ));
        }
    }

    public function down(): void
    {
        // Perbaikan constraint tidak dibalik agar tidak mengembalikan bug multi-GT.
    }

    /** Hapus duplikat persis agar unique index yang benar bisa dibuat. */
    private function dedupeExactLaporanGroups(): void
    {
        $dupes = $this->fetchAll(
            "SELECT GROUP_CONCAT(id ORDER BY id) AS ids
             FROM `" . self::TABLE . "`
             GROUP BY id_madrasah, id_santri, id_tahun_ajaran, bulan
             HAVING COUNT(*) > 1"
        );
        if (!is_array($dupes)) {
            return;
        }

        foreach ($dupes as $dupe) {
            $ids = array_values(array_filter(array_map('intval', explode(',', (string) ($dupe['ids'] ?? '')))));
            if (count($ids) < 2) {
                continue;
            }
            array_shift($ids);
            foreach ($ids as $id) {
                $this->execute('DELETE FROM `ugt___masalah` WHERE laporan_jenis = ? AND id_laporan = ?', ['gt', $id]);
                $this->execute('DELETE FROM `' . self::TABLE . '` WHERE id = ?', [$id]);
            }
        }
    }

    /** @return array<string, list<string>> */
    private function uniqueIndexes(): array
    {
        $rows = $this->fetchAll(
            "SELECT INDEX_NAME, COLUMN_NAME
             FROM INFORMATION_SCHEMA.STATISTICS
             WHERE TABLE_SCHEMA = DATABASE()
               AND TABLE_NAME = '" . self::TABLE . "'
               AND NON_UNIQUE = 0
             ORDER BY INDEX_NAME, SEQ_IN_INDEX"
        );
        $indexes = [];
        if (!is_array($rows)) {
            return $indexes;
        }

        foreach ($rows as $row) {
            $name = (string) ($row['INDEX_NAME'] ?? '');
            $column = (string) ($row['COLUMN_NAME'] ?? '');
            if ($name === '' || $column === '') {
                continue;
            }
            $indexes[$name] ??= [];
            $indexes[$name][] = $column;
        }

        return $indexes;
    }

    private function hasDesiredUniqueIndex(): bool
    {
        foreach ($this->uniqueIndexes() as $columns) {
            if ($columns === self::DESIRED_COLUMNS) {
                return true;
            }
        }

        return false;
    }
}

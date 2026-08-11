<?php

declare(strict_types=1);

use App\Helpers\ProperCaseHelper;
use Phinx\Migration\AbstractMigration;

/**
 * Backfill title case untuk kolom biodata/alamat (idempotent: hanya UPDATE jika nilai berubah).
 * Tidak reversible: down() tidak mengembalikan kapitalisasi lama.
 */
final class BiodataProperCaseBackfill extends AbstractMigration
{
    public function up(): void
    {
        require dirname(__DIR__, 2) . '/vendor/autoload.php';

        $this->backfillSantri();
        $this->backfillPengurus();
        $this->backfillAbsenAlamat();
        $this->backfillAbsenLokasiLegacyAlamat();
    }

    public function down(): void
    {
        // Data tidak bisa dipulihkan tanpa backup — sengaja kosong.
    }

    /** @return list<string> */
    private function intersectExistingColumns(string $table, array $wanted): array
    {
        if (!$this->hasTable($table)) {
            return [];
        }
        $pdo = $this->getAdapter()->getConnection();
        $out = [];
        foreach ($wanted as $col) {
            $st = $pdo->query('SHOW COLUMNS FROM `' . str_replace('`', '``', $table) . "` LIKE " . $pdo->quote($col));
            if ($st !== false && $st->rowCount() > 0) {
                $out[] = $col;
            }
        }

        return $out;
    }

    private function backfillSantri(): void
    {
        $cols = $this->intersectExistingColumns('santri', ProperCaseHelper::BIODATA_TITLE_CASE_FIELDS);
        if ($cols === []) {
            return;
        }
        $this->backfillByPrimaryKey('santri', 'id', $cols);
    }

    private function backfillPengurus(): void
    {
        $wanted = array_values(array_intersect(
            ProperCaseHelper::BIODATA_TITLE_CASE_FIELDS,
            ['nama', 'tempat_lahir', 'dusun', 'rt', 'rw', 'desa', 'kecamatan', 'kabupaten', 'provinsi']
        ));
        $cols = $this->intersectExistingColumns('pengurus', $wanted);
        if ($cols === []) {
            return;
        }
        $this->backfillByPrimaryKey('pengurus', 'id', $cols);
    }

    private function backfillAbsenAlamat(): void
    {
        $cols = $this->intersectExistingColumns('absen___alamat', ['dusun', 'rt', 'rw', 'desa', 'kecamatan', 'kabupaten', 'provinsi']);
        if ($cols === []) {
            return;
        }
        $this->backfillByPrimaryKey('absen___alamat', 'id', $cols);
    }

    private function backfillAbsenLokasiLegacyAlamat(): void
    {
        if (!$this->hasTable('absen___lokasi')) {
            return;
        }
        $cols = $this->intersectExistingColumns('absen___lokasi', ['dusun', 'rt', 'rw', 'desa', 'kecamatan', 'kabupaten', 'provinsi']);
        if ($cols === []) {
            return;
        }
        $this->backfillByPrimaryKey('absen___lokasi', 'id', $cols);
    }

    /**
     * @param list<string> $columns
     */
    private function backfillByPrimaryKey(string $table, string $pk, array $columns): void
    {
        $pdo = $this->getAdapter()->getConnection();
        $safeTable = '`' . str_replace('`', '``', $table) . '`';
        $safePk = '`' . str_replace('`', '``', $pk) . '`';
        $selectList = $safePk . ', ' . implode(', ', array_map(static function (string $c): string {
            return '`' . str_replace('`', '``', $c) . '`';
        }, $columns));

        $last = 0;
        $batch = 500;
        while (true) {
            $sql = "SELECT {$selectList} FROM {$safeTable} WHERE {$safePk} > ? ORDER BY {$safePk} ASC LIMIT " . (int) $batch;
            $st = $pdo->prepare($sql);
            $st->execute([$last]);
            $rows = $st->fetchAll(\PDO::FETCH_ASSOC);
            if ($rows === []) {
                break;
            }
            foreach ($rows as $row) {
                $idVal = $row[$pk] ?? null;
                if ($idVal === null) {
                    continue;
                }
                $last = (int) $idVal;
                $set = [];
                $bind = [];
                foreach ($columns as $col) {
                    $old = $row[$col] ?? null;
                    if ($old === null || $old === '') {
                        continue;
                    }
                    if (!\is_string($old)) {
                        continue;
                    }
                    $new = ProperCaseHelper::forBiodataField($col, $old);
                    if ($new === null) {
                        continue;
                    }
                    if ((string) $old === (string) $new) {
                        continue;
                    }
                    $set[] = '`' . str_replace('`', '``', $col) . '` = ?';
                    $bind[] = $new;
                }
                if ($set === []) {
                    continue;
                }
                $bind[] = $idVal;
                $upd = 'UPDATE ' . $safeTable . ' SET ' . implode(', ', $set) . ' WHERE ' . $safePk . ' = ?';
                $pdo->prepare($upd)->execute($bind);
            }
            if (\count($rows) < $batch) {
                break;
            }
        }
    }
}

<?php

declare(strict_types=1);

namespace App\Helpers;

use PDO;

/**
 * Snapshot hasil rumus Bisyaroh saat rilis — agar histori/rekap bulan lalu tidak berubah
 * meskipun definisi rumus atau data pengurus/jabatan berubah.
 *
 * Bentuk nilai_json:
 * { inputs, computed?, total_nominal?, snapshot?: { cells, computed, total_nominal, env, frozen_at } }
 */
final class BisyarohRekapSnapshotHelper
{
    public const SNAPSHOT_KEY = 'snapshot';

    /**
     * @return array<string, mixed>
     */
    public static function decodeNilaiJson(mixed $raw): array
    {
        if (is_string($raw)) {
            $dec = json_decode($raw, true);
        } elseif (is_array($raw)) {
            $dec = $raw;
        } else {
            return [];
        }

        return is_array($dec) ? $dec : [];
    }

    /**
     * @return array<string, mixed>
     */
    public static function extractInputs(mixed $nilaiJson): array
    {
        $dec = self::decodeNilaiJson($nilaiJson);
        if (isset($dec['inputs']) && is_array($dec['inputs'])) {
            return $dec['inputs'];
        }
        $skip = ['inputs', 'computed', 'total_nominal', self::SNAPSHOT_KEY];
        $out = [];
        foreach ($dec as $k => $v) {
            if (!is_string($k) || in_array($k, $skip, true)) {
                continue;
            }
            $out[$k] = $v;
        }

        return $out;
    }

    public static function hasSnapshot(mixed $nilaiJson): bool
    {
        $dec = self::decodeNilaiJson($nilaiJson);

        return isset($dec[self::SNAPSHOT_KEY]) && is_array($dec[self::SNAPSHOT_KEY]);
    }

    /**
     * @return array{env: array<string, float>, computed: array<string, float>, cells: list<array<string, mixed>>, total_nominal: float}|null
     */
    public static function calcFromSnapshot(mixed $nilaiJson): ?array
    {
        $dec = self::decodeNilaiJson($nilaiJson);
        $snap = $dec[self::SNAPSHOT_KEY] ?? null;
        if (!is_array($snap)) {
            return null;
        }
        $cells = $snap['cells'] ?? [];
        if (!is_array($cells)) {
            $cells = [];
        }
        $computed = $snap['computed'] ?? [];
        if (!is_array($computed)) {
            $computed = [];
        }
        $env = $snap['env'] ?? [];
        if (!is_array($env)) {
            $env = [];
        }

        return [
            'env' => $env,
            'computed' => $computed,
            'cells' => array_values($cells),
            'total_nominal' => (float) ($snap['total_nominal'] ?? 0.0),
        ];
    }

    /**
     * Pakai snapshot bila ada; jika tidak, hitung ulang.
     *
     * @param list<array<string, mixed>> $kolomDef
     * @param array<string, mixed> $inputs
     * @param array<string, string>|array{pengurus?: array<string, string>, jabatan?: array<string, string>, pj?: array<string, string>}|null $formulaContext
     * @return array{env: array<string, float>, computed: array<string, float>, cells: list<array<string, mixed>>, total_nominal: float}
     */
    public static function resolveCalc(
        array $kolomDef,
        array $inputs,
        ?array $formulaContext,
        mixed $nilaiJson
    ): array {
        $fromSnap = self::calcFromSnapshot($nilaiJson);
        if ($fromSnap !== null) {
            return $fromSnap;
        }
        if ($formulaContext === null) {
            $formulaContext = BisyarohPengurusFormulaHelper::emptyFormulaContext();
        }

        return BisyarohKolomComputation::computeRow($kolomDef, $inputs, $formulaContext);
    }

    /**
     * Total nominal: snapshot jika ada, else hitung ulang.
     *
     * @param list<array<string, mixed>> $kolomDef
     * @param array<string, mixed> $inputs
     * @param array<string, string>|array{pengurus?: array<string, string>, jabatan?: array<string, string>, pj?: array<string, string>}|null $formulaContext
     */
    public static function resolveTotalNominal(
        array $kolomDef,
        array $inputs,
        ?array $formulaContext,
        mixed $nilaiJson
    ): float {
        $calc = self::resolveCalc($kolomDef, $inputs, $formulaContext, $nilaiJson);

        return (float) ($calc['total_nominal'] ?? 0.0);
    }

    /**
     * @param array{env?: array<string, float>, computed?: array<string, float>, cells?: list<array<string, mixed>>, total_nominal?: float} $calc
     * @return array{cells: list<array<string, mixed>>, computed: array<string, float>, total_nominal: float, env: array<string, float>, frozen_at: string}
     */
    public static function buildSnapshotPayload(array $calc, array $formulaContext): array
    {
        $env = $calc['env'] ?? [];
        if (!is_array($env)) {
            $env = [];
        }
        $cells = $calc['cells'] ?? [];
        if (!is_array($cells)) {
            $cells = [];
        }
        $computed = $calc['computed'] ?? [];
        if (!is_array($computed)) {
            $computed = [];
        }

        return [
            'cells' => self::enrichCellsRumusTerurai($cells, $env, $formulaContext),
            'computed' => $computed,
            'total_nominal' => (float) ($calc['total_nominal'] ?? 0.0),
            'env' => $env,
            'frozen_at' => (new \DateTime('now', new \DateTimeZone('Asia/Jakarta')))->format('Y-m-d H:i:s'),
        ];
    }

    /**
     * Payload simpan (belum rilis): inputs + hasil hitung terakhir, pertahankan snapshot jika sudah ada.
     *
     * @param array<string, mixed> $inputs
     * @param array{env?: mixed, computed?: mixed, cells?: mixed, total_nominal?: float} $calc
     * @param array<string, mixed>|null $existingDecoded
     */
    public static function buildSavePayload(array $inputs, array $calc, ?array $existingDecoded = null): array
    {
        $payload = [
            'inputs' => $inputs,
            'computed' => is_array($calc['computed'] ?? null) ? $calc['computed'] : [],
            'total_nominal' => (float) ($calc['total_nominal'] ?? 0.0),
        ];
        if ($existingDecoded !== null && isset($existingDecoded[self::SNAPSHOT_KEY]) && is_array($existingDecoded[self::SNAPSHOT_KEY])) {
            $payload[self::SNAPSHOT_KEY] = $existingDecoded[self::SNAPSHOT_KEY];
        }

        return $payload;
    }

    /**
     * Gabung snapshot ke payload nilai_json yang sudah ada.
     *
     * @param array<string, mixed> $decoded
     * @param array<string, mixed> $snapshot
     * @return array<string, mixed>
     */
    public static function mergeSnapshotIntoDecoded(array $decoded, array $snapshot): array
    {
        $decoded[self::SNAPSHOT_KEY] = $snapshot;
        if (isset($decoded['inputs']) && is_array($decoded['inputs'])) {
            // inputs tetap
        } elseif ($decoded !== []) {
            $inputs = self::extractInputs($decoded);
            $decoded = ['inputs' => $inputs] + $decoded;
        }

        return $decoded;
    }

    /**
     * Bekukan baris rekap pengurus yang berjabatan di lembaga saat rilis.
     * Baris yang sudah punya snapshot dilewati (rilis lembaga lain / migrasi).
     *
     * @return int jumlah baris yang di-freeze
     */
    public static function freezeRekapRowsForRelease(
        PDO $db,
        int $bisyarohId,
        string $lembagaId,
        string $periodeBulan,
        string $kalender
    ): int {
        if ($bisyarohId <= 0 || trim($lembagaId) === '' || !preg_match('/^\d{4}-\d{2}$/', $periodeBulan)) {
            return 0;
        }
        $hasKal = self::rekapHasKalenderColumn($db);
        if (!$hasKal && $kalender !== 'masehi') {
            return 0;
        }
        $kolomDef = self::loadKolomRowsSorted($db, $bisyarohId, true);
        if ($kolomDef === []) {
            return 0;
        }
        $lembagaSql = self::sqlPengurusBerjabatanDiLembaga('r', 'pj_frz', 'j_frz');
        if ($hasKal) {
            $sql = 'SELECT r.`id`, r.`id_pengurus`, r.`nilai_json` FROM `bisyaroh___rekap_baris` r
                WHERE r.`bisyaroh_id` = ? AND r.`periode_bulan` = ? AND r.`kalender` = ?
                  AND ' . $lembagaSql . '
                ORDER BY r.`id` ASC';
            $stmt = $db->prepare($sql);
            $stmt->execute([$bisyarohId, $periodeBulan, $kalender, $lembagaId, $lembagaId]);
        } else {
            $sql = 'SELECT r.`id`, r.`id_pengurus`, r.`nilai_json` FROM `bisyaroh___rekap_baris` r
                WHERE r.`bisyaroh_id` = ? AND r.`periode_bulan` = ?
                  AND ' . $lembagaSql . '
                ORDER BY r.`id` ASC';
            $stmt = $db->prepare($sql);
            $stmt->execute([$bisyarohId, $periodeBulan, $lembagaId, $lembagaId]);
        }
        $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
        if (!is_array($rows) || $rows === []) {
            return 0;
        }
        $upd = $db->prepare('UPDATE `bisyaroh___rekap_baris` SET `nilai_json` = ? WHERE `id` = ? LIMIT 1');
        $frozen = 0;
        $lembagaScope = [$lembagaId];
        foreach ($rows as $row) {
            if (!is_array($row)) {
                continue;
            }
            $rid = (int) ($row['id'] ?? 0);
            $pid = (int) ($row['id_pengurus'] ?? 0);
            if ($rid <= 0 || $pid <= 0) {
                continue;
            }
            $decoded = self::decodeNilaiJson($row['nilai_json'] ?? null);
            if (self::hasSnapshot($decoded)) {
                continue;
            }
            $inputs = self::extractInputs($decoded);
            $fCtx = BisyarohPengurusFormulaHelper::loadFormulaContext($db, $pid, null, $lembagaScope);
            try {
                $calc = BisyarohKolomComputation::computeRow($kolomDef, $inputs, $fCtx);
            } catch (\Throwable $e) {
                error_log('BisyarohRekapSnapshotHelper freeze row #' . $rid . ': ' . $e->getMessage());
                continue;
            }
            $snapshot = self::buildSnapshotPayload($calc, $fCtx);
            $merged = self::mergeSnapshotIntoDecoded(
                self::buildSavePayload($inputs, $calc, $decoded),
                $snapshot
            );
            $json = json_encode($merged, JSON_UNESCAPED_UNICODE);
            if (!is_string($json)) {
                continue;
            }
            $upd->execute([$json, $rid]);
            ++$frozen;
        }

        return $frozen;
    }

    /**
     * Bekukan satu baris rekap (rilis per pengurus / transfer berhasil).
     *
     * @return bool true jika di-freeze atau sudah punya snapshot
     */
    public static function freezeRekapBarisById(PDO $db, int $rekapBarisId, ?string $lembagaId = null): bool
    {
        if ($rekapBarisId <= 0) {
            return false;
        }
        $hasKal = self::rekapHasKalenderColumn($db);
        $sql = 'SELECT r.`id`, r.`bisyaroh_id`, r.`id_pengurus`, r.`nilai_json`, r.`periode_bulan`'
            . ($hasKal ? ', r.`kalender`' : '')
            . ' FROM `bisyaroh___rekap_baris` r WHERE r.`id` = ? LIMIT 1';
        $stmt = $db->prepare($sql);
        $stmt->execute([$rekapBarisId]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        if (!is_array($row)) {
            return false;
        }
        $decoded = self::decodeNilaiJson($row['nilai_json'] ?? null);
        if (self::hasSnapshot($decoded)) {
            return true;
        }
        $bid = (int) ($row['bisyaroh_id'] ?? 0);
        $pid = (int) ($row['id_pengurus'] ?? 0);
        if ($bid <= 0 || $pid <= 0) {
            return false;
        }
        $kolomDef = self::loadKolomRowsSorted($db, $bid, true);
        if ($kolomDef === []) {
            return false;
        }
        $lembagaScope = $lembagaId !== null && trim($lembagaId) !== '' ? [trim($lembagaId)] : null;
        $inputs = self::extractInputs($decoded);
        $fCtx = BisyarohPengurusFormulaHelper::loadFormulaContext($db, $pid, null, $lembagaScope);
        try {
            $calc = BisyarohKolomComputation::computeRow($kolomDef, $inputs, $fCtx);
        } catch (\Throwable $e) {
            error_log('BisyarohRekapSnapshotHelper freezeRekapBarisById #' . $rekapBarisId . ': ' . $e->getMessage());

            return false;
        }
        $snapshot = self::buildSnapshotPayload($calc, $fCtx);
        $merged = self::mergeSnapshotIntoDecoded(
            self::buildSavePayload($inputs, $calc, $decoded),
            $snapshot
        );
        $json = json_encode($merged, JSON_UNESCAPED_UNICODE);
        if (!is_string($json)) {
            return false;
        }
        $upd = $db->prepare('UPDATE `bisyaroh___rekap_baris` SET `nilai_json` = ? WHERE `id` = ? LIMIT 1');
        $upd->execute([$json, $rekapBarisId]);

        return true;
    }

    /**
     * Backfill snapshot untuk semua periode yang sudah berstatus rilis.
     *
     * @return int jumlah baris yang di-freeze
     */
    public static function backfillReleasedSnapshots(PDO $db): int
    {
        if (!self::rekapStatusTableExists($db)) {
            return 0;
        }
        try {
            $stmt = $db->query(
                "SELECT `bisyaroh_id`, `lembaga_id`, `periode_bulan`, `kalender`
                 FROM `bisyaroh___rekap_status_lembaga`
                 WHERE `status` = 'rilis'
                 ORDER BY `updated_at` ASC"
            );
        } catch (\Throwable $e) {
            error_log('BisyarohRekapSnapshotHelper backfill list: ' . $e->getMessage());

            return 0;
        }
        if ($stmt === false) {
            return 0;
        }
        $total = 0;
        while (($row = $stmt->fetch(PDO::FETCH_ASSOC)) !== false) {
            if (!is_array($row)) {
                continue;
            }
            $total += self::freezeRekapRowsForRelease(
                $db,
                (int) ($row['bisyaroh_id'] ?? 0),
                trim((string) ($row['lembaga_id'] ?? '')),
                trim((string) ($row['periode_bulan'] ?? '')),
                trim((string) ($row['kalender'] ?? 'masehi')) ?: 'masehi'
            );
        }

        return $total;
    }

    /**
     * @param list<array<string, mixed>> $cells
     * @param array<string, float> $env
     * @param array<string, string>|array{pengurus?: array<string, string>, jabatan?: array<string, string>, pj?: array<string, string>}|null $formulaContext
     * @return list<array<string, mixed>>
     */
    public static function enrichCellsRumusTerurai(array $cells, array $env, ?array $formulaContext): array
    {
        if ($formulaContext === null) {
            $formulaContext = BisyarohPengurusFormulaHelper::emptyFormulaContext();
        }
        $out = [];
        foreach ($cells as $c) {
            if (!is_array($c)) {
                continue;
            }
            $kind = (string) ($c['kind'] ?? '');
            if ($kind === 'formula' && !empty($c['rumus']) && empty($c['error'])) {
                try {
                    $rumusX = BisyarohPengurusFormulaHelper::preprocessFormula((string) $c['rumus'], $formulaContext);
                    $c['rumus_terurai'] = BisyarohFormulaEvaluator::substituteRefs($rumusX, $env);
                } catch (\Throwable $e) {
                    $c['rumus_terurai'] = null;
                }
            } else {
                $c['rumus_terurai'] = null;
            }
            $out[] = $c;
        }

        return $out;
    }

    /**
     * @return list<array<string, mixed>>
     */
    public static function loadKolomRowsSorted(PDO $db, int $bisyarohId, bool $onlyAktif): array
    {
        $sql = 'SELECT `id`, `bisyaroh_id`, `col_key`, `kind`, `label`, `keterangan`, `rumus`, `input_tipe`, `default_nilai`, `masuk_total`, `sort_order`, `aktif`
            FROM `bisyaroh___kolom` WHERE `bisyaroh_id` = ?';
        if ($onlyAktif) {
            $sql .= ' AND `aktif` = 1';
        }
        $sql .= ' ORDER BY `sort_order` ASC, `id` ASC';
        $stmt = $db->prepare($sql);
        $stmt->execute([$bisyarohId]);
        $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

        return is_array($rows) ? $rows : [];
    }

    private static function rekapHasKalenderColumn(PDO $db): bool
    {
        try {
            $stmt = $db->query(
                "SELECT 1 FROM information_schema.`COLUMNS` WHERE `TABLE_SCHEMA` = DATABASE() AND `TABLE_NAME` = 'bisyaroh___rekap_baris' AND `COLUMN_NAME` = 'kalender' LIMIT 1"
            );

            return (bool) $stmt->fetchColumn();
        } catch (\Throwable $e) {
            return false;
        }
    }

    private static function rekapStatusTableExists(PDO $db): bool
    {
        try {
            $stmt = $db->query(
                "SELECT 1 FROM information_schema.`TABLES` WHERE `TABLE_SCHEMA` = DATABASE() AND `TABLE_NAME` = 'bisyaroh___rekap_status_lembaga' LIMIT 1"
            );

            return (bool) $stmt->fetchColumn();
        } catch (\Throwable $e) {
            return false;
        }
    }

    private static function sqlPengurusBerjabatanDiLembaga(string $rekapAlias, string $pjAlias, string $jAlias): string
    {
        return 'EXISTS (
            SELECT 1 FROM `pengurus___jabatan` ' . $pjAlias . '
            INNER JOIN `jabatan` ' . $jAlias . ' ON ' . $jAlias . '.`id` = ' . $pjAlias . '.`jabatan_id`
            WHERE ' . $pjAlias . '.`pengurus_id` = ' . $rekapAlias . '.`id_pengurus`
              AND (' . $pjAlias . '.`status` = \'aktif\' OR ' . $pjAlias . '.`status` = \'active\'
                   OR ' . $pjAlias . '.`status` IS NULL OR TRIM(COALESCE(' . $pjAlias . '.`status`, \'\')) = \'\')
              AND (' . $jAlias . '.`status` = \'aktif\' OR ' . $jAlias . '.`status` IS NULL)
              AND (' . $pjAlias . '.`lembaga_id` = ? OR (' . $pjAlias . '.`lembaga_id` IS NULL AND ' . $jAlias . '.`lembaga_id` = ?))
        )';
    }
}

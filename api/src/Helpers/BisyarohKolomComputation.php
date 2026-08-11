<?php

declare(strict_types=1);

namespace App\Helpers;

/**
 * Menghitung nilai per kolom (input + rumus) dan total nominal untuk satu baris rekap.
 */
final class BisyarohKolomComputation
{
    /** @var list<string> */
    public const INPUT_TIPE_INPUT = ['angka', 'rupiah', 'teks', 'checkbox'];

    /** @var list<string> */
    public const INPUT_TIPE_FORMULA = ['angka', 'rupiah', 'persen', 'teks'];

    public static function normalizeInputTipe(string $kind, string $inputTipe): string
    {
        $t = trim($inputTipe);
        if ($kind === 'formula') {
            return in_array($t, self::INPUT_TIPE_FORMULA, true) ? $t : 'angka';
        }

        return in_array($t, self::INPUT_TIPE_INPUT, true) ? $t : 'angka';
    }

    /**
     * Format nilai numerik untuk tampilan (input & hasil rumus).
     */
    public static function formatNumericDisplay(float $n, string $inputTipe): string
    {
        if ($inputTipe === 'teks') {
            return self::formatPlainTextFromNumber($n);
        }
        if ($inputTipe === 'rupiah') {
            return self::formatRupiahId($n);
        }
        if ($inputTipe === 'persen') {
            return self::formatPersenId($n);
        }

        return self::formatNumberId($n);
    }

    /** Angka hasil rumus ditampilkan sebagai teks biasa (tanpa Rp / pemisah ribuan). */
    private static function formatPlainTextFromNumber(float $n): string
    {
        if (!is_finite($n)) {
            return '';
        }
        if (abs($n - round($n)) < 1e-9) {
            return (string) (int) round($n);
        }

        return rtrim(rtrim(sprintf('%.10F', $n), '0'), '.');
    }

    /**
     * Ekstrak @[col_key] dari rumus.
     *
     * @return list<string>
     */
    public static function extractRefKeys(string $rumus): array
    {
        if (preg_match_all('/@\[([a-zA-Z_][a-zA-Z0-9_]*)\]/', $rumus, $m)) {
            return array_values(array_unique($m[1]));
        }

        return [];
    }

    /**
     * @param list<array<string, mixed>> $kolomRows baris aktif, sudah urut sort_order, id
     * @param array<string, mixed> $inputs nilai input pengguna (key = col_key)
     * @param array<string, string>|array{pengurus?: array<string, string>, jabatan?: array<string, string>, pj?: array<string, string>}|null $formulaContext konteks preprocess; null = kosong
     * @return array{
     *   env: array<string, float>,
     *   computed: array<string, float>,
     *   cells: list<array<string, mixed>>,
     *   total_nominal: float
     * }
     */
    public static function computeRow(array $kolomRows, array $inputs, ?array $formulaContext = null): array
    {
        if ($formulaContext === null) {
            $formulaContext = BisyarohPengurusFormulaHelper::emptyFormulaContext();
        }
        /** @var array<string, float> $env */
        $env = [];
        /** @var array<string, string> $textEnv nilai tampilan kolom untuk rumus teks @[k] */
        $textEnv = [];
        /** @var array<string, float> $computed */
        $computed = [];
        /** @var list<array<string, mixed>> $cells */
        $cells = [];
        $total = 0.0;

        foreach ($kolomRows as $row) {
            if (empty($row['aktif'])) {
                continue;
            }
            $key = (string) ($row['col_key'] ?? '');
            if ($key === '') {
                continue;
            }
            $kind = (string) ($row['kind'] ?? 'input');
            $label = (string) ($row['label'] ?? $key);
            $keterangan = isset($row['keterangan']) ? (string) $row['keterangan'] : '';
            $masuk = !empty($row['masuk_total']);
            $inputTipe = self::normalizeInputTipe($kind, (string) ($row['input_tipe'] ?? 'angka'));

            if ($kind === 'input') {
                $raw = array_key_exists($key, $inputs) ? $inputs[$key] : ($row['default_nilai'] ?? null);
                $display = self::scalarToDisplay($raw, $inputTipe);
                $num = self::coerceInputToNumber($raw, $inputTipe);
                $env[$key] = $num;
                $textEnv[$key] = $display;
                $cells[] = [
                    'col_key' => $key,
                    'kind' => 'input',
                    'label' => $label,
                    'keterangan' => $keterangan,
                    'input_tipe' => $inputTipe,
                    'masuk_total' => $masuk,
                    'nilai_tampil' => $display,
                    'nilai_nominal' => $num,
                ];
                if ($masuk && ($inputTipe === 'angka' || $inputTipe === 'rupiah')) {
                    $total += $num;
                }
                continue;
            }

            $rumus = isset($row['rumus']) ? trim((string) $row['rumus']) : '';
            try {
                if ($rumus === '') {
                    throw new \InvalidArgumentException('Kolom rumus «' . $label . '» (' . $key . ') wajib berisi rumus.');
                }
                if ($inputTipe === 'teks') {
                    $textResult = BisyarohPengurusFormulaHelper::evaluateTextFormula($rumus, $formulaContext, $textEnv);
                    $env[$key] = self::numericFromScalarText($textResult);
                    $textEnv[$key] = $textResult;
                    $cells[] = [
                        'col_key' => $key,
                        'kind' => 'formula',
                        'label' => $label,
                        'keterangan' => $keterangan,
                        'rumus' => $rumus,
                        'input_tipe' => $inputTipe,
                        'masuk_total' => $masuk,
                        'nilai_tampil' => $textResult,
                        'nilai_nominal' => null,
                        'error' => false,
                    ];
                    continue;
                }
                $rumus = BisyarohFormulaEvaluator::normalizeFunctionArgCommas($rumus);
                BisyarohPengurusFormulaHelper::assertNoCommonFormulaMistakes($rumus);
                $rumusX = BisyarohPengurusFormulaHelper::preprocessDateFunctions($rumus, $textEnv, $formulaContext ?? []);
                $rumusX = BisyarohPengurusFormulaHelper::preprocessFormula($rumusX, $formulaContext);
                $rumusX = BisyarohPengurusFormulaHelper::preprocessColTextRefs($rumusX, $textEnv);
                $subst = BisyarohFormulaEvaluator::substituteRefs($rumusX, $env);
                $hasil = BisyarohFormulaEvaluator::evaluateNumericExpression($subst);
                $computed[$key] = $hasil;
                $env[$key] = $hasil;
                $textEnv[$key] = self::formatNumericDisplay($hasil, $inputTipe);
                $cells[] = [
                    'col_key' => $key,
                    'kind' => 'formula',
                    'label' => $label,
                    'keterangan' => $keterangan,
                    'rumus' => $rumus,
                    'input_tipe' => $inputTipe,
                    'masuk_total' => $masuk,
                    'nilai_tampil' => self::formatNumericDisplay($hasil, $inputTipe),
                    'nilai_nominal' => $hasil,
                    'error' => false,
                ];
                if ($masuk && ($inputTipe === 'angka' || $inputTipe === 'rupiah')) {
                    $total += $hasil;
                }
            } catch (\Throwable $e) {
                $err = self::formulaErrorDisplay($e);
                $env[$key] = 0.0;
                $textEnv[$key] = '';
                $cells[] = [
                    'col_key' => $key,
                    'kind' => 'formula',
                    'label' => $label,
                    'keterangan' => $keterangan,
                    'rumus' => $rumus,
                    'input_tipe' => $inputTipe,
                    'masuk_total' => $masuk,
                    'nilai_tampil' => $err['code'],
                    'nilai_nominal' => null,
                    'error' => true,
                    'error_code' => $err['code'],
                    'error_message' => $err['message'],
                ];
            }
        }

        return [
            'env' => $env,
            'computed' => $computed,
            'cells' => $cells,
            'total_nominal' => round($total, 2),
        ];
    }

    /**
     * Uji semua rumus dengan nilai dummy (input = 1) untuk validasi sintaks.
     *
     * @param list<array<string, mixed>> $kolomRows
     */
    public static function validateAllWithDummyInputs(array $kolomRows): void
    {
        $dummy = [];
        foreach ($kolomRows as $row) {
            if (empty($row['aktif']) || ($row['kind'] ?? '') !== 'input') {
                continue;
            }
            $k = (string) ($row['col_key'] ?? '');
            if ($k === '') {
                continue;
            }
            $dummy[$k] = 1.0;
        }
        $result = self::computeRow(
            $kolomRows,
            $dummy,
            BisyarohPengurusFormulaHelper::dummyFormulaContextForValidation()
        );
        foreach ($result['cells'] as $cell) {
            if (!empty($cell['error'])) {
                $msg = isset($cell['error_message']) ? (string) $cell['error_message'] : 'Rumus tidak valid';
                $ck = isset($cell['col_key']) ? (string) $cell['col_key'] : '';
                $lb = isset($cell['label']) ? (string) $cell['label'] : $ck;
                throw new \InvalidArgumentException(
                    $ck !== '' ? 'Kolom «' . $lb . '» (' . $ck . '): ' . $msg : $msg
                );
            }
        }
    }

    /**
     * Kode tampilan gaya Excel untuk sel rumus yang gagal dihitung.
     *
     * @return array{code: string, message: string}
     */
    private static function formulaErrorDisplay(\Throwable $e): array
    {
        $msg = trim($e->getMessage());
        if ($msg === '') {
            $msg = 'Perhitungan gagal';
        }
        $lower = strtolower($msg);
        if (
            str_contains($lower, 'belum tersedia')
            || str_contains($lower, 'bukan angka')
        ) {
            return ['code' => '#N/A', 'message' => $msg];
        }
        if (
            str_contains($lower, 'pembagian dengan nol')
            || str_contains($lower, 'total tidak boleh nol')
            || str_contains($lower, 'tidak berhingga')
        ) {
            return ['code' => '#DIV/0!', 'message' => $msg];
        }
        if (
            str_contains($lower, 'kosong')
            || str_contains($lower, 'tidak lengkap')
            || str_contains($lower, 'tidak valid')
            || str_contains($lower, 'karakter tidak diharapkan')
            || str_contains($lower, 'angka tidak valid')
            || str_contains($lower, 'wajib berisi rumus')
            || str_contains($lower, 'membutuhkan')
        ) {
            return ['code' => '#VALUE!', 'message' => $msg];
        }

        return ['code' => '#ERROR!', 'message' => $msg];
    }

    private static function scalarToDisplay(mixed $raw, string $inputTipe): string
    {
        if ($inputTipe === 'checkbox') {
            if ($raw === null || $raw === '') {
                return 'Tidak';
            }

            return self::isCheckboxTruthy($raw) ? 'Ya' : 'Tidak';
        }
        if ($raw === null || $raw === '') {
            return '';
        }
        if ($inputTipe === 'teks') {
            return (string) $raw;
        }
        $n = self::coerceInputToNumber($raw, $inputTipe);

        return self::formatNumericDisplay($n, $inputTipe);
    }

    private static function coerceInputToNumber(mixed $raw, string $inputTipe): float
    {
        if ($inputTipe === 'checkbox') {
            return self::isCheckboxTruthy($raw) ? 1.0 : 0.0;
        }
        if ($inputTipe === 'teks') {
            if ($raw === null || $raw === '') {
                return 0.0;
            }

            return self::numericFromScalarText((string) $raw);
        }
        if ($raw === null || $raw === '') {
            return 0.0;
        }
        if (is_numeric($raw)) {
            return (float) $raw;
        }
        $s = trim((string) $raw);
        $s = str_replace(["\xc2\xa0", ' '], '', $s);
        $s = str_replace(',', '.', $s);
        if ($s === '' || !is_numeric($s)) {
            return 0.0;
        }

        return (float) $s;
    }

    private static function formatNumberId(float $n): string
    {
        return number_format($n, 2, ',', '.');
    }

    private static function formatRupiahId(float $n): string
    {
        return 'Rp ' . number_format($n, 0, ',', '.');
    }

    /** Nilai rumus = angka persen (mis. 12,5 → 12,50 %). */
    private static function formatPersenId(float $n): string
    {
        return number_format($n, 2, ',', '.') . ' %';
    }

    private static function isCheckboxTruthy(mixed $raw): bool
    {
        return PengurusBooleanHelper::isTruthy($raw);
    }

    /** Untuk env rumus @[k]: parse angka dari teks (mis. rekening), 0 jika bukan angka. */
    private static function numericFromScalarText(string $text): float
    {
        $t = trim($text);
        if ($t === '') {
            return 0.0;
        }
        if (is_numeric($t)) {
            $n = (float) $t;

            return is_finite($n) ? $n : 0.0;
        }
        $norm = str_replace(["\xc2\xa0", ' '], '', $t);
        $norm = str_replace(',', '.', $norm);
        if ($norm !== '' && is_numeric($norm)) {
            $n = (float) $norm;

            return is_finite($n) ? $n : 0.0;
        }

        return 0.0;
    }
}

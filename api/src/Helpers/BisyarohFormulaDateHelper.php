<?php

declare(strict_types=1);

namespace App\Helpers;

/**
 * Parse tanggal & fungsi rumus Bisyaroh: YEAR/TAHUN, MONTH/BULAN, DAY/TANGGAL,
 * DATEVAL, DATE/TGL, DATEDIF, DAYS, DATEADD — rujukan @[kolom], @pengurus/…, atau "YYYY-MM-DD".
 */
final class BisyarohFormulaDateHelper
{
    public const DATE_REF_PATTERN = '(?:@\[([a-zA-Z_][a-zA-Z0-9_]*)\]|@(pengurus|jabatan|pj|pengurus_jabatan)\[([a-zA-Z_][a-zA-Z0-9_]*)\]|"((?:\\\\.|[^"\\\\])*)")';

    private const TZ = 'Asia/Jakarta';

    /**
     * Preprocess semua fungsi tanggal berbasis rujukan → angka (serial/hari/bulan/tahun).
     *
     * @param array<string, string> $colTextEnv
     * @param array{pengurus: array<string, string>, jabatan: array<string, string>, pj: array<string, string>} $ctx
     */
    public static function preprocessDateFunctions(string $formula, array $colTextEnv, array $ctx): string
    {
        $out = $formula;
        $resolver = static fn (array $m): ?\DateTimeImmutable => self::resolveDateRefMatch($m, $colTextEnv, $ctx);

        $unaryGroups = [
            ['DATEVAL', 'TGLVAL'],
            ['YEAR', 'TAHUN'],
            ['MONTH', 'BULAN'],
            ['DAY', 'TANGGAL'],
        ];

        foreach ($unaryGroups as $names) {
            $alt = implode('|', $names);
            $pattern = '/\b(?:' . $alt . ')\s*\(\s*' . self::DATE_REF_PATTERN . '\s*\)/iu';
            $replaced = preg_replace_callback(
                $pattern,
                static function (array $m) use ($resolver, $names): string {
                    $dt = $resolver($m);
                    $fnName = strtoupper($names[0]);
                    if (in_array($fnName, ['DATEVAL', 'TGLVAL'], true)) {
                        return self::numStr($dt === null ? 0.0 : self::toSerial($dt));
                    }
                    if (in_array($fnName, ['YEAR', 'TAHUN'], true)) {
                        return self::numStr($dt === null ? 0.0 : (float) (int) $dt->format('Y'));
                    }
                    if (in_array($fnName, ['MONTH', 'BULAN'], true)) {
                        return self::numStr($dt === null ? 0.0 : (float) (int) $dt->format('n'));
                    }

                    return self::numStr($dt === null ? 0.0 : (float) (int) $dt->format('j'));
                },
                $out
            );
            if (is_string($replaced)) {
                $out = $replaced;
            }
        }

        $patternDays = '/\bDAYS\s*\(\s*' . self::DATE_REF_PATTERN . '\s*[,;]\s*' . self::DATE_REF_PATTERN . '\s*\)/iu';
        $replaced = preg_replace_callback(
            $patternDays,
            static function (array $m) use ($resolver): string {
                $end = $resolver(self::shiftRefMatch($m, 1));
                $start = $resolver(self::shiftRefMatch($m, 5));

                return self::numStr((float) self::daysBetween($start, $end));
            },
            $out
        );
        if (is_string($replaced)) {
            $out = $replaced;
        }

        $patternDif = '/\bDATEDIF\s*\(\s*' . self::DATE_REF_PATTERN . '\s*[,;]\s*' . self::DATE_REF_PATTERN . '\s*[,;]\s*"?([A-Za-z]+)"?\s*\)/iu';
        $replaced = preg_replace_callback(
            $patternDif,
            static function (array $m) use ($resolver): string {
                $start = $resolver(self::shiftRefMatch($m, 1));
                $end = $resolver(self::shiftRefMatch($m, 5));
                $unit = (string) ($m[9] ?? 'D');

                return self::numStr((float) self::dateDiff($start, $end, $unit));
            },
            $out
        );
        if (is_string($replaced)) {
            $out = $replaced;
        }

        $patternAdd = '/\bDATEADD\s*\(\s*' . self::DATE_REF_PATTERN . '\s*[,;]\s*(-?\d+(?:[.,]\d+)?)\s*[,;]\s*"?([A-Za-z]+)"?\s*\)/iu';
        $replaced = preg_replace_callback(
            $patternAdd,
            static function (array $m) use ($resolver): string {
                $base = $resolver(self::shiftRefMatch($m, 1));
                $nRaw = str_replace(',', '.', (string) ($m[5] ?? '0'));
                $n = (int) round((float) $nRaw);
                $unit = (string) ($m[6] ?? 'D');
                $added = self::dateAdd($base, $n, $unit);

                return self::numStr($added === null ? 0.0 : self::toSerial($added));
            },
            $out
        );
        if (is_string($replaced)) {
            $out = $replaced;
        }

        return $out;
    }

    public static function parseDateString(string $raw): ?\DateTimeImmutable
    {
        $t = trim($raw);
        if ($t === '') {
            return null;
        }
        if (preg_match('/^[\s\x{00A0}\x{2007}\x{202F}\-\x{2013}\x{2014}]+$/u', $t)) {
            return null;
        }
        if (preg_match('/^\d{4}$/', $t)) {
            return self::safeCreate((int) $t, 1, 1);
        }
        if (preg_match('/^(\d{4})-(\d{1,2})-(\d{1,2})/', $t, $m)) {
            return self::safeCreate((int) $m[1], (int) $m[2], (int) $m[3]);
        }
        if (preg_match('/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})/', $t, $m)) {
            $a = (int) $m[1];
            $b = (int) $m[2];
            $y = (int) $m[3];
            if ($y < 100) {
                $y += $y >= 70 ? 1900 : 2000;
            }
            if ($a > 31 && $b <= 12) {
                return self::safeCreate($a, $b, $y);
            }
            if ($b > 31 && $a <= 12) {
                return self::safeCreate($b, $a, $y);
            }

            return self::safeCreate($y, $b, $a);
        }
        try {
            $tz = new \DateTimeZone(self::TZ);
            $dt = new \DateTimeImmutable($t, $tz);

            return $dt->setTime(0, 0, 0);
        } catch (\Throwable $e) {
            return null;
        }
    }

    public static function toSerial(\DateTimeImmutable $dt): float
    {
        $tz = new \DateTimeZone(self::TZ);
        $local = $dt->setTimezone($tz)->setTime(0, 0, 0);
        $epoch = new \DateTimeImmutable('1970-01-01 00:00:00', $tz);

        return (float) (int) floor(($local->getTimestamp() - $epoch->getTimestamp()) / 86400);
    }

    public static function fromSerial(float $serial): ?\DateTimeImmutable
    {
        try {
            $tz = new \DateTimeZone(self::TZ);
            $epoch = new \DateTimeImmutable('1970-01-01 00:00:00', $tz);
            $days = (int) round($serial);

            return $epoch->modify(($days >= 0 ? '+' : '') . $days . ' days');
        } catch (\Throwable $e) {
            return null;
        }
    }

    public static function daysBetween(?\DateTimeImmutable $start, ?\DateTimeImmutable $end): int
    {
        if ($start === null || $end === null) {
            return 0;
        }
        $s = self::toSerial($start);
        $e = self::toSerial($end);

        return (int) round($e - $s);
    }

    public static function dateDiff(?\DateTimeImmutable $start, ?\DateTimeImmutable $end, string $unit): int
    {
        if ($start === null || $end === null) {
            return 0;
        }
        $u = strtoupper(trim($unit));
        if (in_array($u, ['D', 'H', 'HARI', 'DAY', 'DAYS'], true)) {
            return self::daysBetween($start, $end);
        }
        if ($start > $end) {
            return -self::dateDiff($end, $start, $unit);
        }
        if (in_array($u, ['M', 'BULAN', 'MONTH', 'MONTHS'], true)) {
            return self::fullMonthsBetween($start, $end);
        }
        if (in_array($u, ['Y', 'TAHUN', 'YEAR', 'YEARS'], true)) {
            return self::fullYearsBetween($start, $end);
        }
        throw new \InvalidArgumentException(
            'DATEDIF satuan tidak dikenal: ' . $unit . '. Gunakan D/HARI (hari), M/BULAN (bulan penuh), Y/TAHUN (tahun penuh).'
        );
    }

    public static function dateAdd(?\DateTimeImmutable $dt, int $n, string $unit): ?\DateTimeImmutable
    {
        if ($dt === null) {
            return null;
        }
        $u = strtoupper(trim($unit));
        try {
            if (in_array($u, ['D', 'H', 'HARI', 'DAY', 'DAYS'], true)) {
                return $dt->modify(($n >= 0 ? '+' : '') . $n . ' days');
            }
            if (in_array($u, ['M', 'BULAN', 'MONTH', 'MONTHS'], true)) {
                return $dt->modify(($n >= 0 ? '+' : '') . $n . ' months');
            }
            if (in_array($u, ['Y', 'TAHUN', 'YEAR', 'YEARS'], true)) {
                return $dt->modify(($n >= 0 ? '+' : '') . $n . ' years');
            }
        } catch (\Throwable $e) {
            return null;
        }
        throw new \InvalidArgumentException(
            'DATEADD satuan tidak dikenal: ' . $unit . '. Gunakan D/HARI, M/BULAN, atau Y/TAHUN.'
        );
    }

    public static function buildDate(int $year, int $month, int $day): ?\DateTimeImmutable
    {
        return self::safeCreate($year, $month, $day);
    }

    /**
     * @param array<string, string> $colTextEnv
     * @param array{pengurus: array<string, string>, jabatan: array<string, string>, pj: array<string, string>} $ctx
     */
    public static function resolveDateRefMatch(array $m, array $colTextEnv, array $ctx): ?\DateTimeImmutable
    {
        if (!empty($m[1])) {
            $col = $m[1];
            if (!array_key_exists($col, $colTextEnv)) {
                throw new \InvalidArgumentException(
                    'Referensi @[' . $col . '] belum tersedia untuk fungsi tanggal (kolom di atas / urutan kolom).'
                );
            }

            return self::parseDateString((string) ($colTextEnv[$col] ?? ''));
        }
        if (!empty($m[2])) {
            $ns = strtolower($m[2]);
            $col = $m[3] ?? '';
            $map = self::mapForNamespace($ctx, $ns);
            if ($ns === 'pengurus' && !BisyarohPengurusFormulaHelper::isAllowedColumn($col)) {
                throw new \InvalidArgumentException('Kolom pengurus tidak diizinkan: ' . $col);
            }
            if ($ns === 'jabatan' && !BisyarohPengurusFormulaHelper::isAllowedJabatanColumn($col)) {
                throw new \InvalidArgumentException('Kolom jabatan tidak diizinkan: ' . $col);
            }
            if (($ns === 'pj' || $ns === 'pengurus_jabatan') && !BisyarohPengurusFormulaHelper::isAllowedPjColumn($col)) {
                throw new \InvalidArgumentException('Kolom penugasan tidak diizinkan: ' . $col);
            }

            return self::parseDateString((string) ($map[$col] ?? ''));
        }
        if (isset($m[4])) {
            return self::parseDateString(stripcslashes((string) $m[4]));
        }

        return null;
    }

    /**
     * @param array{pengurus: array<string, string>, jabatan: array<string, string>, pj: array<string, string>} $ctx
     * @return array<string, string>
     */
    private static function mapForNamespace(array $ctx, string $ns): array
    {
        if ($ns === 'pengurus') {
            return $ctx['pengurus'] ?? [];
        }
        if ($ns === 'jabatan') {
            return $ctx['jabatan'] ?? [];
        }

        return $ctx['pj'] ?? [];
    }

    /** Ambil 4 grup rujukan dari match DATEDIF/DAYS (offset grup ke-n). */
    private static function shiftRefMatch(array $m, int $offset): array
    {
        return [
            0 => '',
            1 => $m[$offset] ?? '',
            2 => $m[$offset + 1] ?? '',
            3 => $m[$offset + 2] ?? '',
            4 => $m[$offset + 3] ?? '',
        ];
    }

    private static function safeCreate(int $year, int $month, int $day): ?\DateTimeImmutable
    {
        if ($year < 1900 || $year > 2100 || $month < 1 || $month > 12 || $day < 1 || $day > 31) {
            return null;
        }
        $tz = new \DateTimeZone(self::TZ);
        $dt = \DateTimeImmutable::createFromFormat('Y-n-j', $year . '-' . $month . '-' . $day, $tz);
        if ($dt === false) {
            return null;
        }
        $errors = \DateTimeImmutable::getLastErrors();
        if (is_array($errors) && (($errors['warning_count'] ?? 0) > 0 || ($errors['error_count'] ?? 0) > 0)) {
            return null;
        }

        return $dt->setTime(0, 0, 0);
    }

    private static function fullMonthsBetween(\DateTimeImmutable $start, \DateTimeImmutable $end): int
    {
        $months = ((int) $end->format('Y') - (int) $start->format('Y')) * 12
            + ((int) $end->format('n') - (int) $start->format('n'));
        if ((int) $end->format('j') < (int) $start->format('j')) {
            --$months;
        }

        return max(0, $months);
    }

    private static function fullYearsBetween(\DateTimeImmutable $start, \DateTimeImmutable $end): int
    {
        $years = (int) $end->format('Y') - (int) $start->format('Y');
        $endMonthDay = (int) $end->format('md');
        $startMonthDay = (int) $start->format('md');
        if ($endMonthDay < $startMonthDay) {
            --$years;
        }

        return max(0, $years);
    }

    private static function numStr(float $n): string
    {
        if (!is_finite($n)) {
            return '0';
        }

        return rtrim(rtrim(sprintf('%.12F', $n), '0'), '.');
    }
}

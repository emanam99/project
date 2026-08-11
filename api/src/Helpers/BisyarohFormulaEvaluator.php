<?php

declare(strict_types=1);

namespace App\Helpers;

/**
 * Evaluator rumus gaya Excel ringan: @[kunci], angka, + - * / ^, perbandingan (>, <, >=, <=, ==, !=),
 * (), SUM/…/IF/… — argumen fungsi dipisah titik koma (;). Desimal boleh koma (12,5) atau titik.
 * Tanpa eval() PHP — aman untuk input admin.
 */
final class BisyarohFormulaEvaluator
{
    /**
     * Ganti @[col_key] dengan nilai numerik dari $env (sudah termasuk hasil rumus sebelumnya).
     *
     * @param array<string, float|int> $env
     */
    public static function substituteRefs(string $formula, array $env): string
    {
        $out = preg_replace_callback(
            '/@\[([a-zA-Z_][a-zA-Z0-9_]*)\]/',
            static function (array $m) use ($env): string {
                $k = $m[1];
                if (!array_key_exists($k, $env)) {
                    throw new \InvalidArgumentException('Referensi @[' . $k . '] belum tersedia (isi kolom di atas / urutan kolom).');
                }
                $v = $env[$k];
                if (!is_numeric($v)) {
                    throw new \InvalidArgumentException('Referensi @[' . $k . '] bukan angka.');
                }

                return '(' . self::numToString((float) $v) . ')';
            },
            $formula
        );
        if (!is_string($out)) {
            throw new \InvalidArgumentException('Rumus tidak valid.');
        }

        return $out;
    }

    /**
     * Konversi pemisah argumen fungsi → titik koma ASCII (;).
     * Koma desimal (0,5) tidak diubah. Titik koma lebar (Excel/Word U+FF1B) ikut dinormalisasi.
     * CONTAINS/HASJABATAN harus sudah dipreproses sebelum evaluasi numerik.
     */
    public static function normalizeFunctionArgCommas(string $formula): string
    {
        $len = strlen($formula);
        if ($len === 0) {
            return $formula;
        }
        $out = '';
        $depth = 0;
        $inString = false;
        $escape = false;
        for ($i = 0; $i < $len;) {
            [$ch, $clen] = self::utf8CharAt($formula, $i, $len);
            if ($clen <= 0) {
                break;
            }
            if ($inString) {
                $out .= $ch;
                if ($escape) {
                    $escape = false;
                } elseif ($ch === '\\') {
                    $escape = true;
                } elseif ($ch === '"') {
                    $inString = false;
                }
                $i += $clen;
                continue;
            }
            if ($ch === '"') {
                $inString = true;
                $out .= $ch;
                $i += $clen;
                continue;
            }
            if ($ch === '(') {
                ++$depth;
                $out .= $ch;
                $i += $clen;
                continue;
            }
            if ($ch === ')') {
                if ($depth > 0) {
                    --$depth;
                }
                $out .= $ch;
                $i += $clen;
                continue;
            }
            if ($depth > 0 && self::isUnicodeArgSeparator($ch)) {
                $out .= ';';
                $i += $clen;
                continue;
            }
            if ($ch === ',' && $depth > 0) {
                $out .= self::isDecimalCommaAt($formula, $i) ? ',' : ';';
                $i += $clen;
                continue;
            }
            $out .= $ch;
            $i += $clen;
        }

        return $out;
    }

    /**
     * @return array{0: string, 1: int} karakter UTF-8 + panjang byte
     */
    private static function utf8CharAt(string $s, int $i, int $len): array
    {
        if ($i >= $len) {
            return ['', 0];
        }
        $b = ord($s[$i]);
        if ($b < 0x80) {
            return [$s[$i], 1];
        }
        if (($b & 0xE0) === 0xC0 && $i + 1 < $len) {
            return [substr($s, $i, 2), 2];
        }
        if (($b & 0xF0) === 0xE0 && $i + 2 < $len) {
            return [substr($s, $i, 3), 3];
        }
        if (($b & 0xF8) === 0xF0 && $i + 3 < $len) {
            return [substr($s, $i, 4), 4];
        }

        return [$s[$i], 1];
    }

    private static function isUnicodeArgSeparator(string $ch): bool
    {
        static $seps = ["\x3B", "\xEF\xBC\x9B", "\xCE\x87", "\xD8\x9B"];

        return in_array($ch, $seps, true);
    }

    private static function isDecimalCommaAt(string $s, int $pos): bool
    {
        if ($pos <= 0 || $pos + 1 >= strlen($s)) {
            return false;
        }

        return ctype_digit($s[$pos - 1]) && ctype_digit($s[$pos + 1]);
    }

    /**
     * Evaluasi ekspresi setelah referensi disubstitusi angka.
     */
    public static function evaluateNumericExpression(string $expression): float
    {
        $p = new self();
        $p->s = self::normalizeFunctionArgCommas(trim($expression));
        $p->n = strlen($p->s);
        $p->i = 0;
        if ($p->n === 0) {
            throw new \InvalidArgumentException('Rumus kosong.');
        }
        $v = $p->parseComparison();
        $p->skipWs();
        if ($p->i < $p->n) {
            throw new \InvalidArgumentException('Ekspresi tidak lengkap di posisi ' . ($p->i + 1) . '.');
        }

        return $v;
    }

    private static function isTruthy(float $v): bool
    {
        return abs($v) >= 1e-15;
    }

    private string $s = '';

    private int $n = 0;

    private int $i = 0;

    private static function numToString(float $x): string
    {
        if (!is_finite($x)) {
            throw new \InvalidArgumentException('Hasil tidak berhingga.');
        }

        return rtrim(rtrim(sprintf('%.12F', $x), '0'), '.');
    }

    private function skipWs(): void
    {
        while ($this->i < $this->n && ctype_space($this->s[$this->i])) {
            ++$this->i;
        }
    }

    private function parseComparison(): float
    {
        $v = $this->parseExpression();
        while (true) {
            $this->skipWs();
            if ($this->i >= $this->n) {
                break;
            }
            $op = $this->readComparisonOp();
            if ($op === null) {
                break;
            }
            $r = $this->parseExpression();
            $v = self::applyComparison($op, $v, $r) ? 1.0 : 0.0;
        }

        return $v;
    }

    /** @return string|null */
    private function readComparisonOp(): ?string
    {
        if ($this->i + 1 < $this->n) {
            $two = $this->s[$this->i] . $this->s[$this->i + 1];
            if (in_array($two, ['>=', '<=', '==', '!='], true)) {
                $this->i += 2;

                return $two;
            }
        }
        $c = $this->s[$this->i];
        if ($c === '>' || $c === '<') {
            ++$this->i;

            return $c;
        }
        if ($c === '=') {
            ++$this->i;

            return '==';
        }

        return null;
    }

    private static function applyComparison(string $op, float $a, float $b): bool
    {
        return match ($op) {
            '>=' => $a >= $b - 1e-15,
            '<=' => $a <= $b + 1e-15,
            '==' => abs($a - $b) < 1e-9,
            '!=' => abs($a - $b) >= 1e-9,
            '>' => $a > $b + 1e-15,
            '<' => $a < $b - 1e-15,
            default => false,
        };
    }

    private function parseExpression(): float
    {
        $v = $this->parseTerm();
        while (true) {
            $this->skipWs();
            if ($this->i >= $this->n) {
                break;
            }
            $op = $this->s[$this->i];
            if ($op !== '+' && $op !== '-') {
                break;
            }
            ++$this->i;
            $r = $this->parseTerm();
            $v = $op === '+' ? $v + $r : $v - $r;
        }

        return $v;
    }

    private function parseTerm(): float
    {
        $v = $this->parsePower();
        while (true) {
            $this->skipWs();
            if ($this->i >= $this->n) {
                break;
            }
            $op = $this->s[$this->i];
            if ($op !== '*' && $op !== '/') {
                break;
            }
            ++$this->i;
            $r = $this->parsePower();
            if ($op === '/' && abs($r) < 1e-15) {
                throw new \InvalidArgumentException('Pembagian dengan nol.');
            }
            $v = $op === '*' ? $v * $r : $v / $r;
        }

        return $v;
    }

    private function parsePower(): float
    {
        $v = $this->parseUnary();
        $this->skipWs();
        if ($this->i < $this->n && $this->s[$this->i] === '^') {
            ++$this->i;
            $r = $this->parseUnary();

            return pow($v, $r);
        }

        return $v;
    }

    private function parseUnary(): float
    {
        $this->skipWs();
        if ($this->i < $this->n && ($this->s[$this->i] === '+' || $this->s[$this->i] === '-')) {
            $sign = $this->s[$this->i] === '-' ? -1.0 : 1.0;
            ++$this->i;

            return $sign * $this->parseUnary();
        }

        return $this->parsePrimary();
    }

    private function parsePrimary(): float
    {
        $this->skipWs();
        if ($this->i >= $this->n) {
            throw new \InvalidArgumentException('Ekspresi terpotong.');
        }
        if ($this->s[$this->i] === '(') {
            ++$this->i;
            $v = $this->parseComparison();
            $this->skipWs();
            if ($this->i >= $this->n || $this->s[$this->i] !== ')') {
                throw new \InvalidArgumentException('Kurung tutup ) hilang.');
            }
            ++$this->i;

            return $v;
        }
        if (ctype_digit($this->s[$this->i]) || ($this->s[$this->i] === '.' && $this->i + 1 < $this->n && ctype_digit($this->s[$this->i + 1]))) {
            return $this->parseNumber();
        }
        if ($this->s[$this->i] === '"') {
            throw new \InvalidArgumentException(
                'Teks dalam tanda kutip tidak didukung langsung. Untuk cek teks kolom pakai CONTAINS(@jabatan[kolom]; "teks") atau @jabatan[kolom] = "teks" (akan diubah ke CONTAINS).'
            );
        }
        if (ctype_alpha($this->s[$this->i])) {
            return $this->parseFunction();
        }
        throw new \InvalidArgumentException('Karakter tidak diharapkan di posisi ' . ($this->i + 1) . '.');
    }

    private function parseNumber(): float
    {
        $start = $this->i;
        while ($this->i < $this->n && ctype_digit($this->s[$this->i])) {
            ++$this->i;
        }
        if ($this->i < $this->n && $this->s[$this->i] === '.') {
            $dotAt = $this->i;
            ++$this->i;
            if ($this->i < $this->n && ctype_digit($this->s[$this->i])) {
                while ($this->i < $this->n && ctype_digit($this->s[$this->i])) {
                    ++$this->i;
                }
            } else {
                $this->i = $dotAt;
            }
        } elseif ($this->i < $this->n && $this->s[$this->i] === ',') {
            // Desimal Indonesia (12,5); koma tanpa digit berikutnya = pemisah argumen fungsi.
            $commaAt = $this->i;
            if ($this->i + 1 < $this->n && ctype_digit($this->s[$this->i + 1])) {
                ++$this->i;
                while ($this->i < $this->n && ctype_digit($this->s[$this->i])) {
                    ++$this->i;
                }
            } else {
                $this->i = $commaAt;
            }
        }
        $slice = substr($this->s, $start, $this->i - $start);
        $normalized = str_replace(',', '.', $slice);
        if ($normalized === '' || !is_numeric($normalized)) {
            throw new \InvalidArgumentException('Angka tidak valid.');
        }

        return (float) $normalized;
    }

    private function parseFunction(): float
    {
        $start = $this->i;
        while ($this->i < $this->n && (ctype_alpha($this->s[$this->i]) || $this->s[$this->i] === '_')) {
            ++$this->i;
        }
        $name = strtoupper(substr($this->s, $start, $this->i - $start));
        $this->skipWs();
        if ($this->i >= $this->n || $this->s[$this->i] !== '(') {
            throw new \InvalidArgumentException('Fungsi ' . $name . ' perlu tanda (.');
        }
        ++$this->i;
        $args = [];
        $this->skipWs();
        if ($this->i < $this->n && $this->s[$this->i] === ')') {
            ++$this->i;
        } else {
            while (true) {
                $args[] = $this->parseComparison();
                $this->skipWs();
                if ($this->i >= $this->n) {
                    throw new \InvalidArgumentException('Kurung fungsi tidak lengkap.');
                }
                if ($this->s[$this->i] === ')') {
                    ++$this->i;
                    break;
                }
                if ($this->s[$this->i] !== ';') {
                    if ($this->s[$this->i] === '=') {
                        throw new \InvalidArgumentException(
                            'Perbandingan teks: gunakan CONTAINS(@jabatan[kolom]; "teks") atau bentuk @jabatan[kolom] = "teks" (bukan = di tengah argumen fungsi). Operator angka: == bukan = tunggal di dalam ekspresi.'
                        );
                    }
                    throw new \InvalidArgumentException(
                        'Pemisah argumen fungsi wajib titik koma (;), mis. IF(kondisi; benar; salah) atau SUM(@[a]; @[b]). Angka desimal pakai koma: 12,5.'
                    );
                }
                ++$this->i;
            }
        }

        return self::applyFunction($name, $args);
    }

    /**
     * @param list<float> $args
     */
    private static function applyFunction(string $name, array $args): float
    {
        switch ($name) {
            case 'SUM':
                return array_sum($args);
            case 'AVERAGE':
            case 'AVG':
                if ($args === []) {
                    throw new \InvalidArgumentException('AVERAGE membutuhkan minimal satu argumen.');
                }

                return array_sum($args) / count($args);
            case 'MIN':
                if ($args === []) {
                    throw new \InvalidArgumentException('MIN membutuhkan argumen.');
                }

                return min($args);
            case 'MAX':
                if ($args === []) {
                    throw new \InvalidArgumentException('MAX membutuhkan argumen.');
                }

                return max($args);
            case 'ABS':
                if (count($args) !== 1) {
                    throw new \InvalidArgumentException('ABS membutuhkan tepat 1 argumen.');
                }

                return abs($args[0]);
            case 'ROUND':
                if (count($args) < 1 || count($args) > 2) {
                    throw new \InvalidArgumentException('ROUND(x) atau ROUND(x; digit).');
                }
                $dec = count($args) === 2 ? (int) round($args[1]) : 0;
                $mul = pow(10, max(0, min(12, $dec)));

                return round($args[0] * $mul) / $mul;
            case 'POWER':
            case 'POW':
                if (count($args) !== 2) {
                    throw new \InvalidArgumentException('POWER(a; b) membutuhkan 2 argumen.');
                }

                return pow($args[0], $args[1]);
            case 'PERCENT':
                if (count($args) !== 2) {
                    throw new \InvalidArgumentException('PERCENT(bagian; total) — persen bagian dari total.');
                }
                $total = $args[1];
                if (abs($total) < 1e-15) {
                    return 0.0;
                }

                return ($args[0] / $total) * 100.0;
            case 'IF':
                if (count($args) !== 3) {
                    throw new \InvalidArgumentException('IF(kondisi; nilai_jika_benar; nilai_jika_salah) — 3 argumen.');
                }

                return self::isTruthy($args[0]) ? $args[1] : $args[2];
            case 'AND':
                if ($args === []) {
                    throw new \InvalidArgumentException('AND membutuhkan minimal satu argumen.');
                }
                foreach ($args as $a) {
                    if (!self::isTruthy($a)) {
                        return 0.0;
                    }
                }

                return 1.0;
            case 'OR':
                if ($args === []) {
                    throw new \InvalidArgumentException('OR membutuhkan minimal satu argumen.');
                }
                foreach ($args as $a) {
                    if (self::isTruthy($a)) {
                        return 1.0;
                    }
                }

                return 0.0;
            case 'NOT':
                if (count($args) !== 1) {
                    throw new \InvalidArgumentException('NOT membutuhkan tepat 1 argumen.');
                }

                return self::isTruthy($args[0]) ? 0.0 : 1.0;
            case 'MOD':
                if (count($args) !== 2) {
                    throw new \InvalidArgumentException('MOD(a; b) membutuhkan 2 argumen.');
                }
                if (abs($args[1]) < 1e-15) {
                    throw new \InvalidArgumentException('MOD: pembagi tidak boleh nol.');
                }

                return fmod($args[0], $args[1]);
            case 'FLOOR':
                if (count($args) !== 1) {
                    throw new \InvalidArgumentException('FLOOR membutuhkan tepat 1 argumen.');
                }

                return floor($args[0]);
            case 'CEIL':
                if (count($args) !== 1) {
                    throw new \InvalidArgumentException('CEIL membutuhkan tepat 1 argumen.');
                }

                return ceil($args[0]);
            case 'DATE':
            case 'TGL':
                if (count($args) !== 3) {
                    throw new \InvalidArgumentException('DATE(tahun; bulan; tanggal) — 3 argumen angka, mis. DATE(2024; 6; 15).');
                }
                $built = BisyarohFormulaDateHelper::buildDate(
                    (int) round($args[0]),
                    (int) round($args[1]),
                    (int) round($args[2])
                );

                return $built === null ? 0.0 : BisyarohFormulaDateHelper::toSerial($built);
            default:
                throw new \InvalidArgumentException('Fungsi tidak dikenal: ' . $name);
        }
    }
}

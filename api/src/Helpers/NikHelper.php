<?php

namespace App\Helpers;

/**
 * Helper validasi NIK (Nomor Induk Kependudukan) Indonesia.
 * NIK 16 digit; digit 7-12 (1-based) = DDMMYY (tanggal lahir).
 * Perempuan: hari disimpan +40 (41-71 = hari 1-31).
 * Tahun: 2 digit < 40 = 20XX, >= 40 = 19XX.
 */
class NikHelper
{
    /** Pesan generic saat NIK tidak valid (tidak mengungkap detail ke user). */
    public const INVALID_MESSAGE = 'Coba kembali periksa NIK.';

    /**
     * Normalisasi NIK: hanya digit, panjang tepat 16.
     *
     * @param string $nik
     * @return string|null 16 digit atau null jika setelah dibersihkan bukan 16 digit
     */
    public static function normalize(string $nik): ?string
    {
        $digits = preg_replace('/\D/', '', $nik);
        return strlen($digits) === 16 ? $digits : null;
    }

    /**
     * Validasi NIK: 16 digit dan bagian tanggal lahir harus membentuk tanggal yang valid.
     *
     * @param string $nik
     * @return array{valid: bool, normalized: string|null, message: string}
     */
    public static function validate(string $nik): array
    {
        $normalized = self::normalize($nik);
        if ($normalized === null) {
            return ['valid' => false, 'normalized' => null, 'message' => self::INVALID_MESSAGE];
        }

        if (!self::isDatePartValid($normalized)) {
            return ['valid' => false, 'normalized' => $normalized, 'message' => self::INVALID_MESSAGE];
        }

        return ['valid' => true, 'normalized' => $normalized, 'message' => ''];
    }

    /**
     * Parse biodata dari NIK valid: gender, tanggal_lahir (Y-m-d), tempat_lahir (kabupaten).
     *
     * @return array{gender: string|null, tanggal_lahir: string|null, tempat_lahir: string|null}|null
     */
    public static function parseIdentity(string $nik): ?array
    {
        $check = self::validate($nik);
        if (!$check['valid'] || $check['normalized'] === null) {
            return null;
        }
        $n = $check['normalized'];
        $parts = self::parseDateParts($n);
        if ($parts === null) {
            return null;
        }

        return [
            'gender' => $parts['gender'],
            'tanggal_lahir' => sprintf(
                '%04d-%02d-%02d',
                $parts['year'],
                $parts['month'],
                $parts['day']
            ),
            'tempat_lahir' => self::tempatLahirFromKode(substr($n, 0, 4)),
        ];
    }

    public static function tempatLahirFromKode(string $kode4): ?string
    {
        $map = [
            '3509' => 'Jember',
            '3511' => 'Bondowoso',
        ];
        return $map[$kode4] ?? null;
    }

    /**
     * Cek apakah bagian tanggal lahir di NIK (digit 7-12) valid.
     */
    private static function isDatePartValid(string $nik16): bool
    {
        return self::parseDateParts($nik16) !== null;
    }

    /**
     * @return array{day: int, month: int, year: int, gender: string}|null
     */
    private static function parseDateParts(string $nik16): ?array
    {
        $dayPart = (int) substr($nik16, 6, 2);
        $month = (int) substr($nik16, 8, 2);
        $year2 = (int) substr($nik16, 10, 2);

        if ($month < 1 || $month > 12) {
            return null;
        }

        $day = $dayPart;
        $gender = 'Laki-laki';
        if ($dayPart >= 41 && $dayPart <= 71) {
            $day = $dayPart - 40;
            $gender = 'Perempuan';
        }
        if ($day < 1 || $day > 31) {
            return null;
        }

        $year = $year2 < 40 ? (2000 + $year2) : (1900 + $year2);
        if (!checkdate($month, $day, $year)) {
            return null;
        }

        return [
            'day' => $day,
            'month' => $month,
            'year' => $year,
            'gender' => $gender,
        ];
    }

    /**
     * Samarkan NIK/No.KK untuk response list (contoh: 3509********0003).
     * Nilai kosong/non-digit pendek → ****.
     */
    public static function mask(string $value): string
    {
        $digits = preg_replace('/\D/', '', $value) ?? '';
        if ($digits === '') {
            return $value === '' ? '' : '****';
        }
        $len = strlen($digits);
        if ($len < 8) {
            return '****';
        }
        $keepHead = min(4, (int) floor($len / 4));
        $keepTail = min(4, (int) floor($len / 4));
        if ($keepHead + $keepTail >= $len) {
            return str_repeat('*', $len);
        }

        return substr($digits, 0, $keepHead)
            . str_repeat('*', $len - $keepHead - $keepTail)
            . substr($digits, -$keepTail);
    }

    /**
     * Samarkan nomor telepon/WA (contoh: 0823****1216).
     */
    public static function maskPhone(string $value): string
    {
        $digits = preg_replace('/\D/', '', $value) ?? '';
        if ($digits === '') {
            return $value === '' ? '' : '****';
        }
        $len = strlen($digits);
        if ($len < 8) {
            return '****';
        }
        $head = min(4, $len - 4);
        $tail = 4;

        return substr($digits, 0, $head) . str_repeat('*', max(4, $len - $head - $tail)) . substr($digits, -$tail);
    }

    /** True jika nilai tampak disamarkan (mengandung *). */
    public static function looksMasked(string $value): bool
    {
        return strpos($value, '*') !== false;
    }

    /**
     * Samarkan email (contoh: sa***@test.id).
     */
    public static function maskEmail(string $value): string
    {
        $email = trim($value);
        if ($email === '' || strpos($email, '@') === false) {
            return $email === '' ? '' : '****';
        }
        [$local, $domain] = explode('@', $email, 2);
        $local = (string) $local;
        $domain = (string) $domain;
        if ($local === '') {
            return '****@' . $domain;
        }
        $keep = min(2, strlen($local));

        return substr($local, 0, $keep) . '***@' . $domain;
    }
}

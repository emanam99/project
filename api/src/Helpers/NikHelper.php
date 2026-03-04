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
     * Cek apakah bagian tanggal lahir di NIK (digit 7-12) valid.
     */
    private static function isDatePartValid(string $nik16): bool
    {
        $dayPart = (int) substr($nik16, 6, 2);   // digit 7-8
        $month = (int) substr($nik16, 8, 2);      // digit 9-10
        $year2 = (int) substr($nik16, 10, 2);     // digit 11-12

        if ($month < 1 || $month > 12) {
            return false;
        }

        $day = $dayPart;
        if ($dayPart >= 41 && $dayPart <= 71) {
            $day = $dayPart - 40;
        }
        if ($day < 1 || $day > 31) {
            return false;
        }

        $year = $year2 < 40 ? (2000 + $year2) : (1900 + $year2);
        return checkdate($month, $day, $year);
    }
}

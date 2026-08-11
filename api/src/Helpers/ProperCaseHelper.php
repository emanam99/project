<?php

declare(strict_types=1);

namespace App\Helpers;

/**
 * Normalisasi title case (huruf pertama tiap kata) untuk biodata & alamat — UTF-8.
 * Dipakai sebelum INSERT/UPDATE agar semua klien (daftar, eBeddien, myBeddien) konsisten.
 */
final class ProperCaseHelper
{
    /** Kolom teks nama/tempat lahir/alamat yang dinormalisakan (satu sumber kebenaran). */
    public const BIODATA_TITLE_CASE_FIELDS = [
        'nama',
        'kepala_keluarga',
        'ayah',
        'ibu',
        'wali',
        'bersama_wali',
        'tempat_lahir',
        'tempat_lahir_ayah',
        'tempat_lahir_ibu',
        'tempat_lahir_wali',
        'dusun',
        'desa',
        'kecamatan',
        'kabupaten',
        'provinsi',
        'rt',
        'rw',
    ];

    public static function isTitleCaseField(string $field): bool
    {
        return \in_array($field, self::BIODATA_TITLE_CASE_FIELDS, true);
    }

    /**
     * Title case per segmen kata (spasi / tanda hubung sebagai pemisah).
     * null → null; setelah trim kosong → null.
     */
    public static function toTitleCaseWords(?string $value): ?string
    {
        if ($value === null) {
            return null;
        }
        $value = trim($value);
        if ($value === '') {
            return null;
        }

        $lower = mb_strtolower($value, 'UTF-8');
        $parts = preg_split('/([\s\-]+)/u', $lower, -1, PREG_SPLIT_DELIM_CAPTURE);
        if ($parts === false) {
            return $value;
        }

        $result = '';
        foreach ($parts as $segment) {
            if ($segment === '') {
                continue;
            }
            if (preg_match('/^[\s\-]+$/u', $segment) === 1) {
                $result .= $segment;

                continue;
            }
            $char0 = mb_substr($segment, 0, 1, 'UTF-8');
            $rest = mb_substr($segment, 1, null, 'UTF-8');
            $result .= mb_strtoupper($char0, 'UTF-8') . $rest;
        }

        return $result === '' ? null : $result;
    }

    /**
     * Pastikan nilai kolom biodata scalar sebelum bind PDO.
     * Array/object yang di-cast string di PHP jadi "Array" dan merusak tampilan myBeddien.
     *
     * @param mixed $value
     * @return string|int|float|null
     */
    public static function coerceScalarBiodataValue($value)
    {
        if ($value === null || $value === '') {
            return null;
        }
        if (\is_bool($value) || \is_object($value)) {
            return null;
        }
        if (\is_array($value)) {
            foreach (['nama', 'name', 'value', 'label'] as $k) {
                if (!isset($value[$k]) || !\is_scalar($value[$k]) || \is_bool($value[$k])) {
                    continue;
                }
                $s = trim((string) $value[$k]);

                return $s === '' ? null : $s;
            }

            return null;
        }
        if (\is_int($value) || \is_float($value)) {
            return $value;
        }
        if (!\is_string($value)) {
            return null;
        }
        $t = trim($value);
        if ($t === '' || strcasecmp($t, 'Array') === 0) {
            return null;
        }

        return $t;
    }

    /**
     * @param mixed $value
     * @return mixed string|null atau nilai non-string tidak diubah
     */
    public static function forBiodataField(string $field, $value)
    {
        $value = self::coerceScalarBiodataValue($value);
        if (!self::isTitleCaseField($field)) {
            return $value;
        }
        if ($value === null) {
            return null;
        }
        if (!\is_string($value)) {
            return $value;
        }
        if ($value === '') {
            return null;
        }

        if ($field === 'rt' || $field === 'rw') {
            $t = trim($value);
            if ($t !== '' && ctype_digit($t)) {
                return $t;
            }
        }

        return self::toTitleCaseWords($value);
    }

    /**
     * Normalisasi tujuh kolom alamat sekaligus (urutan: dusun, rt, rw, desa, kecamatan, kabupaten, provinsi).
     *
     * @return array{0:?string,1:?string,2:?string,3:?string,4:?string,5:?string,6:?string}
     */
    public static function normalizeAddrSeven(
        ?string $dusun,
        ?string $rt,
        ?string $rw,
        ?string $desa,
        ?string $kecamatan,
        ?string $kabupaten,
        ?string $provinsi
    ): array {
        return [
            self::forBiodataField('dusun', $dusun),
            self::forBiodataField('rt', $rt),
            self::forBiodataField('rw', $rw),
            self::forBiodataField('desa', $desa),
            self::forBiodataField('kecamatan', $kecamatan),
            self::forBiodataField('kabupaten', $kabupaten),
            self::forBiodataField('provinsi', $provinsi),
        ];
    }
}

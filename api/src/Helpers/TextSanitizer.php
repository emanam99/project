<?php

namespace App\Helpers;

/**
 * Helper untuk memastikan teks bersih: valid UTF-8, aman untuk MySQL (utf8mb4) dan tampilan (WhatsApp, dll).
 * Mencegah data dari pendaftar dengan font/encoding aneh tampil sebagai '????????'.
 */
class TextSanitizer
{
    /**
     * Daftar field yang dianggap numerik/tanggal — tidak di-sanitize dengan cleanText (tetap trim).
     * Untuk field lain (string bebas) gunakan cleanText.
     */
    public const NUMERIC_OR_SPECIAL_FIELDS = [
        'id', 'grup', 'nis', 'nik', 'nik_ayah', 'nik_ibu', 'nik_wali', 'no_kk',
        'rt', 'rw', 'kode_pos', 'anak_ke', 'jumlah_saudara', 'saudara_di_pesantren',
        'id_kamar', 'id_diniyah', 'id_formal', 'id_admin', 'id_santri', 'id_registrasi',
        'tanggal_lahir', 'tanggal_lahir_ayah', 'tanggal_lahir_ibu', 'tanggal_lahir_wali',
        'lulus_madrasah', 'lulus_sekolah', 'npsn', 'nsm',
        'penghasilan_ayah', 'penghasilan_ibu', 'penghasilan_wali',
        'nim_diniyah', 'nim_formal', 'kelas_lttq', 'kel_lttq',
    ];

    /**
     * Membersihkan string agar selalu teks yang valid dan terbaca.
     * - Memastikan encoding UTF-8 valid (menghapus byte invalid)
     * - Menghapus karakter kontrol (kecuali tab, newline, carriage return)
     * - Menghapus karakter Private Use / pengganti yang sering bikin ? di MySQL/WA
     * - Normalisasi spasi berlebih dan trim
     *
     * @param string|null $value Input dari user (bisa dari form, copy-paste font aneh, dll)
     * @return string Teks bersih, tidak null (kosong "" jika input null/invalid)
     */
    public static function cleanText(?string $value): string
    {
        if ($value === null || $value === '') {
            return '';
        }

        // Pastikan kita bekerja dengan string (bisa dapat dari JSON/array)
        $value = (string) $value;

        // 1) Hapus byte invalid UTF-8 (konversi ke UTF-8 dari UTF-8 = drop invalid bytes)
        $value = mb_convert_encoding($value, 'UTF-8', 'UTF-8');
        if ($value === false) {
            return '';
        }

        // 2) Hapus karakter kontrol (0x00-0x1F kecuali \t\n\r, dan 0x7F)
        $value = preg_replace('/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/u', '', $value);

        // 3) Hapus Unicode Replacement Character (U+FFFD) yang sering muncul sebagai ?
        $value = str_replace("\xEF\xBF\xBD", '', $value);

        // 4) Hapus Private Use Area (sering dari font khusus) — U+E000–U+F8FF
        $value = preg_replace('/[\x{E000}-\x{F8FF}]/u', '', $value);

        // 5) Normalisasi bentuk Unicode ke NFC (satu karakter = satu glyph konsisten)
        if (class_exists('Normalizer') && method_exists('Normalizer', 'normalize')) {
            $nfc = \Normalizer::normalize($value, \Normalizer::FORM_C);
            if ($nfc !== false) {
                $value = $nfc;
            }
        }

        // 6) Normalisasi spasi: ganti multiple space/tab/newline dengan satu spasi, lalu trim
        $value = preg_replace('/[\s]+/u', ' ', $value);
        $value = trim($value);

        return $value;
    }

    /**
     * Membersihkan teks; jika hasil kosong kembalikan null (untuk field opsional di DB).
     *
     * @param string|null $value
     * @return string|null
     */
    public static function cleanTextOrNull(?string $value): ?string
    {
        $cleaned = self::cleanText($value);
        return $cleaned === '' ? null : $cleaned;
    }

    /**
     * Sanitasi array input: setiap nilai string (yang key-nya bukan numerik/special) di-cleanText.
     * Nilai non-string (int, float, bool, array) tidak diubah. Key tetap.
     *
     * @param array $input Data mentah dari request (getParsedBody)
     * @param array $stringKeys Daftar key yang harus di-sanitize sebagai teks. Jika kosong, semua key string dianggap teks kecuali yang di NUMERIC_OR_SPECIAL_FIELDS
     * @return array Array yang sama dengan nilai string sudah dibersihkan
     */
    public static function sanitizeStringValues(array $input, array $stringKeys = []): array
    {
        $useWhitelist = !empty($stringKeys);
        $out = [];
        foreach ($input as $key => $val) {
            if (!is_string($val)) {
                $out[$key] = $val;
                continue;
            }
            if ($useWhitelist) {
                $out[$key] = in_array($key, $stringKeys, true) ? self::cleanText($val) : $val;
            } else {
                $out[$key] = in_array($key, self::NUMERIC_OR_SPECIAL_FIELDS, true) ? trim($val) : self::cleanText($val);
            }
        }
        return $out;
    }
}

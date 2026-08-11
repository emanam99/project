<?php

namespace App\Helpers;

use PDO;

/**
 * ID Alumni 7 digit:
 * - Digit 1: gender — Laki-laki = 7, Perempuan = 8
 * - Digit 2–3: tahun Hijriyah boyong (2 digit terakhir)
 * - Digit 4–7: urutan 0001…9999 per prefix
 * Contoh: 7450001 = Laki-laki, tahun 45, urutan 1.
 */
class AlumniHelper
{
    /**
     * @return string|null "Laki-laki", "Perempuan", atau null
     */
    public static function normalizeGender(?string $gender): ?string
    {
        if ($gender === null || trim($gender) === '') {
            return null;
        }
        $first = strtoupper(substr(trim($gender), 0, 1));
        if ($first === 'L') {
            return 'Laki-laki';
        }
        if ($first === 'P') {
            return 'Perempuan';
        }
        return null;
    }

    /**
     * Infer gender dari NIK (digit hari +40 = perempuan).
     */
    public static function inferGenderFromNik(string $nik16): ?string
    {
        if (strlen($nik16) !== 16 || !ctype_digit($nik16)) {
            return null;
        }
        $dayPart = (int) substr($nik16, 6, 2);
        if ($dayPart >= 41 && $dayPart <= 71) {
            return 'Perempuan';
        }
        if ($dayPart >= 1 && $dayPart <= 31) {
            return 'Laki-laki';
        }
        return null;
    }

    /**
     * Prefix 3 digit (700–899): genderCode*100 + tahun 2 digit.
     *
     * @param string $gender "Laki-laki" atau "Perempuan"
     * @param string $tahunHijriyah "1445" atau "1445-1446"
     */
    public static function parsePrefixFromGenderAndTahun(string $gender, string $tahunHijriyah): int
    {
        $g = strtolower(trim($gender));
        $genderCode = (str_starts_with($g, 'p')) ? 8 : 7;

        $tahun = trim($tahunHijriyah);
        if (strpos($tahun, '-') !== false) {
            $parts = explode('-', $tahun);
            $tahun = trim($parts[0]);
        }
        $tahunDigits = preg_replace('/\D/', '', $tahun);
        if ($tahunDigits === '' || strlen($tahunDigits) < 2) {
            throw new \InvalidArgumentException('Tahun Hijriyah boyong tidak valid.');
        }
        $tahunCode = (int) substr($tahunDigits, -2);

        return $genderCode * 100 + $tahunCode;
    }

    /**
     * Generate id_alumni berikutnya untuk prefix (harus dalam transaksi + FOR UPDATE).
     */
    public static function generateNextIdAlumni(PDO $db, int $prefix): string
    {
        $prefix = (int) $prefix;
        if ($prefix < 700 || $prefix > 899) {
            throw new \InvalidArgumentException('Prefix ID Alumni harus 3 digit (700–899).');
        }

        $minId = $prefix * 10000;
        $maxId = ($prefix + 1) * 10000 - 1;

        $stmt = $db->prepare(
            'SELECT COALESCE(MAX(id_alumni), 0) AS mx FROM alumni WHERE id_alumni >= ? AND id_alumni <= ? FOR UPDATE'
        );
        $stmt->execute([$minId, $maxId]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        $maxVal = $row ? (int) $row['mx'] : 0;

        $nextSeq = ($maxVal < $minId) ? 1 : ($maxVal - $minId + 1);
        if ($nextSeq > 9999) {
            throw new \RuntimeException('Urutan ID Alumni untuk prefix ini sudah penuh (9999).');
        }

        return (string) ($minId + $nextSeq);
    }

    /**
     * Konversi tahun Masehi (YYYY) → tahun Hijriyah (YYYY string).
     * Pakai tanggal 1 Juli tahun tersebut di psa___kalender; fallback ~579.
     */
    public static function masehiYearToHijriyahYear(PDO $db, int $tahunMasehi): ?string
    {
        if ($tahunMasehi < 1900 || $tahunMasehi > 2200) {
            return null;
        }
        $ymd = sprintf('%04d-07-01', $tahunMasehi);
        $hijri = KalenderHelper::masehiToHijriyah($db, $ymd);
        if ($hijri !== null && preg_match('/^(\d{4})/', $hijri, $m)) {
            return $m[1];
        }
        // Fallback kasar jika kalender belum punya baris
        $approx = $tahunMasehi - 579;
        if ($approx >= 1300 && $approx <= 1600) {
            return (string) $approx;
        }
        return null;
    }

    /**
     * Konversi tahun Hijriyah (YYYY) → tahun Masehi (YYYY string).
     * Prioritas: YEAR(dari) master tahun_ajaran hijriyah → psa___kalender 07-01 → +579.
     */
    public static function hijriyahYearToMasehiYear(PDO $db, int $tahunHijriyah): ?string
    {
        if ($tahunHijriyah < 1300 || $tahunHijriyah > 1600) {
            return null;
        }

        try {
            $stmt = $db->prepare(
                "SELECT dari FROM tahun_ajaran
                 WHERE kategori = 'hijriyah'
                   AND (tahun_ajaran = ? OR tahun_ajaran LIKE ?)
                   AND dari IS NOT NULL
                 ORDER BY dari ASC
                 LIMIT 1"
            );
            $stmt->execute([(string) $tahunHijriyah, $tahunHijriyah . '-%']);
            $row = $stmt->fetch(PDO::FETCH_ASSOC);
            if ($row && !empty($row['dari']) && preg_match('/^(\d{4})/', (string) $row['dari'], $m)) {
                $y = (int) $m[1];
                if ($y >= 1900 && $y <= 2200) {
                    return (string) $y;
                }
            }
        } catch (\Throwable $e) {
            // tabel/kolom belum ada — lanjut fallback
        }

        $ymd = KalenderHelper::hijriyahToMasehi($db, sprintf('%04d-07-01', $tahunHijriyah));
        if ($ymd !== null && preg_match('/^(\d{4})/', $ymd, $m)) {
            return $m[1];
        }

        $approx = $tahunHijriyah + 579;
        if ($approx >= 1900 && $approx <= 2200) {
            return (string) $approx;
        }
        return null;
    }

    /**
     * Apakah tahun Masehi selaras kasar dengan Hijriyah (selisih vs H+579 ≤ 2).
     */
    public static function isMasehiConsistentWithHijriyah(int $tahunMasehi, int $tahunHijriyah): bool
    {
        if ($tahunHijriyah < 1300 || $tahunHijriyah > 1600) {
            return false;
        }
        if ($tahunMasehi < 1900 || $tahunMasehi > 2200) {
            return false;
        }
        return abs($tahunMasehi - ($tahunHijriyah + 579)) <= 2;
    }

    /**
     * Normalisasi string tahun (ambil 4 digit pertama bila ada).
     */
    public static function normalizeYear(?string $value): ?string
    {
        if ($value === null || trim($value) === '') {
            return null;
        }
        $digits = preg_replace('/\D/', '', $value);
        if ($digits === '') {
            return null;
        }
        if (strlen($digits) >= 4) {
            return substr($digits, 0, 4);
        }
        return $digits;
    }
}

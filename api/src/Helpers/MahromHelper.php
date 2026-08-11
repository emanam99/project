<?php

namespace App\Helpers;

use PDO;

/**
 * Helper mahrom: NIM (Nomor Induk Mahrom).
 *
 * Aturan NIM (7 digit, sama pola NIS/NIP):
 * - Digit 1: gender — Laki-laki = 5, Perempuan = 6
 * - Digit 2–3: tahun ajaran hijriyah — dari "1447-1448" ambil "47"
 * - Digit 4–7: urutan 0001, 0002, ... (unik per prefix 3 digit)
 * Contoh: 5470001 = Laki-laki, tahun 47, urutan 1.
 */
class MahromHelper
{
    /**
     * @param string $gender "Laki-laki", "Perempuan", "L", "P", dll.
     * @param string $tahunAjaranHijriyah Format "1447-1448" atau "1447"
     * @return int Prefix 3 digit (500–699)
     */
    public static function parsePrefixFromGenderAndTahun(string $gender, string $tahunAjaranHijriyah): int
    {
        $g = strtolower(trim($gender));
        $first = $g !== '' ? substr($g, 0, 1) : '';
        $genderCode = ($first === 'p' || $g === 'perempuan') ? 6 : 5;

        $tahun = trim($tahunAjaranHijriyah);
        if (strpos($tahun, '-') !== false) {
            $parts = explode('-', $tahun);
            $tahun = trim($parts[0]);
        }
        $tahunCode = (int) substr($tahun, -2);

        return $genderCode * 100 + $tahunCode;
    }

    /**
     * Generate NIM berikutnya untuk prefix 3 digit.
     * Harus dipanggil di dalam transaksi yang sudah beginTransaction(); pakai SELECT FOR UPDATE.
     *
     * @param PDO $db
     * @param int $prefix Prefix 3 digit (500–699)
     * @return string NIM 7 digit
     */
    public static function generateNextNim(PDO $db, int $prefix): string
    {
        $prefix = (int) $prefix;
        if ($prefix < 500 || $prefix > 699) {
            throw new \InvalidArgumentException('Prefix NIM harus 3 digit (500–699).');
        }

        $minNim = $prefix * 10000;
        $maxNim = ($prefix + 1) * 10000 - 1;

        $stmt = $db->prepare(
            'SELECT COALESCE(MAX(CAST(nim AS UNSIGNED)), 0) AS mx FROM mahrom WHERE CAST(nim AS UNSIGNED) >= ? AND CAST(nim AS UNSIGNED) <= ? FOR UPDATE'
        );
        $stmt->execute([$minNim, $maxNim]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        $maxVal = $row ? (int) $row['mx'] : 0;

        $nextSeq = ($maxVal < $minNim) ? 1 : ($maxVal - $minNim + 1);
        if ($nextSeq > 9999) {
            throw new \RuntimeException('Urutan NIM untuk prefix ini sudah penuh (9999).');
        }

        $nim = $minNim + $nextSeq;
        return (string) $nim;
    }
}

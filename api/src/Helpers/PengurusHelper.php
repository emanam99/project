<?php

namespace App\Helpers;

use PDO;

/**
 * Helper pengurus: resolusi NIP (Nomor Induk Pengurus) vs id (PK untuk relasi).
 * - NIP: untuk input/tampilan (daftar, koordinator, lupa password).
 * - id: untuk relasi/FK di database (tetap pakai id).
 *
 * Aturan NIP (7 digit, sama seperti NIS santri, beda digit gender):
 * - Digit 1: gender — Laki-laki = 3, Perempuan = 4
 * - Digit 2–3: tahun ajaran hijriyah — dari "1447-1448" ambil "47"
 * - Digit 4–7: urutan 0001, 0002, ... (unik per prefix 3 digit)
 * Contoh: 3470001 = Laki-laki, tahun 47, urutan 1.
 */
class PengurusHelper
{
    /**
     * Hitung prefix 3 digit NIP dari gender dan tahun ajaran hijriyah.
     * Digit 1 = gender (3 Laki-laki, 4 Perempuan), digit 2–3 = 2 digit tahun (dari "1447-1448" → "47").
     *
     * @param string $gender "Laki-laki", "Perempuan", "L", "P", dll.
     * @param string $tahunAjaranHijriyah Format "1447-1448" atau "1447"
     * @return int Prefix 3 digit (300–499)
     */
    public static function parsePrefixFromGenderAndTahun(string $gender, string $tahunAjaranHijriyah): int
    {
        $g = strtolower(trim($gender));
        $first = $g !== '' ? substr($g, 0, 1) : '';
        $genderCode = ($first === 'p' || $g === 'perempuan') ? 4 : 3;

        $tahun = trim($tahunAjaranHijriyah);
        if (strpos($tahun, '-') !== false) {
            $parts = explode('-', $tahun);
            $tahun = trim($parts[0]);
        }
        $tahunCode = (int) substr($tahun, -2);

        return $genderCode * 100 + $tahunCode;
    }

    /**
     * Generate NIP berikutnya untuk prefix 3 digit (dipakai saat INSERT pengurus).
     * Harus dipanggil di dalam transaksi yang sudah beginTransaction(); pakai SELECT FOR UPDATE agar unik.
     *
     * @param PDO $db Koneksi DB (transaksi harus sudah aktif)
     * @param int $prefix Prefix 3 digit (300–499): gender*100 + tahun 2 digit
     * @return string NIP 7 digit (contoh "3470001")
     */
    public static function generateNextNip(PDO $db, int $prefix): string
    {
        $prefix = (int) $prefix;
        if ($prefix < 300 || $prefix > 499) {
            throw new \InvalidArgumentException('Prefix NIP harus 3 digit (300–499).');
        }

        $minNip = $prefix * 10000;
        $maxNip = ($prefix + 1) * 10000 - 1;

        $stmt = $db->prepare(
            'SELECT COALESCE(MAX(nip), 0) AS mx FROM pengurus WHERE nip >= ? AND nip <= ? FOR UPDATE'
        );
        $stmt->execute([$minNip, $maxNip]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        $maxVal = $row ? (int) $row['mx'] : 0;

        $nextSeq = ($maxVal < $minNip) ? 1 : ($maxVal - $minNip + 1);
        if ($nextSeq > 9999) {
            throw new \RuntimeException('Urutan NIP untuk prefix ini sudah penuh (9999).');
        }

        $nip = $minNip + $nextSeq;
        return (string) $nip;
    }

    /**
     * Resolve NIP ke pengurus.id (untuk query/relasi).
     * Menerima nilai numerik: cek by nip dulu, lalu by id.
     *
     * @param PDO $db
     * @param int|string|null $nipOrId NIP atau id (numerik)
     * @return int|null pengurus.id atau null jika tidak ditemukan
     */
    public static function resolveIdByNip(PDO $db, $nipOrId): ?int
    {
        if ($nipOrId === null || $nipOrId === '') {
            return null;
        }
        $v = is_numeric($nipOrId) ? (int) $nipOrId : null;
        if ($v === null) {
            return null;
        }

        $stmt = $db->prepare('SELECT id FROM pengurus WHERE nip = ? LIMIT 1');
        $stmt->execute([$v]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        if ($row) {
            return (int) $row['id'];
        }

        $stmt = $db->prepare('SELECT id FROM pengurus WHERE id = ? LIMIT 1');
        $stmt->execute([$v]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        return $row ? (int) $row['id'] : null;
    }

    /**
     * Ambil NIP pengurus berdasarkan id (untuk response/tampilan).
     *
     * @param PDO $db
     * @param int $pengurusId pengurus.id
     * @return string|null
     */
    public static function getNipById(PDO $db, int $pengurusId): ?string
    {
        $stmt = $db->prepare('SELECT nip FROM pengurus WHERE id = ? LIMIT 1');
        $stmt->execute([$pengurusId]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        return $row ? (string) $row['nip'] : null;
    }
}

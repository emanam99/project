<?php

namespace App\Helpers;

use PDO;

/**
 * Helper untuk resolusi santri: id (AUTO_INCREMENT) vs nis (Nomor Induk Santri untuk tampilan).
 * Relasi di DB tetap pakai id; API bisa terima id atau nis, dan response menampilkan nis.
 *
 * Konvensi: Di frontend (biodata/pendaftaran/uwaba), kotak input dan URL selalu memakai NIS (7 digit).
 * Request API mengirim NIS; backend memakai resolveId() untuk dapat santri.id.
 *
 * Aturan NIS (7 digit, selalu dipakai saat INSERT santri dari mana pun):
 * - Digit 1: gender — Laki-laki = 1, Perempuan = 2
 * - Digit 2–3: tahun ajaran hijriyah — dari "1447-1448" ambil "47"
 * - Digit 4–7: urutan 0001, 0002, ... (unik per prefix 3 digit)
 * Contoh: 2470001 = Perempuan, tahun 47, urutan 1.
 */
class SantriHelper
{
    /**
     * Normalisasi gender dari input (deteksi huruf pertama L/P agar tidak salah eja).
     * Terima: "Laki-laki", "L", "laki-laki", "Perempuan", "P", "perempuan", dll.
     *
     * @param string|null $gender
     * @return string|null "Laki-laki", "Perempuan", atau null jika tidak valid
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
     * Hitung prefix 3 digit NIS dari gender dan tahun ajaran hijriyah.
     * Digit 1 = gender (1 Laki-laki, 2 Perempuan), digit 2–3 = 2 digit tahun (dari "1447-1448" → "47").
     *
     * @param string $gender "Laki-laki" atau "Perempuan"
     * @param string $tahunAjaranHijriyah Format "1447-1448" atau "1447"
     * @return int Prefix 3 digit (100–299)
     */
    public static function parsePrefixFromGenderAndTahun(string $gender, string $tahunAjaranHijriyah): int
    {
        $g = strtolower(trim($gender));
        $genderCode = ($g === 'perempuan') ? 2 : 1;

        $tahun = trim($tahunAjaranHijriyah);
        if (strpos($tahun, '-') !== false) {
            $parts = explode('-', $tahun);
            $tahun = trim($parts[0]);
        }
        $tahunCode = (int) substr($tahun, -2);

        return $genderCode * 100 + $tahunCode;
    }

    /**
     * Generate NIS berikutnya untuk prefix 3 digit (dipakai saat INSERT santri).
     * Harus dipanggil di dalam transaksi yang sudah beginTransaction(); pakai SELECT FOR UPDATE agar unik.
     *
     * @param PDO $db Koneksi DB (transaksi harus sudah aktif)
     * @param int $prefix Prefix 3 digit (100–299): gender*100 + tahun 2 digit
     * @return string NIS 7 digit (contoh "2470001")
     */
    public static function generateNextNis(PDO $db, int $prefix): string
    {
        $prefix = (int) $prefix;
        if ($prefix < 100 || $prefix > 299) {
            throw new \InvalidArgumentException('Prefix NIS harus 3 digit (100–299).');
        }

        $minNis = $prefix * 10000;
        $maxNis = ($prefix + 1) * 10000 - 1;

        $stmt = $db->prepare(
            'SELECT COALESCE(MAX(nis), 0) AS mx FROM santri WHERE nis >= ? AND nis <= ? FOR UPDATE'
        );
        $stmt->execute([$minNis, $maxNis]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        $maxVal = $row ? (int) $row['mx'] : 0;

        $nextSeq = ($maxVal < $minNis) ? 1 : ($maxVal - $minNis + 1);
        if ($nextSeq > 9999) {
            throw new \RuntimeException('Urutan NIS untuk prefix ini sudah penuh (9999).');
        }

        $nis = $minNis + $nextSeq;
        return (string) $nis;
    }

    /**
     * Resolve nilai dari frontend (id atau nis) ke santri.id untuk query DB.
     * Coba cari by id dulu, kalau tidak ketemu cari by nis.
     *
     * @param PDO $db
     * @param int|string $value id (numeric kecil) atau nis (mis. 7 digit)
     * @return int|null santri.id atau null jika tidak ditemukan
     */
    public static function resolveId(PDO $db, $value): ?int
    {
        if ($value === null || $value === '') {
            return null;
        }
        $v = is_numeric($value) ? (int) $value : trim((string) $value);
        if ($v === 0 && $value !== 0 && $value !== '0') {
            return null;
        }

        // Cari by id (primary key)
        $stmt = $db->prepare("SELECT id FROM santri WHERE id = ? LIMIT 1");
        $stmt->execute([$v]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        if ($row) {
            return (int) $row['id'];
        }

        // Cari by nis (untuk nilai 7 digit / format nis)
        $stmt = $db->prepare("SELECT id FROM santri WHERE nis = ? LIMIT 1");
        $stmt->execute([$v]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        if ($row) {
            return (int) $row['id'];
        }

        return null;
    }

    /**
     * Ambil nis santri berdasarkan id (untuk ditambah ke response API).
     *
     * @param PDO $db
     * @param int $santriId santri.id
     * @return string|null
     */
    public static function getNisById(PDO $db, int $santriId): ?string
    {
        $stmt = $db->prepare("SELECT nis FROM santri WHERE id = ? LIMIT 1");
        $stmt->execute([$santriId]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        return $row ? (string) $row['nis'] : null;
    }
}

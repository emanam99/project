<?php

namespace App\Helpers;

/**
 * Helper konversi tanggal Masehi → Hijriyah menggunakan tabel psa___kalender.
 * Dipakai saat insert uwaba___bayar agar kolom hijriyah terisi.
 */
class KalenderHelper
{
    /**
     * Konversi tanggal Masehi ke Hijriyah (format Y-m-d).
     * Menggunakan psa___kalender (sama seperti API kalender?action=convert).
     *
     * @param \PDO $db
     * @param string $tanggalMasehi Format Y-m-d (mis. 2025-02-28)
     * @param string $waktu Opsional, untuk penyesuaian setelah Maghrib (mis. 18:00:00)
     * @return string|null Format Y-m-d Hijriyah (mis. 1446-08-29) atau null jika tidak ditemukan
     */
    public static function masehiToHijriyah(\PDO $db, string $tanggalMasehi, string $waktu = '00:00:00'): ?string
    {
        try {
            $tanggalHijriyah = $tanggalMasehi;
            if (self::isAfterMaghrib($waktu)) {
                $d = new \DateTime($tanggalMasehi);
                $d->add(new \DateInterval('P1D'));
                $tanggalHijriyah = $d->format('Y-m-d');
            }
            $stmt = $db->prepare("SELECT tahun, id_bulan, mulai, akhir FROM psa___kalender WHERE mulai <= ? AND akhir >= ? LIMIT 1");
            $stmt->execute([$tanggalHijriyah, $tanggalHijriyah]);
            $row = $stmt->fetch(\PDO::FETCH_ASSOC);
            if (!$row || empty($row['mulai']) || empty($row['akhir'])) {
                return null;
            }
            $date1 = new \DateTime($row['mulai']);
            $date2 = new \DateTime($tanggalHijriyah);
            $diff = $date1->diff($date2)->days;
            $hijriyahTanggal = 1 + (int) $diff;
            return $row['tahun'] . '-' . str_pad((string) $row['id_bulan'], 2, '0', STR_PAD_LEFT) . '-' . str_pad((string) $hijriyahTanggal, 2, '0', STR_PAD_LEFT);
        } catch (\Throwable $e) {
            error_log("KalenderHelper::masehiToHijriyah error: " . $e->getMessage());
            return null;
        }
    }

    /**
     * Konversi tanggal Hijriyah (Y-m-d) ke Masehi (Y-m-d) memakai psa___kalender.
     * Sama dengan API kalender?action=to_masehi.
     */
    public static function hijriyahToMasehi(\PDO $db, ?string $hijriYmd): ?string
    {
        if ($hijriYmd === null || $hijriYmd === '') {
            return null;
        }
        $parts = explode('-', substr(trim($hijriYmd), 0, 10));
        if (count($parts) !== 3) {
            return null;
        }
        $tahun = (int) $parts[0];
        $bulan = (int) $parts[1];
        $hari = (int) $parts[2];
        if ($tahun < 1 || $bulan < 1 || $bulan > 12 || $hari < 1 || $hari > 30) {
            return null;
        }
        try {
            $stmt = $db->prepare('SELECT mulai, akhir FROM psa___kalender WHERE tahun = ? AND id_bulan = ? LIMIT 1');
            $stmt->execute([$tahun, $bulan]);
            $row = $stmt->fetch(\PDO::FETCH_ASSOC);
            if (!$row || empty($row['mulai'])) {
                return null;
            }
            $mulai = new \DateTime($row['mulai']);
            $mulai->add(new \DateInterval('P' . ($hari - 1) . 'D'));
            return $mulai->format('Y-m-d');
        } catch (\Throwable $e) {
            error_log('KalenderHelper::hijriyahToMasehi error: ' . $e->getMessage());
            return null;
        }
    }

    private static function isAfterMaghrib(string $waktu): bool
    {
        $parts = explode(':', substr($waktu, 0, 8));
        $jam = (int) ($parts[0] ?? 0);
        $menit = (int) ($parts[1] ?? 0);
        return ($jam * 60 + $menit) >= (17 * 60 + 30);
    }
}

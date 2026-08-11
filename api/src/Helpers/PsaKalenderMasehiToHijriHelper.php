<?php

declare(strict_types=1);

namespace App\Helpers;

/**
 * Konversi tanggal masehi → hijriyah Y-m-d memakai tabel psa___kalender (selaras KalenderController).
 */
final class PsaKalenderMasehiToHijriHelper
{
    public static function isAfterMaghrib(string $waktu): bool
    {
        $parts = explode(':', substr($waktu, 0, 5));
        $jam = (int) ($parts[0] ?? 0);
        $menit = (int) ($parts[1] ?? 0);

        return ($jam * 60 + $menit) >= (17 * 60 + 30);
    }

    /**
     * @return string|null Y-m-d hijriyah atau null jika tidak ketemu / invalid
     */
    public static function masehiYmdToHijriyahYmd(\PDO $db, string $masehiYmd, string $waktu = '12:00:00'): ?string
    {
        if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $masehiYmd)) {
            return null;
        }
        try {
            $tanggalHijriyah = $masehiYmd;
            if (self::isAfterMaghrib($waktu)) {
                $d = new \DateTime($masehiYmd);
                $d->add(new \DateInterval('P1D'));
                $tanggalHijriyah = $d->format('Y-m-d');
            }
            $stmt = $db->prepare(
                'SELECT tahun, id_bulan, mulai, akhir FROM psa___kalender WHERE mulai <= ? AND akhir >= ? LIMIT 1'
            );
            $stmt->execute([$tanggalHijriyah, $tanggalHijriyah]);
            $row = $stmt->fetch(\PDO::FETCH_ASSOC);
            if (!$row || empty($row['mulai']) || empty($row['akhir'])) {
                return null;
            }
            $date1 = new \DateTime((string) $row['mulai']);
            $date2 = new \DateTime($tanggalHijriyah);
            $diff = $date1->diff($date2)->days;
            $hijriyahTanggal = 1 + (int) $diff;
            $tahun = (string) $row['tahun'];
            $idBulan = (int) $row['id_bulan'];

            return $tahun . '-' . str_pad((string) $idBulan, 2, '0', STR_PAD_LEFT) . '-' . str_pad((string) $hijriyahTanggal, 2, '0', STR_PAD_LEFT);
        } catch (\Throwable $e) {
            error_log('PsaKalenderMasehiToHijriHelper: ' . $e->getMessage());

            return null;
        }
    }
}

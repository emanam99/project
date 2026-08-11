<?php

declare(strict_types=1);

namespace App\Helpers;

/**
 * Resolusi tahun ajaran hijriyah «aktif» menurut rentang tanggal masehi di master tahun_ajaran.
 */
final class TahunAjaranActiveHelper
{
    /**
     * Tahun ajaran hijriyah untuk transaksi keuangan menurut tanggal acuan (hijriyah→kalender, atau masehi Y-m-d).
     */
    public static function resolveTahunAjaranForTransaction(\PDO $db, ?string $hijriyah, ?string $masehiYmd = null): ?string
    {
        $masehiRef = self::resolveMasehiReferenceForTransaction($db, $hijriyah, $masehiYmd);
        if ($masehiRef === null) {
            return null;
        }
        $resolved = self::resolveHijriyahKonteksForMasehiDate($db, $masehiRef);

        return isset($resolved['tahun_ajaran']) ? trim((string) $resolved['tahun_ajaran']) : null;
    }

    /**
     * Tanggal masehi acuan transaksi: konversi kolom hijriyah, parameter masehi, atau hari ini.
     */
    public static function resolveMasehiReferenceForTransaction(\PDO $db, ?string $hijriyah, ?string $masehiYmd = null): ?string
    {
        $hijriRaw = trim((string) ($hijriyah ?? ''));
        if ($hijriRaw !== '') {
            $hijriYmd = substr($hijriRaw, 0, 10);
            if (preg_match('/^\d{4}-\d{2}-\d{2}$/', $hijriYmd)) {
                $fromKalender = KalenderHelper::hijriyahToMasehi($db, $hijriYmd);
                if ($fromKalender !== null && preg_match('/^\d{4}-\d{2}-\d{2}$/', $fromKalender)) {
                    return $fromKalender;
                }
            }
        }

        $masehi = trim((string) ($masehiYmd ?? ''));
        if ($masehi !== '' && preg_match('/^\d{4}-\d{2}-\d{2}$/', $masehi)) {
            return $masehi;
        }

        return date('Y-m-d');
    }

    /**
     * Baris tahun ajaran hijriyah yang mencakup tanggal masehi (kolom dari/sampai = rentang masehi Y-m-d).
     *
     * @return array{tahun_ajaran: string, dari: string, sampai: string}|null
     */
    public static function fetchActiveHijriyahRowForMasehiDate(\PDO $db, string $masehiYmd): ?array
    {
        if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $masehiYmd)) {
            return null;
        }
        try {
            $stmt = $db->prepare(
                'SELECT tahun_ajaran, dari, sampai
                 FROM tahun_ajaran
                 WHERE kategori = \'hijriyah\'
                   AND dari IS NOT NULL AND TRIM(dari) != \'\'
                   AND sampai IS NOT NULL AND TRIM(sampai) != \'\'
                   AND DATE(dari) <= ?
                   AND DATE(sampai) >= ?
                 ORDER BY DATE(dari) DESC
                 LIMIT 1'
            );
            $stmt->execute([$masehiYmd, $masehiYmd]);
            $row = $stmt->fetch(\PDO::FETCH_ASSOC);
            if (!$row) {
                return null;
            }
            $ta = trim((string) ($row['tahun_ajaran'] ?? ''));
            if ($ta === '') {
                return null;
            }
            $dari = trim((string) ($row['dari'] ?? ''));
            $sampai = trim((string) ($row['sampai'] ?? ''));
            if ($dari === '' || $sampai === '') {
                return null;
            }

            return [
                'tahun_ajaran' => $ta,
                'dari' => $dari,
                'sampai' => $sampai,
            ];
        } catch (\Throwable $e) {
            error_log('TahunAjaranActiveHelper: ' . $e->getMessage());

            return null;
        }
    }

    /**
     * Semua tahun ajaran hijriyah yang punya rentang masehi aktif (kolom dari & sampai terisi).
     *
     * @return list<array{tahun_ajaran: string, dari: string, sampai: string}>
     */
    public static function fetchHijriyahRowsWithRentang(\PDO $db): array
    {
        try {
            $stmt = $db->query(
                'SELECT tahun_ajaran, dari, sampai
                 FROM tahun_ajaran
                 WHERE kategori = \'hijriyah\'
                   AND dari IS NOT NULL AND TRIM(dari) != \'\'
                   AND sampai IS NOT NULL AND TRIM(sampai) != \'\'
                 ORDER BY dari DESC, tahun_ajaran DESC'
            );
            $out = [];
            while ($row = $stmt->fetch(\PDO::FETCH_ASSOC)) {
                $ta = trim((string) ($row['tahun_ajaran'] ?? ''));
                if ($ta === '') {
                    continue;
                }
                $out[] = [
                    'tahun_ajaran' => $ta,
                    'dari' => trim((string) ($row['dari'] ?? '')),
                    'sampai' => trim((string) ($row['sampai'] ?? '')),
                ];
            }

            return $out;
        } catch (\Throwable $e) {
            error_log('TahunAjaranActiveHelper::fetchHijriyahRowsWithRentang ' . $e->getMessage());

            return [];
        }
    }

    /**
     * TA hijriyah untuk konteks laporan: yang mencakup tanggal masehi, atau terbaru (rentang terisi) + peringatan.
     *
     * @return array{tahun_ajaran: string|null, row: array{tahun_ajaran: string, dari: string, sampai: string}|null, warnings: list<string>}
     */
    public static function resolveHijriyahKonteksForMasehiDate(\PDO $db, string $masehiYmd): array
    {
        if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $masehiYmd)) {
            return [
                'tahun_ajaran' => null,
                'row' => null,
                'warnings' => ['Parameter tanggal tidak valid.'],
            ];
        }

        $active = self::fetchActiveHijriyahRowForMasehiDate($db, $masehiYmd);
        if ($active !== null) {
            return [
                'tahun_ajaran' => $active['tahun_ajaran'],
                'row' => $active,
                'warnings' => [],
            ];
        }

        $rows = self::fetchHijriyahRowsWithRentang($db);
        if ($rows !== []) {
            $latest = $rows[0];

            return [
                'tahun_ajaran' => $latest['tahun_ajaran'],
                'row' => $latest,
                'warnings' => [
                    sprintf(
                        'Tanggal %s tidak masuk rentang tahun ajaran aktif di master. Dipakai tahun ajaran terbaru: %s (masehi %s s.d. %s). Sesuaikan kolom dari–sampai di Pengaturan → Tahun Ajaran bila perlu.',
                        $masehiYmd,
                        $latest['tahun_ajaran'],
                        $latest['dari'],
                        $latest['sampai']
                    ),
                ],
            ];
        }

        return [
            'tahun_ajaran' => null,
            'row' => null,
            'warnings' => [
                'Tidak ada tahun ajaran hijriyah di master dengan kolom dari–sampai terisi. Isi di Pengaturan → Tahun Ajaran (eBeddien).',
            ],
        ];
    }
}

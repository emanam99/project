<?php

declare(strict_types=1);

namespace App\Support;

/**
 * Pusat & radius efektif untuk cek jarak absen / pratinjau: jika master alamat punya lat+lng,
 * pakai pusat master dan radius master (atau fallback radius titik), hingga 25 km.
 * Tanpa pusat master: pakai koordinat titik lokasi seperti sebelumnya (radius titik, max 5 km).
 */
final class AbsenLokasiGeo
{
    public static function floatCoord(mixed $v): ?float
    {
        if ($v === null || $v === '') {
            return null;
        }
        if (is_int($v) || is_float($v)) {
            $f = (float) $v;

            return is_finite($f) ? $f : null;
        }
        $s = str_replace(',', '.', preg_replace('/\s+/u', '', (string) $v));
        if ($s === '' || !is_numeric($s)) {
            return null;
        }
        $f = (float) $s;

        return is_finite($f) ? $f : null;
    }

    /**
     * @param array<string, mixed> $row baris gabungan lokasi + (opsional) kolom alamat_lat, alamat_lng, alamat_radius
     *
     * @return array{0: float, 1: float, 2: int}|null [lat, lng, radius_meter clamped, tanpa accuracy slack]
     */
    public static function effectiveCenterAndBaseRadius(array $row): ?array
    {
        $alat = isset($row['alamat_lat']) ? self::floatCoord($row['alamat_lat']) : null;
        $alng = isset($row['alamat_lng']) ? self::floatCoord($row['alamat_lng']) : null;
        if ($alat !== null && $alng !== null && abs($alat) <= 90.0 && abs($alng) <= 180.0) {
            $arad = isset($row['alamat_radius']) ? (int) $row['alamat_radius'] : 0;
            $lrad = max(10, (int) ($row['radius_meter'] ?? 100));
            $rad = $arad > 0 ? min(25000, max(10, $arad)) : min(25000, max(10, $lrad));

            return [$alat, $alng, $rad];
        }
        $plat = self::floatCoord($row['latitude'] ?? null);
        $plng = self::floatCoord($row['longitude'] ?? null);
        if ($plat === null || $plng === null || abs($plat) > 90.0 || abs($plng) > 180.0) {
            return null;
        }
        $rad = min(5000, max(10, (int) ($row['radius_meter'] ?? 100)));

        return [$plat, $plng, $rad];
    }
}

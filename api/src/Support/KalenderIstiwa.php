<?php

declare(strict_types=1);

namespace App\Support;

use PDO;

/**
 * Koordinat default jam Istiwa’ (pondok Beddian) dan pencocokan alamat master absen.
 */
final class KalenderIstiwa
{
    /** Pondok Pesantren Salafiyah Al-Utsmani — absen___alamat id=1 (lokal). */
    public const DEFAULT_LAT = -7.9955854;
    public const DEFAULT_LNG = 113.8443946;
    public const DEFAULT_LABEL = 'Beddian RT 29 RW 06, Jambesari, Jambesari Darus Sholah, Bondowoso';
    /** Nilai lama (pusat kota Bondowoso) — migrasi hanya menimpa ini. */
    public const LEGACY_CITY_LAT = -7.9138;
    public const LEGACY_CITY_LNG = 113.8214;
    /** Cap radius zona untuk marquee Istiwa’ (bukan validasi absen). */
    public const MATCH_RADIUS_MAX_METER = 500;
    public const SETTING_LAT = 'kalender_istiwa_latitude';
    public const SETTING_LNG = 'kalender_istiwa_longitude';

    /**
     * @return array{latitude: float, longitude: float}
     */
    public static function defaultCoords(PDO $db): array
    {
        $lat = self::DEFAULT_LAT;
        $lng = self::DEFAULT_LNG;
        try {
            $st = $db->prepare(
                'SELECT `key`, `value` FROM `app___settings` WHERE `key` IN (?, ?)'
            );
            $st->execute([self::SETTING_LAT, self::SETTING_LNG]);
            $map = [];
            foreach ($st->fetchAll(PDO::FETCH_ASSOC) as $row) {
                $k = (string) ($row['key'] ?? '');
                if ($k !== '') {
                    $map[$k] = $row['value'] ?? null;
                }
            }
            $plat = AbsenLokasiGeo::floatCoord($map[self::SETTING_LAT] ?? null);
            $plng = AbsenLokasiGeo::floatCoord($map[self::SETTING_LNG] ?? null);
            if ($plat !== null && $plng !== null && abs($plat) <= 90.0 && abs($plng) <= 180.0) {
                $lat = $plat;
                $lng = $plng;
            }
        } catch (\Throwable $e) {
            error_log('KalenderIstiwa::defaultCoords: ' . $e->getMessage());
        }

        return ['latitude' => $lat, 'longitude' => $lng];
    }

    public static function upsertCoords(PDO $db, float $lat, float $lng): void
    {
        $st = $db->prepare(
            'INSERT INTO `app___settings` (`key`, `value`) VALUES (?, ?) '
            . 'ON DUPLICATE KEY UPDATE `value` = VALUES(`value`), updated_at = NOW()'
        );
        $st->execute([self::SETTING_LAT, (string) $lat]);
        $st->execute([self::SETTING_LNG, (string) $lng]);
    }

    /**
     * Alamat jika posisi masuk radius: utamakan daftar absen___alamat (zona GPS),
     * lalu fallback titik absen___lokasi yang sudah dilengkapi alamat.
     *
     * @return array<string, string>|null
     */
    public static function matchAbsenAlamat(PDO $db, float $lat, float $lng, float $accuracySlack = 0.0): ?array
    {
        $fromList = self::matchAlamatMasterGps($db, $lat, $lng, $accuracySlack);
        if ($fromList !== null) {
            return $fromList;
        }

        if (!self::tableExists($db, 'absen___lokasi')) {
            return null;
        }
        $joinAddr = '';
        $addrCols = '';
        $hasMaster = self::tableExists($db, 'absen___alamat') && self::columnExists($db, 'absen___lokasi', 'id_absen_alamat');
        $hasLegacy = self::columnExists($db, 'absen___lokasi', 'dusun');
        if ($hasMaster) {
            $joinAddr = ' LEFT JOIN absen___alamat adm ON adm.id = l.id_absen_alamat ';
            $addrCols = ', adm.dusun, adm.rt, adm.rw, adm.desa, adm.kecamatan, adm.kabupaten, adm.provinsi, adm.latitude AS alamat_lat, adm.longitude AS alamat_lng, adm.radius_meter AS alamat_radius';
        } elseif ($hasLegacy) {
            $addrCols = ', l.dusun, l.rt, l.rw, l.desa, l.kecamatan, l.kabupaten, l.provinsi';
        } else {
            return null;
        }

        $sql = 'SELECT l.latitude, l.longitude, l.radius_meter' . $addrCols . '
            FROM absen___lokasi l ' . $joinAddr . '
            WHERE l.aktif = 1';
        try {
            $st = $db->query($sql);
            $rows = $st !== false ? $st->fetchAll(PDO::FETCH_ASSOC) : [];
        } catch (\Throwable $e) {
            error_log('KalenderIstiwa::matchAbsenAlamat: ' . $e->getMessage());

            return null;
        }

        $accSlack = $accuracySlack > 0 && is_finite($accuracySlack) ? min($accuracySlack, 120.0) : 0.0;
        $best = null;
        $bestDist = null;
        foreach ($rows as $row) {
            $alamat = self::alamatFieldsFromRow($row);
            if ($alamat === []) {
                continue;
            }
            $eff = AbsenLokasiGeo::effectiveCenterAndBaseRadius($row);
            if ($eff === null) {
                continue;
            }
            [$plat, $plng, $radBase] = $eff;
            $dist = AbsenLokasiGeo::haversineMeters($lat, $lng, $plat, $plng);
            $rad = $radBase + $accSlack;
            if ($dist > $rad) {
                continue;
            }
            if ($bestDist === null || $dist < $bestDist) {
                $bestDist = $dist;
                $best = $alamat;
            }
        }

        return $best;
    }

    /**
     * Cocokkan ke baris absen___alamat yang punya latitude/longitude.
     *
     * @return array<string, string>|null
     */
    private static function matchAlamatMasterGps(PDO $db, float $lat, float $lng, float $accuracySlack = 0.0): ?array
    {
        if (!self::tableExists($db, 'absen___alamat')) {
            return null;
        }
        if (!self::columnExists($db, 'absen___alamat', 'latitude')) {
            return null;
        }
        try {
            $st = $db->query(
                'SELECT dusun, rt, rw, desa, kecamatan, kabupaten, provinsi, latitude, longitude, radius_meter
                FROM absen___alamat
                WHERE latitude IS NOT NULL AND longitude IS NOT NULL'
            );
            $rows = $st !== false ? $st->fetchAll(PDO::FETCH_ASSOC) : [];
        } catch (\Throwable $e) {
            error_log('KalenderIstiwa::matchAlamatMasterGps: ' . $e->getMessage());

            return null;
        }
        $accSlack = $accuracySlack > 0 && is_finite($accuracySlack) ? min($accuracySlack, 120.0) : 0.0;
        $best = null;
        $bestDist = null;
        foreach ($rows as $row) {
            $alamat = self::alamatFieldsFromRow($row);
            if ($alamat === []) {
                continue;
            }
            $plat = AbsenLokasiGeo::floatCoord($row['latitude'] ?? null);
            $plng = AbsenLokasiGeo::floatCoord($row['longitude'] ?? null);
            if ($plat === null || $plng === null || abs($plat) > 90.0 || abs($plng) > 180.0) {
                continue;
            }
            $radBase = (int) ($row['radius_meter'] ?? 0);
            if ($radBase < 1) {
                $radBase = 100;
            }
            $radBase = min(self::MATCH_RADIUS_MAX_METER, max(10, $radBase));
            $dist = AbsenLokasiGeo::haversineMeters($lat, $lng, $plat, $plng);
            $rad = $radBase + $accSlack;
            if ($dist > $rad) {
                continue;
            }
            if ($bestDist === null || $dist < $bestDist) {
                $bestDist = $dist;
                $best = $alamat;
            }
        }

        return $best;
    }

    /**
     * @param array<string, mixed> $row
     * @return array<string, string>
     */
    public static function alamatFieldsFromRow(array $row): array
    {
        $keys = ['dusun', 'rt', 'rw', 'desa', 'kecamatan', 'kabupaten', 'provinsi'];
        $out = [];
        foreach ($keys as $k) {
            $raw = $row[$k] ?? null;
            $v = $raw !== null && $raw !== '' ? trim((string) $raw) : '';
            if ($v !== '') {
                $out[$k] = $v;
            }
        }

        return $out;
    }

    /**
     * @param array<string, string> $alamat
     * @return array<string, mixed>
     */
    public static function alamatToPreview(array $alamat, string $source): array
    {
        $dusun = $alamat['dusun'] ?? '';
        $rt = $alamat['rt'] ?? '';
        $rw = $alamat['rw'] ?? '';
        $desa = $alamat['desa'] ?? '';
        $kecamatan = $alamat['kecamatan'] ?? '';
        $kabupaten = $alamat['kabupaten'] ?? '';
        $provinsi = $alamat['provinsi'] ?? '';
        $parts = [];
        if ($dusun !== '') {
            $parts[] = $dusun;
        }
        $rtRw = trim(($rt !== '' ? 'RT ' . $rt : '') . ($rt !== '' && $rw !== '' ? ', ' : '') . ($rw !== '' ? 'RW ' . $rw : ''));
        if ($rtRw !== '') {
            $parts[] = $rtRw;
        }
        foreach ([$desa, $kecamatan, $kabupaten, $provinsi] as $p) {
            if ($p !== '') {
                $parts[] = $p;
            }
        }

        return [
            'dusun' => $dusun !== '' ? $dusun : null,
            'rt' => $rt !== '' ? $rt : null,
            'rw' => $rw !== '' ? $rw : null,
            'desa' => $desa !== '' ? $desa : null,
            'kecamatan' => $kecamatan !== '' ? $kecamatan : null,
            'kabupaten' => $kabupaten !== '' ? $kabupaten : null,
            'kota' => $kabupaten !== '' ? $kabupaten : null,
            'provinsi' => $provinsi !== '' ? $provinsi : null,
            'display_name' => $parts !== [] ? implode(', ', $parts) : '',
            '_source' => $source,
        ];
    }

    private static function tableExists(PDO $db, string $table): bool
    {
        try {
            $st = $db->prepare(
                'SELECT 1 FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = ? LIMIT 1'
            );
            $st->execute([$table]);

            return (bool) $st->fetchColumn();
        } catch (\Throwable $e) {
            return false;
        }
    }

    private static function columnExists(PDO $db, string $table, string $column): bool
    {
        try {
            $st = $db->prepare(
                'SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ? LIMIT 1'
            );
            $st->execute([$table, $column]);

            return (bool) $st->fetchColumn();
        } catch (\Throwable $e) {
            return false;
        }
    }
}

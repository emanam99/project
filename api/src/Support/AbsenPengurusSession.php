<?php

declare(strict_types=1);

namespace App\Support;

/**
 * Aturan absensi pengurus untuk perhitungan & rekap:
 * - Waktu kejadian absen harus dari kolom `timestamp` (string dari mesin sidik jari), bukan `tanggal_dibuat`
 *   (waktu server saat baris disimpan). Data offline yang di-upload belakangan tetap pakai jam di payload ATTLOG.
 * - Hanya status yang mengandung "masuk" yang dihitung.
 * - Satu hari kalender dibagi 3 sesi (timezone default app, biasanya Asia/Jakarta):
 *   pagi  : 00:00 sampai sebelum 12:00 (12 malam → 12 siang)
 *   sore  : 12:00 sampai sebelum 18:00 (12 siang → 6 sore)
 *   malam : 18:00 sampai sebelum 24:00 (6 sore → 12 malam)
 * - Per pengurus, per hari: penjodohan masuk–keluar mengikuti urutan waktu (FIFO) antar tap; rekap & gate mandiri
 *   memakai model yang konsisten. Batas baca “hari yang sama” mengikuti tanggal kalender; tidak memanjangkan
 *   “keluar” sesi malam ke hari berikutnya.
 */
final class AbsenPengurusSession
{
    public const SLOT_PAGI = 'pagi';

    public const SLOT_SORE = 'sore';

    public const SLOT_MALAM = 'malam';

    public static function isMasukStatus(?string $status): bool
    {
        if ($status === null || trim($status) === '') {
            return false;
        }

        return mb_stripos($status, 'masuk') !== false;
    }

    public static function isKeluarStatus(?string $status): bool
    {
        if ($status === null || trim($status) === '') {
            return false;
        }

        return mb_stripos($status, 'keluar') !== false;
    }

    public static function sesiLabelIndonesia(string $slot): string
    {
        return match ($slot) {
            self::SLOT_PAGI => 'Pagi',
            self::SLOT_SORE => 'Sore',
            self::SLOT_MALAM => 'Malam',
            default => $slot,
        };
    }

    public static function sessionSlotForUnixTs(int $unixTs): string
    {
        $h = (int) date('G', $unixTs);
        if ($h < 12) {
            return self::SLOT_PAGI;
        }
        if ($h < 18) {
            return self::SLOT_SORE;
        }

        return self::SLOT_MALAM;
    }

    public static function dayKeyForUnixTs(int $unixTs): string
    {
        return date('Y-m-d', $unixTs);
    }

    /**
     * Parse string waktu dari mesin (ZKTeco / iClock biasanya Y-m-d H:i:s atau varian).
     * Tidak memakai tanggal_dibuat — untuk rekap/sesi hanya waktu finger yang sah.
     */
    public static function parseDeviceTimestampToUnix(?string $raw): ?int
    {
        if ($raw === null) {
            return null;
        }
        $s = trim((string) $raw);
        if ($s === '') {
            return null;
        }
        $ts = strtotime($s);
        if ($ts !== false) {
            return $ts;
        }
        $formats = ['Y-m-d H:i:s', 'Y/m/d H:i:s', 'd-m-Y H:i:s', 'd/m/Y H:i:s', 'Y-m-d\TH:i:s'];
        foreach ($formats as $fmt) {
            $d = \DateTimeImmutable::createFromFormat($fmt, $s);
            if ($d instanceof \DateTimeImmutable) {
                return $d->getTimestamp();
            }
        }

        return null;
    }

    /** Waktu kejadian dari mesin saja (untuk rekap & sesi). */
    public static function resolveEventUnixTsFromDeviceOnly(array $row): ?int
    {
        return self::parseDeviceTimestampToUnix($row['device_timestamp'] ?? null);
    }

    /**
     * Untuk tampilan: utamakan waktu mesin; jika tidak ter-parse, baru tanggal_dibuat (server).
     * Jangan dipakai untuk perhitungan sesi/rekap agar upload offline tidak menggeser hari.
     */
    public static function resolveDisplayUnixTs(array $row): ?int
    {
        $device = self::resolveEventUnixTsFromDeviceOnly($row);
        if ($device !== null) {
            return $device;
        }
        $ts = strtotime((string) ($row['tanggal_dibuat'] ?? ''));

        return $ts === false ? null : $ts;
    }

    public static function displayTimeIsFromDevice(array $row): bool
    {
        return self::resolveEventUnixTsFromDeviceOnly($row) !== null;
    }

    /** @return array{pengurus_id:int,day:string,slot:string}|null */
    public static function masukSessionFromRow(array $row, int $pengurusId): ?array
    {
        if (!self::isMasukStatus($row['status'] ?? null)) {
            return null;
        }
        $ts = self::resolveEventUnixTsFromDeviceOnly($row);
        if ($ts === null) {
            return null;
        }

        return [
            'pengurus_id' => $pengurusId,
            'day' => self::dayKeyForUnixTs($ts),
            'slot' => self::sessionSlotForUnixTs($ts),
        ];
    }
}

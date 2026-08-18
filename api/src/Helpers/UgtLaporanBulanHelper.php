<?php

declare(strict_types=1);

namespace App\Helpers;

/**
 * Bulan Hijriyah yang boleh dipakai per jenis laporan UGT (jadwal bergantian).
 * 1 Muharram … 12 Dzulhijjah.
 */
final class UgtLaporanBulanHelper
{
    /** PJGT & GT: Dzulhijjah, Safar, Rabi'ul Akhir, Jumadil Akhir, Sya'ban */
    public const PJGT_GT = [12, 2, 4, 6, 8];

    /** Koordinator: Dzulqa'dah, Muharram, Rabi'ul Awal, Jumadil Awal, Rajab */
    public const KOORDINATOR = [11, 1, 3, 5, 7];

    /**
     * @param list<int> $allowed
     */
    public static function isAllowed(int $bulan, array $allowed): bool
    {
        return $bulan >= 1 && $bulan <= 12 && in_array($bulan, $allowed, true);
    }

    /**
     * @param list<int> $allowed
     */
    public static function messageFor(array $allowed): string
    {
        if ($allowed === self::PJGT_GT) {
            return "Bulan laporan PJGT/GT hanya: Dzulhijjah, Safar, Rabi'ul Akhir, Jumadil Akhir, dan Sya'ban.";
        }
        if ($allowed === self::KOORDINATOR) {
            return "Bulan laporan koordinator hanya: Dzulqa'dah, Muharram, Rabi'ul Awal, Jumadil Awal, dan Rajab.";
        }

        $ids = implode(', ', array_map('strval', $allowed));

        return "Bulan laporan tidak valid. Bulan yang diizinkan: {$ids}.";
    }
}

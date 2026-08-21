<?php

declare(strict_types=1);

namespace App\Helpers;

/**
 * Jendela pengisian shohifah: Sya'ban (8), Ramadhan (9), Syawal (10) — dari psa___kalender.
 */
final class ShohifahWindowHelper
{
    /** @var list<int> */
    public const ACTIVE_HIJRI_MONTHS = [8, 9, 10];

    /**
     * @return array{active:bool,id_bulan:?int,hijriyah:?string,tahun_ajaran:?string,label:string}
     */
    public static function statusNow(\PDO $db, ?string $masehiYmd = null, ?string $waktu = null): array
    {
        $masehi = $masehiYmd && preg_match('/^\d{4}-\d{2}-\d{2}$/', $masehiYmd)
            ? $masehiYmd
            : date('Y-m-d');
        $time = $waktu !== null && $waktu !== '' ? $waktu : date('H:i:s');
        $hijri = PsaKalenderMasehiToHijriHelper::masehiYmdToHijriyahYmd($db, $masehi, $time);
        $idBulan = null;
        if (is_string($hijri) && preg_match('/^\d{4}-(\d{2})-\d{2}$/', $hijri, $m)) {
            $idBulan = (int) $m[1];
        }
        $active = $idBulan !== null && in_array($idBulan, self::ACTIVE_HIJRI_MONTHS, true);
        $ta = TahunAjaranActiveHelper::resolveTahunAjaranForTransaction($db, $hijri, $masehi);
        $labels = [
            8 => "Sya'ban",
            9 => 'Ramadhan',
            10 => 'Syawal',
        ];

        return [
            'active' => $active,
            'id_bulan' => $idBulan,
            'hijriyah' => $hijri,
            'tahun_ajaran' => $ta,
            'label' => $idBulan !== null ? ($labels[$idBulan] ?? ('Bulan ' . $idBulan)) : '',
            'message' => $active
                ? 'Masa pengisian shohifah aktif'
                : "Shohifah hanya dapat diisi pada Sya'ban, Ramadhan, dan Syawal",
        ];
    }

    public static function isActiveNow(\PDO $db): bool
    {
        return self::statusNow($db)['active'] === true;
    }
}

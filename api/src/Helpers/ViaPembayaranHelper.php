<?php

namespace App\Helpers;

/**
 * Normalisasi label kolom `via` pembayaran agar konsisten di API (laporan, pemasukan, dll.).
 */
final class ViaPembayaranHelper
{
    /**
     * Canonical untuk pembayaran gateway iPayMu (tanpa membedakan huruf besar/kecil / spasi).
     */
    public const CANONICAL_IPAYMU = 'iPayMu';

    /**
     * Tampilan / response JSON: kosong → '-', varian iPayMu → {@see CANONICAL_IPAYMU}, selain itu trim apa adanya.
     */
    public static function normalizeForDisplay(?string $via): string
    {
        if ($via === null) {
            return '-';
        }
        $s = trim((string) $via);
        if ($s === '') {
            return '-';
        }
        if (self::isIpaymuVariant($s)) {
            return self::CANONICAL_IPAYMU;
        }

        return $s;
    }

    public static function isIpaymuVariant(string $s): bool
    {
        $compact = strtolower(str_replace([' ', '_', '-'], '', $s));

        return $compact === 'ipaymu';
    }

    /**
     * Gabungkan hasil SQL `GROUP BY via` setelah normalisasi (agregat per via tidak terpecah oleh typo/case).
     *
     * @param list<array{via?: mixed, total_via?: mixed, jumlah_transaksi_via?: mixed}> $rows
     * @return list<array{via: string, total_via: float, jumlah_transaksi: int}>
     */
    public static function mergeAggregatedViaRows(array $rows): array
    {
        $acc = [];
        foreach ($rows as $r) {
            $raw = $r['via'] ?? null;
            $rawStr = $raw === null || $raw === '' ? null : (string) $raw;
            $key = self::normalizeForDisplay($rawStr);
            $total = floatval($r['total_via'] ?? 0);
            $cnt = intval($r['jumlah_transaksi_via'] ?? 0);
            if (!isset($acc[$key])) {
                $acc[$key] = [
                    'via' => $key,
                    'total_via' => 0.0,
                    'jumlah_transaksi' => 0,
                ];
            }
            $acc[$key]['total_via'] += $total;
            $acc[$key]['jumlah_transaksi'] += $cnt;
        }
        $list = array_values($acc);
        usort($list, static function (array $a, array $b): int {
            return $b['total_via'] <=> $a['total_via'];
        });

        return $list;
    }
}

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

    public const CANONICAL_XENDIT = 'Xendit';

    /**
     * Tampilan / response JSON: kosong → '-', varian iPayMu/Xendit → canonical, selain itu trim apa adanya.
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
        if (self::isXenditVariant($s)) {
            return self::CANONICAL_XENDIT;
        }

        return $s;
    }

    public static function isIpaymuVariant(string $s): bool
    {
        $compact = strtolower(str_replace([' ', '_', '-'], '', $s));

        return $compact === 'ipaymu';
    }

    public static function isXenditVariant(string $s): bool
    {
        $compact = strtolower(str_replace([' ', '_', '-'], '', $s));

        return $compact === 'xendit';
    }

    /**
     * Label metode gateway (VA/QRIS/CStore) — struktur sama iPayMu & Xendit di payment___transaction.
     */
    public static function describeGatewayMetode(?string $paymentMethod, ?string $paymentChannel): ?string
    {
        return self::describeIpaymuMetode($paymentMethod, $paymentChannel);
    }

    public static function describeXenditMetode(?string $paymentMethod, ?string $paymentChannel): ?string
    {
        return self::describeGatewayMetode($paymentMethod, $paymentChannel);
    }

    /**
     * Label metode iPaymu untuk tampilan (VA bank, QRIS, Indomaret, Alfamart, dll.) dari payment___transaction.
     *
     * @param ?string $paymentMethod va | cstore | qris | cod (atau kosong)
     * @param ?string $paymentChannel contoh: bca, indomaret, alfamart
     */
    public static function describeIpaymuMetode(?string $paymentMethod, ?string $paymentChannel): ?string
    {
        $pm = $paymentMethod !== null ? strtolower(trim((string) $paymentMethod)) : '';
        $chRaw = $paymentChannel !== null ? trim((string) $paymentChannel) : '';
        $ch = strtolower($chRaw);

        if ($pm === '' && $ch === '') {
            return null;
        }

        $vaLabels = [
            'bca' => 'BCA', 'bni' => 'BNI', 'bri' => 'BRI', 'mandiri' => 'Mandiri',
            'permata' => 'Permata', 'cimb' => 'CIMB', 'danamon' => 'Danamon',
            'bca_syariah' => 'BCA Syariah', 'bni_syariah' => 'BNI Syariah',
            'bri_syariah' => 'BRI Syariah', 'mandiri_syariah' => 'Mandiri Syariah',
        ];
        $cstoreLabels = ['alfamart' => 'Alfamart', 'indomaret' => 'Indomaret'];
        $ewalletLabels = [
            'dana' => 'DANA',
            'ovo' => 'OVO',
            'gopay' => 'GoPay',
            'shopeepay' => 'ShopeePay',
            'linkaja' => 'LinkAja',
        ];

        if ($pm === 'qris') {
            return 'QRIS';
        }
        if ($pm === 'ewallet') {
            $wallet = $ewalletLabels[$ch] ?? ($chRaw !== '' ? ucfirst(str_replace('_', ' ', $chRaw)) : '');

            return $wallet !== '' ? 'E-Wallet · ' . $wallet : 'E-Wallet';
        }
        if ($pm === 'va') {
            $bank = $vaLabels[$ch] ?? ($chRaw !== '' ? ucfirst(str_replace('_', ' ', $chRaw)) : '');

            return $bank !== '' ? 'Virtual Account · ' . $bank : 'Virtual Account';
        }
        if ($pm === 'cstore') {
            $store = $cstoreLabels[$ch] ?? ($chRaw !== '' ? ucfirst(str_replace('_', ' ', $chRaw)) : '');

            return $store !== '' ? $store : 'Minimarket (Alfamart / Indomaret)';
        }
        if ($pm === 'cod') {
            return 'COD';
        }

        if ($pm !== '') {
            $extra = $chRaw !== '' ? ucfirst(str_replace('_', ' ', $chRaw)) : '';

            return $extra !== '' ? ucfirst($pm) . ' · ' . $extra : ucfirst($pm);
        }

        return $chRaw !== '' ? ucfirst(str_replace('_', ' ', $chRaw)) : null;
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

<?php

declare(strict_types=1);

namespace App\Helpers;

/**
 * Tarif UWABA bulanan — selaras ebeddien/public/js/uwaba/uwaba-prices.json & uwabaCalculator.js.
 */
final class UwabaPricingHelper
{
    /** @return list<string> */
    public static function getPricesJsonCandidatePaths(): array
    {
        $root = dirname(__DIR__, 3);

        return [
            $root . DIRECTORY_SEPARATOR . 'js' . DIRECTORY_SEPARATOR . 'uwaba' . DIRECTORY_SEPARATOR . 'uwaba-prices.json',
            $root . DIRECTORY_SEPARATOR . 'ebeddien' . DIRECTORY_SEPARATOR . 'public' . DIRECTORY_SEPARATOR . 'js'
                . DIRECTORY_SEPARATOR . 'uwaba' . DIRECTORY_SEPARATOR . 'uwaba-prices.json',
        ];
    }

    /** @return array<string, mixed>|null */
    public static function loadPricesJson(): ?array
    {
        foreach (self::getPricesJsonCandidatePaths() as $path) {
            if (!\is_readable($path)) {
                continue;
            }
            $raw = @file_get_contents($path);
            if ($raw === false || $raw === '') {
                continue;
            }
            $decoded = json_decode($raw, true);
            if (\is_array($decoded)) {
                return $decoded;
            }
        }

        return null;
    }

    public static function normalizeKey($raw): string
    {
        if ($raw === null) {
            return '';
        }
        $s = trim((string) $raw);
        if ($s === '' || $s === '-' || $s === 'null' || $s === 'undefined') {
            return '';
        }

        return $s;
    }

    /**
     * @param array<string, mixed>|null $prices
     */
    public static function addonWajib(?array $prices, string $section, string $keyRaw): int
    {
        if (!$prices || !isset($prices[$section]) || !\is_array($prices[$section])) {
            return 0;
        }
        $sectionData = $prices[$section];
        $k = self::normalizeKey($keyRaw);
        if ($k === '') {
            return 0;
        }
        if (isset($sectionData[$k]['wajib'])) {
            return (int) $sectionData[$k]['wajib'];
        }
        $n = (float) $k;
        if (\is_finite($n) && (string) (int) $k === $k) {
            $ik = (string) (int) $k;
            if (isset($sectionData[$ik]['wajib'])) {
                return (int) $sectionData[$ik]['wajib'];
            }
        }

        return 0;
    }

    /**
     * @param array<string, mixed> $biodata status_santri, kategori, diniyah, formal, lttq, saudara
     * @param array<string, mixed>|null $prices
     *
     * @return array{total: int, harga_dasar: int, tambahan_diniyah: int, tambahan_formal: int, tambahan_lttq: int, diskon_saudara: int, sebelum_diskon: int}
     */
    public static function calculateWajibBreakdown(array $biodata, ?array $prices): array
    {
        $empty = [
            'total' => 0,
            'harga_dasar' => 0,
            'tambahan_diniyah' => 0,
            'tambahan_formal' => 0,
            'tambahan_lttq' => 0,
            'diskon_saudara' => 0,
            'sebelum_diskon' => 0,
        ];
        if (!$prices) {
            return $empty;
        }

        $status = self::normalizeKey($biodata['status_santri'] ?? null);
        $dinKey = self::normalizeKey($biodata['diniyah'] ?? null);
        $forKey = self::normalizeKey($biodata['formal'] ?? null);
        $lttqKey = self::normalizeKey($biodata['lttq'] ?? null);
        $saudaraVal = self::normalizeKey($biodata['saudara'] ?? null);

        // Harga dasar flat per status (tanpa kategori Banin/Banat); jenjang ikut formal.
        $hargaDasar = 0;
        if ($status !== '' && isset($prices['status_santri'][$status]['wajib'])) {
            $hargaDasar = (int) $prices['status_santri'][$status]['wajib'];
        } elseif ($status !== '') {
            // BC JSON lama status[kategori].wajib — ambil nilai pertama jika ada
            $node = $prices['status_santri'][$status] ?? null;
            if (\is_array($node)) {
                foreach ($node as $sub) {
                    if (\is_array($sub) && isset($sub['wajib'])) {
                        $hargaDasar = (int) $sub['wajib'];
                        break;
                    }
                }
            }
        }

        $tDin = self::addonWajib($prices, 'diniyah', $dinKey);
        $tFor = self::addonWajib($prices, 'formal', $forKey);
        $tLttq = self::addonWajib($prices, 'lttq', $lttqKey);
        $sebelumDiskon = $hargaDasar + $tDin + $tFor + $tLttq;

        $diskon = 0;
        if ($saudaraVal !== '' && $saudaraVal !== 'Tidak Ada'
            && isset($prices['saudara'][$saudaraVal]) && \is_array($prices['saudara'][$saudaraVal])) {
            $cfg = $prices['saudara'][$saudaraVal];
            if (($cfg['diskon_type'] ?? '') === 'percentage') {
                $diskon = (int) round($sebelumDiskon * ((float) ($cfg['diskon'] ?? 0)) / 100);
            } else {
                $diskon = (int) ($cfg['diskon'] ?? 0);
            }
        }

        return [
            'total' => max($sebelumDiskon - $diskon, 0),
            'harga_dasar' => $hargaDasar,
            'tambahan_diniyah' => $tDin,
            'tambahan_formal' => $tFor,
            'tambahan_lttq' => $tLttq,
            'diskon_saudara' => $diskon,
            'sebelum_diskon' => $sebelumDiskon,
        ];
    }

    /**
     * @param array<string, mixed> $biodata
     */
    public static function calculateWajibFromBiodata(array $biodata, ?array $prices): int
    {
        return self::calculateWajibBreakdown($biodata, $prices)['total'];
    }

    public static function formatRp(int $amount): string
    {
        return 'Rp ' . number_format($amount, 0, ',', '.');
    }

    /**
     * @param array<string, mixed> $prices
     */
    public static function listOptionKeys(array $prices, string $section): array
    {
        if (!isset($prices[$section]) || !\is_array($prices[$section])) {
            return [];
        }

        return array_keys($prices[$section]);
    }
}

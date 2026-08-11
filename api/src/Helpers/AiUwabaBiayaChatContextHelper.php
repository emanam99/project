<?php

declare(strict_types=1);

namespace App\Helpers;

/**
 * Konteks publik tarif UWABA (syahriah bulanan) — selaras uwaba-prices.json & uwabaCalculator.js.
 */
final class AiUwabaBiayaChatContextHelper
{
    private const MAX_BLOCK_CHARS = 10500;

    public static function tryBuildUwabaBiayaContext(string $lastUserMessage): ?string
    {
        $trimmed = trim($lastUserMessage);
        if ($trimmed === '') {
            return null;
        }
        if (!self::messageSuggestsUwabaBiayaTopic($trimmed)) {
            return null;
        }

        $prices = UwabaPricingHelper::loadPricesJson();
        if ($prices === null) {
            return null;
        }

        try {
            return self::trimBlock(self::buildBlock($trimmed, $prices));
        } catch (\Throwable $e) {
            error_log('AiUwabaBiayaChatContextHelper: ' . $e->getMessage());

            return null;
        }
    }

    private static function messageSuggestsUwabaBiayaTopic(string $text): bool
    {
        $t = mb_strtolower($text, 'UTF-8');

        if (preg_match('/\b(uwaba|syahriah|syahriyah|syahriyyah|iuran\s+bulanan|pembayaran\s+bulanan)\b/iu', $t)) {
            if (preg_match('/\b(biaya|harga|nominal|berapa|wajib|tarif|rincian|bayar|tagihan)\b/iu', $t)) {
                return true;
            }
            if (preg_match('/\b(uwaba|syahriah)\b.*\b(berapa|berapaan)\b/iu', $t)) {
                return true;
            }
        }

        if (preg_match(
            '/\b(biaya|harga|nominal|berapa|wajib)\b.*\b(uwaba|syahriah)\b/iu',
            $t
        )) {
            return true;
        }

        if (preg_match(
            '/\b(diniyah|formal|lttq|mukim|khoriji|boyong)\b.*\b(biaya|harga|berapa|wajib|nominal)\b/iu',
            $t
        ) && !preg_match('/\b(pendaftar|pendaftaran|\bpsb\b|registrasi\s+baru|daftar\s+baru)\b/iu', $t)) {
            return true;
        }

        if (preg_match(
            '/\b(wustha|ulya|ula|isti.?dadi|tsanawiyah|ibtidaiyah|smai|stai)\b.*\b(biaya|harga|berapa)\b/iu',
            $t
        ) && !preg_match('/\b(pendaftar|pendaftaran|\bpsb\b)\b/iu', $t)) {
            return true;
        }

        return false;
    }

    /**
     * @param array<string, mixed> $prices
     */
    private static function buildBlock(string $userMessage, array $prices): string
    {
        $lines = [];
        $lines[] = '=== TARIF UWABA / SYAHRIAH BULANAN (sisipan server; publik; baca saja) ===';
        $lines[] = 'Sumber: uwaba-prices.json — sama dengan kalkulator di eBeddien (Input UWABA, Manage Data, rincian print).';
        $lines[] = 'Ini iuran bulanan per santri (10 bulan tahun ajaran hijriyah), BUKAN biaya pendaftaran PSB sekali daftar.';
        $lines[] = 'Rumus per bulan: (harga dasar status+kategori) + tambahan diniyah + tambahan formal + tambahan LTTQ − diskon saudara di pesantren.';

        $extracted = self::extractBiodataFromMessage($userMessage, $prices);
        if ($extracted !== []) {
            $bd = self::normalizeExtractedBiodata($extracted, $prices);
            $calc = UwabaPricingHelper::calculateWajibBreakdown($bd, $prices);
            $lines[] = '';
            $lines[] = '--- Simulasi dari pertanyaan (kondisi terdeteksi) ---';
            foreach (['status_santri', 'kategori', 'diniyah', 'formal', 'lttq', 'saudara'] as $fk) {
                $fv = self::normalizeKey($bd[$fk] ?? '');
                if ($fv !== '') {
                    $lines[] = '  · ' . self::fieldLabel($fk) . ': ' . $fv;
                }
            }
            $lines[] = '  · Harga dasar (status + kategori): ' . UwabaPricingHelper::formatRp($calc['harga_dasar']);
            if ($calc['tambahan_diniyah'] > 0) {
                $lines[] = '  · Tambahan diniyah: ' . UwabaPricingHelper::formatRp($calc['tambahan_diniyah']);
            }
            if ($calc['tambahan_formal'] > 0) {
                $lines[] = '  · Tambahan formal: ' . UwabaPricingHelper::formatRp($calc['tambahan_formal']);
            }
            if ($calc['tambahan_lttq'] > 0) {
                $lines[] = '  · Tambahan LTTQ: ' . UwabaPricingHelper::formatRp($calc['tambahan_lttq']);
            }
            if ($calc['diskon_saudara'] > 0) {
                $lines[] = '  · Diskon saudara: −' . UwabaPricingHelper::formatRp($calc['diskon_saudara'])
                    . ' (dari ' . UwabaPricingHelper::formatRp($calc['sebelum_diskon']) . ')';
            }
            $lines[] = '  · Total wajib per bulan: ' . UwabaPricingHelper::formatRp($calc['total']);
            if ($calc['harga_dasar'] === 0 && ($bd['status_santri'] === '' || $bd['kategori'] === '')) {
                $lines[] = '  (Catatan: harga dasar butuh status santri + kategori — mis. Mukim Banin; tambahkan ke simulasi bila pengguna belum menyebut.)';
            }
            $lines[] = '  (Kunci diniyah/formal/LTTQ = label tingkat di UI, selaras lembaga rombel / pilihan biodata.)';
        }

        $lines[] = '';
        $lines[] = '--- Katalog tarif (semua opsi di UI) ---';

        $lines[] = '';
        $lines[] = 'A) Harga dasar — Status santri × Kategori:';
        if (isset($prices['status_santri']) && \is_array($prices['status_santri'])) {
            foreach ($prices['status_santri'] as $status => $byKat) {
                if (!\is_array($byKat)) {
                    continue;
                }
                foreach ($byKat as $kat => $row) {
                    if (!\is_array($row)) {
                        continue;
                    }
                    $w = (int) ($row['wajib'] ?? 0);
                    $ket = trim((string) ($row['keterangan'] ?? ''));
                    $lines[] = '  - ' . $status . ' · ' . $kat . ': ' . UwabaPricingHelper::formatRp($w)
                        . ($ket !== '' ? ' — ' . $ket : '');
                }
            }
        }

        self::appendAddonSection($lines, 'B) Tambahan Diniyah (pilihan tingkat diniyah)', $prices['diniyah'] ?? []);
        self::appendAddonSection($lines, 'C) Tambahan Formal (pilihan tingkat formal)', $prices['formal'] ?? []);
        self::appendAddonSection($lines, 'D) Tambahan LTTQ', $prices['lttq'] ?? []);

        $lines[] = '';
        $lines[] = 'E) Diskon saudara di pesantren (dari total sebelum diskon):';
        if (isset($prices['saudara']) && \is_array($prices['saudara'])) {
            foreach ($prices['saudara'] as $key => $row) {
                if (!\is_array($row)) {
                    continue;
                }
                $ket = trim((string) ($row['keterangan'] ?? ''));
                $dtype = (string) ($row['diskon_type'] ?? '');
                $dval = $row['diskon'] ?? 0;
                $disc = $dtype === 'percentage' ? (string) $dval . '%' : UwabaPricingHelper::formatRp((int) $dval);
                $lines[] = '  - ' . $key . ': potongan ' . $disc . ($ket !== '' ? ' — ' . $ket : '');
            }
        }

        $lines[] = '';
        $lines[] = 'Field yang memengaruhi hitungan (isi di biodata / filter UWABA eBeddien):';
        $lines[] = '  status_santri, kategori (Banin/Banat/PAUD/…), diniyah, formal, lttq, saudara (jumlah saudara di pesantren).';
        $lines[] = 'Bulan UWABA: 10 bulan hijriyah (Dzul Qo\'dah s.d. Sya\'ban) — nominal di atas per bulan.';

        $lines[] = '';
        $lines[] = 'Petunjuk untuk asisten:';
        $lines[] = '(1) Jawab nominal hanya dari katalog/simulasi di atas; jangan mengarang harga.';
        $lines[] = '(2) Jelaskan rincian (dasar + tambahan − diskon) bila pengguna tanya «berapa» untuk kombinasi tertentu.';
        $lines[] = '(3) Bila status/kategori/diniyah/formal belum jelas, tanyakan sesuai opsi UI eBeddien.';
        $lines[] = '(4) Bedakan dengan biaya pendaftaran PSB (sekali daftar) — gunakan blok PSB terpisah bila pertanyaan tentang pendaftaran.';
        $lines[] = '(5) Bila pengguna minta detail per santri (riwayat bayar, tunggakan, bukti, status bulan tertentu), arahkan login ke Aplikasi wali MyBeddien: https://mybeddien.alutsmani.id';
        $lines[] = '(6) Informasi ini publik; akhiri [Pembayaran] atau [Umum] sesuai konteks.';

        return implode("\n", $lines);
    }

    /**
     * @param array<string, mixed> $section
     */
    private static function appendAddonSection(array &$lines, string $title, array $section): void
    {
        $lines[] = '';
        $lines[] = $title . ':';
        foreach ($section as $key => $row) {
            if (!\is_array($row)) {
                continue;
            }
            $w = (int) ($row['wajib'] ?? 0);
            $ket = trim((string) ($row['keterangan'] ?? ''));
            $lines[] = '  - ' . $key . ': +' . UwabaPricingHelper::formatRp($w)
                . ($ket !== '' ? ' — ' . $ket : '');
        }
    }

    /**
     * @param array<string, mixed> $prices
     *
     * @return array<string, string>
     */
    private static function extractBiodataFromMessage(string $message, array $prices): array
    {
        $lower = mb_strtolower($message, 'UTF-8');
        $out = [];

        $statusKeys = UwabaPricingHelper::listOptionKeys($prices, 'status_santri');
        foreach ($statusKeys as $status) {
            if (mb_strpos($lower, mb_strtolower($status, 'UTF-8')) !== false) {
                $out['status_santri'] = $status;
                break;
            }
        }

        $kategoriCandidates = ['Banin', 'Banat', 'PAUD', 'SD', 'Kuliah'];
        foreach ($kategoriCandidates as $kat) {
            if (mb_strpos($lower, mb_strtolower($kat, 'UTF-8')) === false) {
                continue;
            }
            $st = $out['status_santri'] ?? null;
            if ($st !== null && isset($prices['status_santri'][$st][$kat])) {
                $out['kategori'] = $kat;
                break;
            }
            if ($st === null) {
                foreach (array_keys($prices['status_santri'] ?? []) as $tryStatus) {
                    if (isset($prices['status_santri'][$tryStatus][$kat])) {
                        $out['status_santri'] = $tryStatus;
                        $out['kategori'] = $kat;
                        break 2;
                    }
                }
            }
        }

        foreach (['diniyah', 'formal', 'lttq'] as $section) {
            if (!isset($prices[$section]) || !\is_array($prices[$section])) {
                continue;
            }
            $best = '';
            $bestLen = 0;
            foreach (array_keys($prices[$section]) as $opt) {
                $needle = mb_strtolower((string) $opt, 'UTF-8');
                if (mb_strlen($needle, 'UTF-8') < 3) {
                    continue;
                }
                if (mb_strpos($lower, $needle) !== false && mb_strlen($needle, 'UTF-8') > $bestLen) {
                    $best = (string) $opt;
                    $bestLen = mb_strlen($needle, 'UTF-8');
                }
            }
            if ($best !== '') {
                $out[$section] = $best;
            }
        }

        if (preg_match('/\b(saudara|kakak|adik)\s*(di\s+)?pesantren\s*[:=]?\s*([0-4]|tidak\s+ada)/iu', $message, $m)) {
            $v = trim((string) ($m[3] ?? ''));
            if (stripos($v, 'tidak') !== false) {
                $out['saudara'] = 'Tidak Ada';
            } else {
                $out['saudara'] = $v;
            }
        } elseif (preg_match('/\b([1-4])\s+saudara\b/iu', $message, $m)) {
            $out['saudara'] = (string) $m[1];
        }

        return $out;
    }

    /**
     * @param array<string, string> $extracted
     * @param array<string, mixed> $prices
     *
     * @return array<string, string>
     */
    private static function normalizeExtractedBiodata(array $extracted, array $prices): array
    {
        $bd = [
            'status_santri' => self::normalizeKey($extracted['status_santri'] ?? ''),
            'kategori' => self::normalizeKey($extracted['kategori'] ?? ''),
            'diniyah' => self::normalizeKey($extracted['diniyah'] ?? ''),
            'formal' => self::normalizeKey($extracted['formal'] ?? ''),
            'lttq' => self::normalizeKey($extracted['lttq'] ?? ''),
            'saudara' => self::normalizeKey($extracted['saudara'] ?? '') ?: 'Tidak Ada',
        ];

        if ($bd['status_santri'] !== '' && $bd['kategori'] === '') {
            $firstKat = null;
            if (isset($prices['status_santri'][$bd['status_santri']])
                && \is_array($prices['status_santri'][$bd['status_santri']])) {
                $keys = array_keys($prices['status_santri'][$bd['status_santri']]);
                $firstKat = $keys[0] ?? null;
            }
            if ($firstKat !== null) {
                $bd['kategori'] = (string) $firstKat;
            }
        }

        return $bd;
    }

    private static function normalizeKey(string $s): string
    {
        return UwabaPricingHelper::normalizeKey($s);
    }

    private static function fieldLabel(string $field): string
    {
        return match ($field) {
            'status_santri' => 'Status santri',
            'kategori' => 'Kategori',
            'diniyah' => 'Diniyah',
            'formal' => 'Formal',
            'lttq' => 'LTTQ',
            'saudara' => 'Saudara di pesantren',
            default => $field,
        };
    }

    private static function trimBlock(string $s): string
    {
        if (mb_strlen($s, 'UTF-8') <= self::MAX_BLOCK_CHARS) {
            return $s;
        }

        return mb_substr($s, 0, self::MAX_BLOCK_CHARS - 48, 'UTF-8')
            . "\n…(katalog UWABA dipotong; minta kombinasi status/diniyah/formal lebih spesifik).";
    }
}

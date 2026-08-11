<?php

namespace App\Helpers;

/**
 * Parser notifikasi email BNI Bulk Payment (versi ID + EN).
 */
class BniEmailParser
{
    /**
     * @return array{
     *   ok: bool,
     *   message?: string,
     *   datetime?: string,
     *   reference?: string,
     *   type?: string,
     *   from_account_masked?: string,
     *   from_account_last3?: string,
     *   success_count?: int,
     *   success_amount?: int,
     *   fail_count?: int,
     *   fail_amount?: int,
     *   status?: string,
     *   is_success?: bool
     * }|null
     */
    public static function parse(string $raw): ?array
    {
        $text = self::normalize($raw);
        if ($text === '') {
            return null;
        }

        // Ambil blok Indonesia lebih dulu (sebelum pemisah bilingual), fallback seluruh teks
        $idBlock = $text;
        if (preg_match('/={10,}(.*?)(?:={10,}|We would like to inform)/is', $text, $m)) {
            $idBlock = trim($m[1] !== '' ? $m[1] : $text);
        }
        if (stripos($idBlock, 'Tanggal/Jam') === false && stripos($idBlock, 'Date/Time') === false) {
            $idBlock = $text;
        }

        $datetime = self::field($idBlock, ['Tanggal/Jam', 'Date/Time']);
        $reference = self::field($idBlock, ['No\. Referensi BNI', 'Reference No\.']);
        $type = self::field($idBlock, ['Tipe Transaksi', 'Transaction Type']);
        $fromAccount = self::field($idBlock, ['Dari Rekening', 'From Account']);
        $successCount = self::field($idBlock, ['Jumlah Rekening Berhasil', 'Success Transaction Count']);
        $successAmount = self::field($idBlock, ['Jumlah Nominal Berhasil', 'Success Transaction Amount']);
        $failCount = self::field($idBlock, ['Jumlah Rekening Gagal', 'Fail Transaction Count']);
        $failAmount = self::field($idBlock, ['Jumlah Nominal Gagal', 'Fail Transaction Amount']);
        $status = self::field($idBlock, ['Status']);

        if ($reference === null && $successAmount === null) {
            return [
                'ok' => false,
                'message' => 'Bukan format notifikasi BNI Bulk Payment',
            ];
        }

        $amount = self::parseIdrAmount((string) $successAmount);
        $count = self::parseInt((string) $successCount);
        $fails = self::parseInt((string) $failCount);
        $failAmt = self::parseIdrAmount((string) $failAmount);
        $last3 = self::extractMaskedLastDigits((string) $fromAccount, 3);
        $dt = self::parseBniDatetime((string) $datetime);
        $statusNorm = strtolower(trim((string) $status));
        $isSuccess = in_array($statusNorm, ['berhasil', 'success'], true);

        return [
            'ok' => true,
            'datetime' => $dt,
            'reference' => preg_replace('/\D+/', '', (string) $reference) ?: trim((string) $reference),
            'type' => trim((string) $type),
            'from_account_masked' => trim((string) $fromAccount),
            'from_account_last3' => $last3,
            'success_count' => $count,
            'success_amount' => $amount,
            'fail_count' => $fails,
            'fail_amount' => $failAmt,
            'status' => trim((string) $status),
            'is_success' => $isSuccess,
        ];
    }

    private static function normalize(string $raw): string
    {
        $text = str_replace(["\r\n", "\r"], "\n", $raw);
        // HTML kasar → teks
        if (stripos($text, '<html') !== false || stripos($text, '<br') !== false) {
            $text = html_entity_decode(strip_tags(str_ireplace(['<br>', '<br/>', '<br />', '</p>', '</div>'], "\n", $text)), ENT_QUOTES | ENT_HTML5, 'UTF-8');
        }
        $text = preg_replace("/[ \t]+/", ' ', $text) ?? $text;
        return trim($text);
    }

    /** @param list<string> $labels */
    private static function field(string $text, array $labels): ?string
    {
        foreach ($labels as $label) {
            // Delimiter # agar label berisi "/" (Tanggal/Jam) aman
            $pattern = '#' . $label . '\s*:?\s*([^\n]+)#iu';
            if (preg_match($pattern, $text, $m)) {
                return trim($m[1]);
            }
        }
        return null;
    }

    private static function parseIdrAmount(string $value): int
    {
        $value = trim($value);
        if ($value === '') {
            return 0;
        }
        // IDR 22,452,000.00 | Rp 22.452.000
        $value = preg_replace('/[^\d,.\-]/', '', $value) ?? '';
        if (preg_match('/^\d{1,3}(\.\d{3})+(,\d+)?$/', $value)) {
            // European / ID style 22.452.000,00
            $value = str_replace('.', '', $value);
            $value = str_replace(',', '.', $value);
        } else {
            // 22,452,000.00
            $value = str_replace(',', '', $value);
        }
        return (int) round((float) $value);
    }

    private static function parseInt(string $value): int
    {
        return (int) preg_replace('/\D+/', '', $value);
    }

    private static function extractMaskedLastDigits(string $fromAccount, int $n): string
    {
        // *************800 - 203548 ...
        if (preg_match('/\*+(\d{2,4})\b/', $fromAccount, $m)) {
            $digits = $m[1];
            return substr($digits, -$n);
        }
        $digits = preg_replace('/\D+/', '', $fromAccount) ?? '';
        return $digits !== '' ? substr($digits, -$n) : '';
    }

    private static function parseBniDatetime(string $value): ?string
    {
        $value = trim($value);
        if ($value === '') {
            return null;
        }

        // 10-Aug-2026 19:30:00 (bulan Inggris — jangan andalkan locale server)
        if (preg_match(
            '/^(\d{1,2})-([A-Za-z]{3})-(\d{4})\s+(\d{1,2}):(\d{2}):(\d{2})$/',
            $value,
            $m
        )) {
            $months = [
                'jan' => 1, 'feb' => 2, 'mar' => 3, 'apr' => 4, 'may' => 5, 'jun' => 6,
                'jul' => 7, 'aug' => 8, 'sep' => 9, 'oct' => 10, 'nov' => 11, 'dec' => 12,
            ];
            $mon = $months[strtolower($m[2])] ?? 0;
            if ($mon > 0) {
                $dt = \DateTimeImmutable::createFromFormat(
                    'Y-n-j H:i:s',
                    sprintf('%d-%d-%d %d:%s:%s', (int) $m[3], $mon, (int) $m[1], (int) $m[4], $m[5], $m[6]),
                    new \DateTimeZone('Asia/Jakarta')
                );
                if ($dt instanceof \DateTimeImmutable) {
                    return $dt->format('Y-m-d H:i:s');
                }
            }
        }

        $ts = strtotime($value);
        return $ts ? date('Y-m-d H:i:s', $ts) : null;
    }
}

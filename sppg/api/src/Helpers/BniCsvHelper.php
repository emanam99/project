<?php

namespace App\Helpers;

/**
 * CSV BNI Direct:
 * - Online  → transfer ke bank lain (kode bank + nama bank)
 * - Inhouse → transfer sesama BNI (template _IH_, tanpa kode/nama bank)
 */
class BniCsvHelper
{
    public const KIND_ONLINE = 'online';
    public const KIND_IH = 'ih';

    public static function isBniInhouse(array $row): bool
    {
        $code = preg_replace('/\D+/', '', (string) ($row['online_bank_code'] ?? '')) ?? '';
        if ($code === '009' || $code === '9') {
            return true;
        }
        $bank = strtoupper(trim((string) ($row['bank_tujuan'] ?? '')));
        if ($bank === '') {
            return false;
        }
        return (bool) preg_match('/\bBNI\b|BANK NEGARA INDONESIA/', $bank);
    }

    /**
     * @param list<array<string,mixed>> $rows
     * @return array{ih: list<array<string,mixed>>, online: list<array<string,mixed>>}
     */
    public static function split(array $rows): array
    {
        $ih = [];
        $online = [];
        foreach ($rows as $row) {
            if (self::isBniInhouse($row)) {
                $ih[] = $row;
            } else {
                $online[] = $row;
            }
        }
        return ['ih' => $ih, 'online' => $online];
    }

    /**
     * @param list<array<string,mixed>> $rows
     * @param array<int,string> $itemMap
     * @return array{
     *   body:string,
     *   csv_filename:string,
     *   nama_file:string,
     *   record_count:int,
     *   total_amount:int,
     *   trx_date:string,
     *   belanja_ids:list<int>,
     *   kind:string
     * }|null
     */
    public static function build(
        array $rows,
        string $namaFile,
        string $debit,
        string $kind,
        array $itemMap,
        ?\DateTimeImmutable $now = null
    ): ?array {
        $kind = $kind === self::KIND_IH ? self::KIND_IH : self::KIND_ONLINE;
        $now = $now ?? new \DateTimeImmutable('now');

        $dataLines = [];
        $totalAmount = 0;
        $belanjaIds = [];

        foreach ($rows as $row) {
            $amount = (int) round((float) ($row['total'] ?? 0));
            if ($amount <= 0) {
                continue;
            }
            $totalAmount += $amount;
            $belanjaIds[] = (int) $row['id'];

            $remark1 = trim((string) ($row['keterangan'] ?? ''));
            if ($remark1 === '') {
                $remark1 = $itemMap[(int) $row['id']] ?? '';
            }
            $line = [
                self::clip((string) (preg_replace('/\D+/', '', (string) ($row['nomor_rekening'] ?? '')) ?? ''), 16),
                self::clip((string) ($row['nama_penerima'] ?? ''), 80),
                (string) $amount,
                self::clip($remark1, 33),
                self::clip(self::formatRemark2((string) ($row['tanggal'] ?? '')), 50),
                '',
            ];
            if ($kind === self::KIND_ONLINE) {
                $line[] = self::clip((string) ($row['online_bank_code'] ?? ''), 3);
                $line[] = self::clip((string) ($row['bank_tujuan'] ?? ''), 35);
            } else {
                $line[] = '';
                $line[] = '';
            }
            $line = array_merge($line, array_fill(0, 8, ''));
            $line[] = 'N';
            $line[] = '';
            $line[] = '';
            $line[] = 'N';
            $dataLines[] = $line;
        }

        if (!$dataLines) {
            return null;
        }

        $namaFile = trim($namaFile);
        if ($namaFile === '') {
            $namaFile = 'belanja';
        }
        $namaFile = (string) (preg_replace('/[^\p{L}\p{N}\s\-_]/u', '', $namaFile) ?: 'belanja');
        $namaFile = trim((string) (preg_replace('/\s+/', ' ', $namaFile) ?? $namaFile));

        $created = $now->format('Y/m/d_H.i.s');
        $stamp = $now->format('Ymd_His');
        $trxDate = $now->format('Ymd');
        $recordCount = count($dataLines);
        $suffix = $kind === self::KIND_IH ? 'IH' : 'Online';
        $safeNama = preg_replace('/\s+/', '_', $namaFile) ?: 'belanja';

        $csvRows = [];
        $csvRows[] = self::padRow([$created, (string) ($recordCount + 2), $namaFile], 20);
        $csvRows[] = self::padRow(['P', $trxDate, $debit, (string) $recordCount, (string) $totalAmount], 20);
        foreach ($dataLines as $line) {
            $csvRows[] = self::padRow($line, 20);
        }

        $body = '';
        foreach ($csvRows as $cols) {
            $body .= implode(',', $cols) . "\r\n";
        }

        return [
            'body' => $body,
            'csv_filename' => sprintf('%s_%s_%s.csv', $safeNama, $suffix, $stamp),
            'nama_file' => $namaFile,
            'record_count' => $recordCount,
            'total_amount' => $totalAmount,
            'trx_date' => $trxDate,
            'belanja_ids' => $belanjaIds,
            'kind' => $kind,
        ];
    }

    public static function kindLabel(string $kind): string
    {
        return $kind === self::KIND_IH ? 'BNI Inhouse' : 'BNI Online';
    }

    private static function formatRemark2(string $ymd): string
    {
        $ts = strtotime($ymd . ' 00:00:00');
        if ($ts === false) {
            return '';
        }
        $hari = ['MINGGU', 'SENIN', 'SELASA', 'RABU', 'KAMIS', 'JUMAT', 'SABTU'];
        $bulan = ['', 'JAN', 'FEB', 'MAR', 'APR', 'MEI', 'JUN', 'JUL', 'AGU', 'SEP', 'OKT', 'NOV', 'DES'];
        return $hari[(int) date('w', $ts)] . ' ' . (int) date('j', $ts) . ' ' . $bulan[(int) date('n', $ts)];
    }

    private static function clip(string $value, int $max): string
    {
        $value = trim(preg_replace('/\s+/u', ' ', str_replace([',', ';', "\r", "\n", '"'], ' ', $value)) ?? '');
        if (function_exists('mb_substr')) {
            return mb_substr($value, 0, $max);
        }
        return substr($value, 0, $max);
    }

    /** @param list<string> $cols @return list<string> */
    private static function padRow(array $cols, int $width): array
    {
        while (count($cols) < $width) {
            $cols[] = '';
        }
        return array_slice($cols, 0, $width);
    }
}

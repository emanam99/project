<?php

declare(strict_types=1);

namespace App\Helpers;

use PDO;

/**
 * Export / upload / rekonsiliasi CSV Bank Jatim untuk Bisyaroh.
 */
final class BisyarohTransferHelper
{
    public const JENIS_EXPORT = 'export_upload';
    public const JENIS_MUTASI = 'mutasi_hasil';
    public const DEFAULT_SOURCE = '1581600000';
    public const PAYMENT_LABEL = 'Bisyaroh';
    public const ORG_NAME = 'AL UTSMANI';
    public const EMAIL = 'alutsmanipps@gmail.com';

    public static function storageDir(): string
    {
        $base = dirname(__DIR__, 2) . DIRECTORY_SEPARATOR . 'uploads' . DIRECTORY_SEPARATOR . 'bisyaroh_transfer';
        if (!is_dir($base)) {
            @mkdir($base, 0755, true);
        }

        return $base;
    }

    public static function sanitizeRekening(mixed $raw): string
    {
        return preg_replace('/\D+/', '', (string) $raw) ?? '';
    }

    public static function floorNominal(mixed $raw): int
    {
        if (is_int($raw) || is_float($raw)) {
            $n = (float) $raw;

            return (int) (floor(abs($n)) * ($n < 0 ? -1 : 1));
        }
        $s = trim((string) $raw);
        $s = preg_replace('/^Rp\.?\s*/i', '', $s) ?? $s;
        $s = str_replace([' ', "\xc2\xa0"], '', $s);
        if ($s === '' || $s === '-' || $s === '—') {
            return 0;
        }
        $hasComma = str_contains($s, ',');
        $hasDot = str_contains($s, '.');
        if ($hasComma && $hasDot) {
            if (strrpos($s, ',') > strrpos($s, '.')) {
                $s = str_replace('.', '', $s);
                $s = str_replace(',', '.', $s);
            } else {
                $s = str_replace(',', '', $s);
            }
        } elseif ($hasComma) {
            $parts = explode(',', $s);
            if (count($parts) === 2 && strlen($parts[1]) > 0 && strlen($parts[1]) <= 2) {
                $s = str_replace('.', '', $parts[0]) . '.' . $parts[1];
            } else {
                $s = str_replace(',', '', $s);
            }
        } elseif ($hasDot && preg_match('/^\d{1,3}(\.\d{3})+$/', $s)) {
            $s = str_replace('.', '', $s);
        }
        $n = (float) $s;
        if (!is_finite($n)) {
            return 0;
        }

        return (int) (floor(abs($n)) * ($n < 0 ? -1 : 1));
    }

    public static function sanitizeNama(mixed $raw): string
    {
        $s = (string) $raw;
        if (class_exists(\Normalizer::class)) {
            $n = \Normalizer::normalize($s, \Normalizer::FORM_KD);
            if (is_string($n)) {
                $s = $n;
            }
        }
        $s = preg_replace('/[\x{0300}-\x{036f}]/u', '', $s) ?? $s;
        $s = mb_strtoupper($s, 'UTF-8');
        $s = preg_replace('/[^\p{L}\s]+/u', ' ', $s) ?? $s;
        $s = preg_replace('/\s+/', ' ', $s) ?? $s;

        return trim($s);
    }

    /** Keterangan CSV Jatim (ket-1 & ket-2 sama): lembaga-nip */
    public static function formatKeterangan2(string $lembagaNamaOrId, mixed $nip): string
    {
        $lembaga = (string) $lembagaNamaOrId;
        if (class_exists(\Normalizer::class)) {
            $n = \Normalizer::normalize($lembaga, \Normalizer::FORM_KD);
            if (is_string($n)) {
                $lembaga = $n;
            }
        }
        $lembaga = preg_replace('/[\x{0300}-\x{036f}]/u', '', $lembaga) ?? $lembaga;
        $lembaga = preg_replace('/[^\p{L}\p{N}]+/u', '', $lembaga) ?? $lembaga;
        $lembaga = trim($lembaga);
        $nipPart = preg_replace('/\D+/', '', (string) ($nip ?? '')) ?? '';
        if ($lembaga === '' && $nipPart === '') {
            return '';
        }
        if ($lembaga === '') {
            return $nipPart;
        }
        if ($nipPart === '') {
            return $lembaga;
        }

        return $lembaga . '-' . $nipPart;
    }

    public static function csvEscape(mixed $value): string
    {
        $s = (string) ($value ?? '');
        if (preg_match('/[",\n\r]/', $s)) {
            return '"' . str_replace('"', '""', $s) . '"';
        }

        return $s;
    }

    /**
     * @param list<array<string, mixed>> $metaRows
     * @return array{csv: string, row_count: int, total_nominal: int}
     */
    public static function buildExportCsv(array $metaRows, string $sourceAccount = self::DEFAULT_SOURCE): array
    {
        $total = 0;
        $lines = [];
        foreach ($metaRows as $r) {
            $nominal = (int) ($r['nominal'] ?? 0);
            $total += $nominal;
            $ket = trim((string) ($r['keterangan_2'] ?? ''));
            if ($ket === '') {
                $ket = self::PAYMENT_LABEL;
            }
            $lines[] = implode(',', [
                self::csvEscape($r['rekening'] ?? ''),
                self::csvEscape($r['nama'] ?? ''),
                self::csvEscape((string) $nominal),
                self::csvEscape($ket),
                self::csvEscape($ket),
                self::csvEscape(self::ORG_NAME),
                self::csvEscape(self::EMAIL),
            ]);
        }
        $header = implode(',', [
            self::csvEscape($sourceAccount),
            self::csvEscape((string) $total),
            self::csvEscape((string) count($lines)),
        ]);
        $csv = $header . "\r\n" . (count($lines) ? implode("\r\n", $lines) . "\r\n" : '');

        return ['csv' => $csv, 'row_count' => count($lines), 'total_nominal' => $total];
    }

    /** Mutasi Jatim: Description = ket-1 (Bisyaroh lama, atau lembaga-nip). */
    public static function isMutasiBisyarohDescription(string $desc): bool
    {
        $d = trim($desc);
        if ($d === '' || strcasecmp($d, 'null') === 0) {
            return false;
        }
        if (strcasecmp($d, self::PAYMENT_LABEL) === 0) {
            return true;
        }

        return (bool) preg_match('/^[\p{L}\p{N}]+-\d+$/u', $d);
    }

    /**
     * Parse mutasi Bank Jatim (preamble + header Inggris).
     *
     * @return list<array{line_no: int, rekening: string, nama: string, nominal: int, bank_ref: string, raw: array<string, string>}>
     */
    public static function parseMutasiCsv(string $content): array
    {
        if (str_starts_with($content, "\xFF\xFE") || str_starts_with($content, "\xFE\xFF")) {
            $enc = str_starts_with($content, "\xFE\xFF") ? 'UTF-16BE' : 'UTF-16LE';
            $converted = @mb_convert_encoding($content, 'UTF-8', $enc);
            if (is_string($converted) && $converted !== '') {
                $content = $converted;
            }
        }
        $content = preg_replace('/^\xEF\xBB\xBF/', '', $content) ?? $content;
        $lines = preg_split('/\r\n|\n|\r/', $content) ?: [];
        $headerIdx = -1;
        $headers = [];
        foreach ($lines as $i => $line) {
            if (stripos($line, 'Posting Date') !== false && stripos($line, 'Account') !== false) {
                $headerIdx = $i;
                $headers = str_getcsv($line);
                break;
            }
        }
        if ($headerIdx < 0 || $headers === []) {
            throw new \InvalidArgumentException('Format CSV mutasi Bank Jatim tidak dikenali (header tidak ditemukan)');
        }
        $map = [];
        foreach ($headers as $hi => $h) {
            $map[strtolower(trim((string) $h))] = $hi;
        }
        $need = ['account', 'name', 'description', 'debit'];
        foreach ($need as $n) {
            if (!isset($map[$n])) {
                throw new \InvalidArgumentException('Kolom mutasi wajib tidak ada: ' . $n);
            }
        }
        $out = [];
        $lineNo = 0;
        for ($i = $headerIdx + 1; $i < count($lines); $i++) {
            $line = trim((string) $lines[$i]);
            if ($line === '') {
                continue;
            }
            $cols = str_getcsv($line);
            if ($cols === [] || trim((string) ($cols[0] ?? '')) === '') {
                continue;
            }
            $desc = trim((string) ($cols[$map['description']] ?? ''));
            if (!self::isMutasiBisyarohDescription($desc)) {
                continue;
            }
            $account = trim((string) ($cols[$map['account']] ?? ''));
            if ($account === '' || strcasecmp($account, 'null') === 0) {
                continue;
            }
            $rekening = self::sanitizeRekening($account);
            $debit = self::floorNominal($cols[$map['debit']] ?? 0);
            if ($rekening === '' || $debit <= 0) {
                continue;
            }
            ++$lineNo;
            $refIdx = $map['reference no'] ?? ($map['reference'] ?? null);
            $out[] = [
                'line_no' => $lineNo,
                'rekening' => $rekening,
                'nama' => trim((string) ($cols[$map['name']] ?? '')),
                'nominal' => $debit,
                'bank_ref' => $refIdx !== null ? trim((string) ($cols[$refIdx] ?? '')) : '',
                'raw' => [
                    'account' => $account,
                    'name' => trim((string) ($cols[$map['name']] ?? '')),
                    'description' => $desc,
                    'debit' => (string) ($cols[$map['debit']] ?? ''),
                ],
            ];
        }

        return $out;
    }

    public static function tableExists(PDO $db, string $table): bool
    {
        try {
            $stmt = $db->prepare(
                'SELECT 1 FROM information_schema.`TABLES` WHERE `TABLE_SCHEMA` = DATABASE() AND `TABLE_NAME` = ? LIMIT 1'
            );
            $stmt->execute([$table]);

            return (bool) $stmt->fetchColumn();
        } catch (\Throwable $e) {
            return false;
        }
    }

    public static function rekapHasTransferStatus(PDO $db): bool
    {
        try {
            $stmt = $db->query(
                "SELECT 1 FROM information_schema.`COLUMNS`
                 WHERE `TABLE_SCHEMA` = DATABASE()
                   AND `TABLE_NAME` = 'bisyaroh___rekap_baris'
                   AND `COLUMN_NAME` = 'transfer_status' LIMIT 1"
            );

            return (bool) $stmt->fetchColumn();
        } catch (\Throwable $e) {
            return false;
        }
    }

    /**
     * Tandai transfer berhasil pada rekap_baris + freeze + potong.
     *
     * @return array{ok: bool, message?: string, potong?: array{applied: int, messages: list<string>}}
     */
    public static function markRekapBarisBerhasil(
        PDO $db,
        int $rekapBarisId,
        ?string $lembagaId,
        string $periodeBulan,
        string $kalender,
        int $actorPengurusId
    ): array {
        if ($rekapBarisId <= 0) {
            return ['ok' => false, 'message' => 'rekap_baris_id tidak valid'];
        }
        if (!self::rekapHasTransferStatus($db)) {
            return ['ok' => false, 'message' => 'Kolom transfer_status belum dimigrasi'];
        }
        $stmt = $db->prepare(
            'SELECT `id`, `transfer_status` FROM `bisyaroh___rekap_baris` WHERE `id` = ? LIMIT 1'
        );
        $stmt->execute([$rekapBarisId]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        if (!is_array($row)) {
            return ['ok' => false, 'message' => 'Baris rekap tidak ditemukan'];
        }
        if (($row['transfer_status'] ?? '') === 'berhasil') {
            return ['ok' => true, 'potong' => ['applied' => 0, 'messages' => []]];
        }
        BisyarohRekapSnapshotHelper::freezeRekapBarisById($db, $rekapBarisId, $lembagaId);
        $upd = $db->prepare(
            'UPDATE `bisyaroh___rekap_baris`
             SET `transfer_status` = \'berhasil\', `transfer_at` = CURRENT_TIMESTAMP, `transfer_by_pengurus_id` = ?
             WHERE `id` = ? LIMIT 1'
        );
        $upd->execute([$actorPengurusId > 0 ? $actorPengurusId : null, $rekapBarisId]);
        $potong = BisyarohPotongKewajibanApplier::applyAfterRilisForBaris(
            $db,
            $rekapBarisId,
            $periodeBulan,
            $kalender,
            $actorPengurusId
        );

        return ['ok' => true, 'potong' => $potong];
    }

    /**
     * Rekonsiliasi: baris export vs mutasi (rekening + nominal).
     *
     * @param list<array<string, mixed>> $exportRows dari DB
     * @param list<array{line_no:int, rekening:string, nama:string, nominal:int, bank_ref:string, raw:array}> $mutasiRows
     * @return array{matched: int, gagal: int, details: list<array<string, mixed>>, unmatched_mutasi_line_nos: list<int>}
     */
    public static function reconcileExportAgainstMutasi(array $exportRows, array $mutasiRows): array
    {
        /** @var array<string, list<int>> $pool index key => list of mutasi indexes still free */
        $pool = [];
        foreach ($mutasiRows as $mi => $m) {
            $key = ($m['rekening'] ?? '') . '|' . (int) ($m['nominal'] ?? 0);
            $pool[$key] = $pool[$key] ?? [];
            $pool[$key][] = $mi;
        }
        $matched = 0;
        $gagal = 0;
        $details = [];
        $matchedMutasiLine = [];
        foreach ($exportRows as $ex) {
            $rek = self::sanitizeRekening($ex['rekening'] ?? '');
            $nom = (int) ($ex['nominal'] ?? 0);
            $nip = trim((string) ($ex['nip'] ?? ''));
            $lembagaId = trim((string) ($ex['lembaga_id'] ?? ''));
            $detail = [
                'export_baris_id' => (int) ($ex['id'] ?? 0),
                'rekening' => $rek,
                'nominal' => $nom,
                'nip' => $nip,
                'lembaga_id' => $lembagaId,
                'keterangan_2' => trim((string) ($ex['keterangan_2'] ?? '')),
                'bisyaroh_id' => isset($ex['bisyaroh_id']) ? (int) $ex['bisyaroh_id'] : null,
                'rekap_baris_id' => isset($ex['rekap_baris_id']) ? (int) $ex['rekap_baris_id'] : null,
                'id_pengurus' => isset($ex['id_pengurus']) ? (int) $ex['id_pengurus'] : null,
            ];
            if ($rek === '' || $nom <= 0) {
                $detail['transfer_status'] = 'gagal';
                $detail['match_status'] = 'unmatched';
                $detail['last_error'] = 'Data export tidak lengkap (rekening/nominal)';
                ++$gagal;
                $details[] = $detail;
                continue;
            }
            $key = $rek . '|' . $nom;
            if (empty($pool[$key])) {
                $detail['transfer_status'] = 'gagal';
                $detail['match_status'] = 'unmatched';
                $detail['last_error'] = 'Tidak ditemukan di mutasi Bank Jatim';
                ++$gagal;
                $details[] = $detail;
                continue;
            }
            $mi = array_shift($pool[$key]);
            $m = $mutasiRows[$mi];
            $lineNo = (int) ($m['line_no'] ?? 0);
            $detail['transfer_status'] = 'berhasil';
            $detail['match_status'] = 'matched';
            $detail['bank_ref'] = $m['bank_ref'] ?? '';
            $detail['mutasi_line_no'] = $lineNo;
            if ($lineNo > 0) {
                $matchedMutasiLine[$lineNo] = true;
            }
            ++$matched;
            $details[] = $detail;
        }
        $unmatchedMutasi = [];
        foreach ($mutasiRows as $m) {
            $lineNo = (int) ($m['line_no'] ?? 0);
            if ($lineNo > 0 && empty($matchedMutasiLine[$lineNo])) {
                $unmatchedMutasi[] = $lineNo;
            }
        }

        return [
            'matched' => $matched,
            'gagal' => $gagal,
            'details' => $details,
            'unmatched_mutasi_line_nos' => $unmatchedMutasi,
        ];
    }
}

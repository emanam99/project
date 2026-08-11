<?php

namespace App\Services;

use App\Helpers\BniEmailParser;
use App\Helpers\CairStatusHelper;
use PDO;

class BniBatchService
{
    private PDO $db;

    public function __construct(PDO $db)
    {
        $this->db = $db;
    }

    public static function debitAccount(): string
    {
        $raw = trim((string) ($_ENV['BNI_DEBIT_ACCOUNT'] ?? ''));
        if ($raw === '') {
            $raw = '5268080020354800';
        }
        return preg_replace('/\D+/', '', $raw) ?? '';
    }

    /**
     * Arsipkan CSV + metadata saat status Maker.
     *
     * @param list<int> $belanjaIds
     * @return array{batch_id:int, csv_filename:string, record_count:int, total_amount:int, debit_account:string}
     */
    public function archiveFromBelanjaIds(array $belanjaIds, string $namaFile, ?int $createdBy = null): array
    {
        $belanjaIds = array_values(array_unique(array_filter(array_map('intval', $belanjaIds), static fn ($id) => $id > 0)));
        if (!$belanjaIds) {
            throw new \InvalidArgumentException('Tidak ada ID belanja untuk diarsipkan');
        }

        $debit = self::debitAccount();
        if ($debit === '') {
            throw new \RuntimeException('BNI_DEBIT_ACCOUNT belum dikonfigurasi');
        }

        $rows = $this->fetchRowsByIds($belanjaIds);
        if (!$rows) {
            throw new \RuntimeException('Belanja ber-rekening tidak ditemukan untuk arsip CSV');
        }

        $built = $this->buildCsv($rows, $namaFile, $debit);
        $dir = $this->archiveDir();
        if (!is_dir($dir) && !mkdir($dir, 0755, true) && !is_dir($dir)) {
            throw new \RuntimeException('Gagal membuat folder arsip BNI');
        }

        $path = $dir . DIRECTORY_SEPARATOR . $built['csv_filename'];
        if (file_put_contents($path, $built['body']) === false) {
            throw new \RuntimeException('Gagal menyimpan file arsip CSV');
        }

        $relPath = 'uploads/bni-batches/' . $built['csv_filename'];
        $stmt = $this->db->prepare(
            'INSERT INTO bni_batch
             (export_type, nama_file, csv_filename, csv_path, debit_account, record_count, total_amount, trx_date, belanja_ids, status, created_by)
             VALUES (\'bni_csv\', ?, ?, ?, ?, ?, ?, ?, ?, \'waiting\', ?)'
        );
        $stmt->execute([
            $built['nama_file'],
            $built['csv_filename'],
            $relPath,
            $debit,
            $built['record_count'],
            $built['total_amount'],
            $built['trx_date'],
            json_encode($built['belanja_ids'], JSON_UNESCAPED_UNICODE),
            $createdBy,
        ]);

        return [
            'batch_id' => (int) $this->db->lastInsertId(),
            'csv_filename' => $built['csv_filename'],
            'record_count' => $built['record_count'],
            'total_amount' => $built['total_amount'],
            'debit_account' => $debit,
        ];
    }

    /**
     * Arsipkan file ekspor (Excel Maker, dll).
     *
     * @param list<int> $belanjaIds
     * @return array{batch_id:int, csv_filename:string, record_count:int, total_amount:int}
     */
    public function archiveBinaryExport(
        array $belanjaIds,
        string $namaFile,
        string $exportType,
        string $binary,
        string $filename,
        int $totalAmount,
        ?int $createdBy = null
    ): array {
        $belanjaIds = array_values(array_unique(array_filter(array_map('intval', $belanjaIds), static fn ($id) => $id > 0)));
        if (!$belanjaIds) {
            throw new \InvalidArgumentException('Tidak ada ID belanja untuk diarsipkan');
        }
        if (!in_array($exportType, ['bni_csv', 'maker_xlsx'], true)) {
            throw new \InvalidArgumentException('Tipe ekspor tidak valid');
        }

        $namaFile = trim($namaFile);
        if ($namaFile === '') {
            $namaFile = $exportType === 'maker_xlsx' ? 'MAKER OPERASIONAL' : 'belanja';
        }
        $namaFile = (string) (preg_replace('/[^\p{L}\p{N}\s\-_]/u', '', $namaFile) ?: $namaFile);

        $dir = $this->archiveDir();
        if (!is_dir($dir) && !mkdir($dir, 0755, true) && !is_dir($dir)) {
            throw new \RuntimeException('Gagal membuat folder arsip ekspor');
        }

        $safe = preg_replace('/[^\w.\-]+/', '_', $filename) ?: ('export_' . date('Ymd_His'));
        $path = $dir . DIRECTORY_SEPARATOR . $safe;
        if (file_put_contents($path, $binary) === false) {
            throw new \RuntimeException('Gagal menyimpan file arsip');
        }

        $debit = self::debitAccount();
        $relPath = 'uploads/bni-batches/' . $safe;
        $now = new \DateTimeImmutable('now');
        $stmt = $this->db->prepare(
            'INSERT INTO bni_batch
             (export_type, nama_file, csv_filename, csv_path, debit_account, record_count, total_amount, trx_date, belanja_ids, status, created_by)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, \'waiting\', ?)'
        );
        $stmt->execute([
            $exportType,
            $namaFile,
            $safe,
            $relPath,
            $debit,
            count($belanjaIds),
            $totalAmount,
            $now->format('Ymd'),
            json_encode($belanjaIds, JSON_UNESCAPED_UNICODE),
            $createdBy,
        ]);

        return [
            'batch_id' => (int) $this->db->lastInsertId(),
            'csv_filename' => $safe,
            'record_count' => count($belanjaIds),
            'total_amount' => $totalAmount,
        ];
    }

    /**
     * Proses teks notifikasi BNI → cocokkan batch waiting → auto approved.
     *
     * @return array{success:bool, message:string, data?:array}
     */
    public function processEmailText(string $raw, ?string $messageId = null): array
    {
        $messageId = $messageId !== null && $messageId !== ''
            ? substr($messageId, 0, 255)
            : ('manual-' . hash('sha256', $raw));

        if ($this->emailAlreadyProcessed($messageId)) {
            return ['success' => true, 'message' => 'Email sudah diproses sebelumnya', 'data' => ['message_id' => $messageId, 'skipped' => true]];
        }

        $parsed = BniEmailParser::parse($raw);
        if ($parsed === null || empty($parsed['ok'])) {
            $this->logEmail($messageId, null, 'ignored', $parsed['message'] ?? 'Bukan notifikasi BNI');
            return ['success' => false, 'message' => $parsed['message'] ?? 'Bukan notifikasi BNI Bulk Payment'];
        }

        $ref = (string) ($parsed['reference'] ?? '');
        if ($ref === '') {
            $this->logEmail($messageId, null, 'ignored', 'Referensi BNI kosong');
            return ['success' => false, 'message' => 'No. Referensi BNI tidak ditemukan'];
        }

        if ($this->referenceAlreadyUsed($ref)) {
            $this->logEmail($messageId, $ref, 'duplicate', 'Referensi sudah dipakai');
            return ['success' => true, 'message' => 'Referensi BNI sudah tercatat', 'data' => ['reference' => $ref, 'skipped' => true]];
        }

        if (empty($parsed['is_success'])) {
            $this->logEmail($messageId, $ref, 'not_success', 'Status: ' . ($parsed['status'] ?? '-'));
            return ['success' => false, 'message' => 'Status transaksi bukan Berhasil/Success'];
        }

        $successCount = (int) ($parsed['success_count'] ?? 0);
        $successAmount = (int) ($parsed['success_amount'] ?? 0);
        if ($successCount <= 0 || $successAmount <= 0) {
            $this->logEmail($messageId, $ref, 'invalid', 'Count/amount kosong');
            return ['success' => false, 'message' => 'Jumlah rekening/nominal berhasil tidak valid'];
        }

        $batch = $this->findMatchingWaitingBatch($successCount, $successAmount, (string) ($parsed['from_account_last3'] ?? ''), $parsed['datetime'] ?? null);
        if (!$batch) {
            $this->logEmail($messageId, $ref, 'unmatched', "count={$successCount} amount={$successAmount}");
            return [
                'success' => false,
                'message' => 'Tidak ada batch Maker yang cocok (jumlah rekening + nominal + rekening debet)',
                'data' => [
                    'reference' => $ref,
                    'success_count' => $successCount,
                    'success_amount' => $successAmount,
                ],
            ];
        }

        $ids = json_decode((string) $batch['belanja_ids'], true);
        if (!is_array($ids) || !$ids) {
            $this->logEmail($messageId, $ref, 'error', 'belanja_ids kosong');
            return ['success' => false, 'message' => 'Data batch rusak (belanja_ids)'];
        }
        $ids = array_values(array_unique(array_filter(array_map('intval', $ids), static fn ($id) => $id > 0)));

        $this->db->beginTransaction();
        try {
            $placeholders = implode(',', array_fill(0, count($ids), '?'));
            $upd = $this->db->prepare(
                "UPDATE belanja SET bni_status = 'approved', updated_at = CURRENT_TIMESTAMP
                 WHERE id IN ($placeholders) AND bni_status = 'maker'"
            );
            $upd->execute($ids);
            $approvedRows = $upd->rowCount();

            CairStatusHelper::applyAfterApproved($this->db, $ids);

            $excerpt = substr(preg_replace('/\s+/', ' ', $raw) ?? $raw, 0, 1500);
            $mark = $this->db->prepare(
                "UPDATE bni_batch SET
                    status = 'approved',
                    bni_reference = ?,
                    email_datetime = ?,
                    email_success_count = ?,
                    email_success_amount = ?,
                    email_fail_count = ?,
                    email_raw_excerpt = ?,
                    matched_at = NOW(),
                    updated_at = CURRENT_TIMESTAMP
                 WHERE id = ? AND status = 'waiting'"
            );
            $mark->execute([
                $ref,
                $parsed['datetime'] ?? null,
                $successCount,
                $successAmount,
                (int) ($parsed['fail_count'] ?? 0),
                $excerpt,
                (int) $batch['id'],
            ]);

            $this->db->commit();
        } catch (\Throwable $e) {
            $this->db->rollBack();
            $this->logEmail($messageId, $ref, 'error', $e->getMessage());
            throw $e;
        }

        $this->logEmail($messageId, $ref, 'approved', 'batch#' . $batch['id'] . ' rows=' . $approvedRows);

        return [
            'success' => true,
            'message' => 'Batch Maker disetujui otomatis dari email BNI',
            'data' => [
                'batch_id' => (int) $batch['id'],
                'reference' => $ref,
                'approved_rows' => $approvedRows,
                'success_count' => $successCount,
                'success_amount' => $successAmount,
            ],
        ];
    }

    /**
     * Poll Gmail/IMAP untuk notifikasi BNI baru.
     *
     * @return array{success:bool, message:string, data?:array}
     */
    public function pollImap(int $limit = 20): array
    {
        if (!function_exists('imap_open')) {
            return ['success' => false, 'message' => 'Ekstensi PHP IMAP tidak tersedia'];
        }

        $host = trim((string) ($_ENV['BNI_NOTIFY_IMAP_HOST'] ?? 'imap.gmail.com'));
        $port = (int) ($_ENV['BNI_NOTIFY_IMAP_PORT'] ?? 993);
        $user = trim((string) ($_ENV['BNI_NOTIFY_IMAP_USER'] ?? ''));
        $pass = (string) ($_ENV['BNI_NOTIFY_IMAP_PASS'] ?? '');
        $folder = trim((string) ($_ENV['BNI_NOTIFY_IMAP_FOLDER'] ?? 'INBOX'));

        if ($user === '' || $pass === '') {
            return ['success' => false, 'message' => 'BNI_NOTIFY_IMAP_USER / BNI_NOTIFY_IMAP_PASS belum diisi di .env'];
        }

        $mailbox = sprintf('{%s:%d/imap/ssl/novalidate-cert}%s', $host, $port, $folder);
        $inbox = @imap_open($mailbox, $user, $pass);
        if ($inbox === false) {
            return ['success' => false, 'message' => 'Gagal koneksi IMAP: ' . imap_last_error()];
        }

        try {
            $since = date('d-M-Y', strtotime('-7 days'));
            $ids = imap_search($inbox, 'SINCE "' . $since . '"', SE_UID) ?: [];
            rsort($ids);
            $ids = array_slice($ids, 0, max(1, min(50, $limit)));

            $processed = [];
            foreach ($ids as $uid) {
                $header = imap_fetchheader($inbox, (string) $uid, FT_UID);
                $body = $this->imapBody($inbox, (string) $uid);
                $combined = $header . "\n" . $body;
                if (
                    stripos($combined, 'Bulk Payment') === false
                    && stripos($combined, 'Referensi BNI') === false
                    && stripos($combined, 'Reference No') === false
                ) {
                    continue;
                }

                $messageId = $this->extractMessageId($header) ?: ('imap-uid-' . $uid);
                $result = $this->processEmailText($body !== '' ? $body : $combined, $messageId);
                $processed[] = [
                    'uid' => $uid,
                    'message_id' => $messageId,
                    'result' => $result,
                ];
                if (!empty($result['success'])) {
                    imap_setflag_full($inbox, (string) $uid, '\\Seen', ST_UID);
                }
            }

            return [
                'success' => true,
                'message' => 'Poll IMAP selesai',
                'data' => [
                    'scanned' => count($ids),
                    'candidates' => count($processed),
                    'items' => $processed,
                ],
            ];
        } finally {
            imap_close($inbox);
        }
    }

    /** @param list<int> $ids */
    private function fetchRowsByIds(array $ids): array
    {
        $placeholders = implode(',', array_fill(0, count($ids), '?'));
        $sql = "SELECT b.id, b.tanggal, b.keterangan, b.total,
                       r.nomor_rekening, r.nama_penerima, r.bank_tujuan, r.online_bank_code
                FROM belanja b
                INNER JOIN rekening r ON r.id = b.rekening_id
                WHERE b.id IN ($placeholders)
                  AND r.nomor_rekening IS NOT NULL
                  AND r.nomor_rekening <> ''
                ORDER BY b.tanggal ASC, b.id ASC";
        $stmt = $this->db->prepare($sql);
        $stmt->execute($ids);
        return $stmt->fetchAll() ?: [];
    }

    /**
     * @param list<array<string,mixed>> $rows
     * @return array{body:string,csv_filename:string,nama_file:string,record_count:int,total_amount:int,trx_date:string,belanja_ids:list<int>}
     */
    private function buildCsv(array $rows, string $namaFile, string $debit): array
    {
        $itemMap = $this->itemNamesByBelanjaIds(array_map(static fn ($r) => (int) $r['id'], $rows));
        $dataLines = [];
        $totalAmount = 0;
        $belanjaIds = [];

        foreach ($rows as $row) {
            $amount = (int) round((float) $row['total']);
            if ($amount <= 0) {
                continue;
            }
            $totalAmount += $amount;
            $belanjaIds[] = (int) $row['id'];

            $remark1 = trim((string) ($row['keterangan'] ?? ''));
            if ($remark1 === '') {
                $remark1 = $itemMap[(int) $row['id']] ?? '';
            }
            $remark1 = $this->clip($remark1, 33);
            $remark2 = $this->clip($this->formatRemark2((string) $row['tanggal']), 50);

            $dataLines[] = [
                $this->clip((string) (preg_replace('/\D+/', '', (string) ($row['nomor_rekening'] ?? '')) ?? ''), 16),
                $this->clip((string) ($row['nama_penerima'] ?? ''), 80),
                (string) $amount,
                $remark1,
                $remark2,
                '',
                $this->clip((string) ($row['online_bank_code'] ?? ''), 3),
                $this->clip((string) ($row['bank_tujuan'] ?? ''), 35),
                '', '', '', '', '', '', '', '',
                'N',
                '',
                '',
                'N',
            ];
        }

        if (!$dataLines) {
            throw new \RuntimeException('Tidak ada baris nominal > 0 untuk arsip CSV');
        }

        $namaFile = trim($namaFile);
        if ($namaFile === '') {
            $namaFile = 'belanja';
        }
        $namaFile = (string) (preg_replace('/[^\p{L}\p{N}\s\-_]/u', '', $namaFile) ?: 'belanja');
        $namaFile = trim((string) (preg_replace('/\s+/', ' ', $namaFile) ?? $namaFile));

        $now = new \DateTimeImmutable('now');
        $created = $now->format('Y/m/d_H.i.s');
        $stamp = $now->format('Ymd_His');
        $trxDate = $now->format('Ymd');
        $recordCount = count($dataLines);

        $csvRows = [];
        $csvRows[] = $this->padRow([$created, (string) ($recordCount + 2), $namaFile], 20);
        $csvRows[] = $this->padRow(['P', $trxDate, $debit, (string) $recordCount, (string) $totalAmount], 20);
        foreach ($dataLines as $line) {
            $csvRows[] = $this->padRow($line, 20);
        }

        $body = '';
        foreach ($csvRows as $cols) {
            $body .= implode(',', $cols) . "\r\n";
        }

        $csvFilename = sprintf('%s_Online_%s.csv', preg_replace('/\s+/', '_', $namaFile) ?: 'belanja', $stamp);

        return [
            'body' => $body,
            'csv_filename' => $csvFilename,
            'nama_file' => $namaFile,
            'record_count' => $recordCount,
            'total_amount' => $totalAmount,
            'trx_date' => $trxDate,
            'belanja_ids' => $belanjaIds,
        ];
    }

    private function findMatchingWaitingBatch(int $count, int $amount, string $last3, ?string $emailDatetime): ?array
    {
        $sql = "SELECT * FROM bni_batch
                WHERE status = 'waiting'
                  AND export_type = 'bni_csv'
                  AND record_count = ?
                  AND total_amount = ?
                ORDER BY created_at DESC
                LIMIT 10";
        $stmt = $this->db->prepare($sql);
        $stmt->execute([$count, $amount]);
        $rows = $stmt->fetchAll() ?: [];
        if (!$rows) {
            return null;
        }

        $emailTs = $emailDatetime ? strtotime($emailDatetime) : false;

        foreach ($rows as $row) {
            $debit = (string) $row['debit_account'];
            if ($last3 !== '' && !str_ends_with($debit, $last3)) {
                continue;
            }
            if ($emailTs) {
                $createdTs = strtotime((string) $row['created_at']);
                // Batch harus dibuat sebelum/notifikasi, toleransi 5 menit; max umur 7 hari
                if ($createdTs && $createdTs > $emailTs + 300) {
                    continue;
                }
                if ($createdTs && ($emailTs - $createdTs) > 7 * 86400) {
                    continue;
                }
            }
            return $row;
        }

        // Jika last3 tidak cocok semua tapi count+amount unik, terima kandidat pertama
        if (count($rows) === 1) {
            return $rows[0];
        }
        return null;
    }

    /** @param list<int> $ids @return array<int,string> */
    private function itemNamesByBelanjaIds(array $ids): array
    {
        if (!$ids) {
            return [];
        }
        $placeholders = implode(',', array_fill(0, count($ids), '?'));
        $stmt = $this->db->prepare(
            "SELECT belanja_id, nama_barang FROM belanja_item WHERE belanja_id IN ($placeholders) ORDER BY id ASC"
        );
        $stmt->execute($ids);
        $map = [];
        while ($row = $stmt->fetch()) {
            $bid = (int) $row['belanja_id'];
            if (!isset($map[$bid])) {
                $map[$bid] = (string) $row['nama_barang'];
            }
        }
        return $map;
    }

    private function archiveDir(): string
    {
        $base = trim((string) ($_ENV['UPLOADS_PATH'] ?? ''));
        if ($base === '') {
            $base = dirname(__DIR__, 2) . DIRECTORY_SEPARATOR . 'uploads';
        }
        return rtrim($base, '/\\') . DIRECTORY_SEPARATOR . 'bni-batches';
    }

    private function formatRemark2(string $ymd): string
    {
        $ts = strtotime($ymd . ' 00:00:00');
        if ($ts === false) {
            return '';
        }
        $hari = ['MINGGU', 'SENIN', 'SELASA', 'RABU', 'KAMIS', 'JUMAT', 'SABTU'];
        $bulan = ['', 'JAN', 'FEB', 'MAR', 'APR', 'MEI', 'JUN', 'JUL', 'AGU', 'SEP', 'OKT', 'NOV', 'DES'];
        return $hari[(int) date('w', $ts)] . ' ' . (int) date('j', $ts) . ' ' . $bulan[(int) date('n', $ts)];
    }

    private function clip(string $value, int $max): string
    {
        $value = trim(preg_replace('/\s+/u', ' ', str_replace([',', ';', "\r", "\n", '"'], ' ', $value)) ?? '');
        if (function_exists('mb_substr')) {
            return mb_substr($value, 0, $max);
        }
        return substr($value, 0, $max);
    }

    /** @param list<string> $cols @return list<string> */
    private function padRow(array $cols, int $width): array
    {
        while (count($cols) < $width) {
            $cols[] = '';
        }
        return array_slice($cols, 0, $width);
    }

    private function emailAlreadyProcessed(string $messageId): bool
    {
        $stmt = $this->db->prepare('SELECT id FROM bni_email_log WHERE message_id = ? LIMIT 1');
        $stmt->execute([$messageId]);
        return (bool) $stmt->fetchColumn();
    }

    private function referenceAlreadyUsed(string $ref): bool
    {
        $stmt = $this->db->prepare('SELECT id FROM bni_batch WHERE bni_reference = ? LIMIT 1');
        $stmt->execute([$ref]);
        if ($stmt->fetchColumn()) {
            return true;
        }
        $stmt = $this->db->prepare('SELECT id FROM bni_email_log WHERE bni_reference = ? AND result = \'approved\' LIMIT 1');
        $stmt->execute([$ref]);
        return (bool) $stmt->fetchColumn();
    }

    private function logEmail(string $messageId, ?string $ref, string $result, ?string $detail): void
    {
        try {
            $stmt = $this->db->prepare(
                'INSERT INTO bni_email_log (message_id, bni_reference, result, detail)
                 VALUES (?, ?, ?, ?)
                 ON DUPLICATE KEY UPDATE result = VALUES(result), detail = VALUES(detail), bni_reference = VALUES(bni_reference)'
            );
            $stmt->execute([$messageId, $ref, $result, $detail !== null ? substr($detail, 0, 500) : null]);
        } catch (\Throwable $e) {
            error_log('bni_email_log: ' . $e->getMessage());
        }
    }

    private function imapBody($inbox, string $uid): string
    {
        $structure = imap_fetchstructure($inbox, $uid, FT_UID);
        if (!$structure) {
            return (string) imap_body($inbox, $uid, FT_UID);
        }
        $plain = $this->imapDecodePart($inbox, $uid, $structure, '');
        return $plain;
    }

    private function imapDecodePart($inbox, string $uid, object $structure, string $partNum): string
    {
        if (!empty($structure->parts) && is_array($structure->parts)) {
            $out = '';
            foreach ($structure->parts as $i => $part) {
                $num = $partNum === '' ? (string) ($i + 1) : $partNum . '.' . ($i + 1);
                $out .= $this->imapDecodePart($inbox, $uid, $part, $num);
            }
            return $out;
        }

        $data = $partNum === ''
            ? (string) imap_body($inbox, $uid, FT_UID)
            : (string) imap_fetchbody($inbox, $uid, $partNum, FT_UID);

        $encoding = (int) ($structure->encoding ?? 0);
        if ($encoding === 3) {
            $data = base64_decode($data, true) ?: $data;
        } elseif ($encoding === 4) {
            $data = quoted_printable_decode($data);
        }

        $subtype = strtoupper((string) ($structure->subtype ?? ''));
        if ($subtype === 'HTML' || $subtype === 'PLAIN' || $subtype === '') {
            return $data . "\n";
        }
        return '';
    }

    private function extractMessageId(string $header): ?string
    {
        if (preg_match('/^Message-ID:\s*(.+)$/im', $header, $m)) {
            return trim($m[1], " \t<>");
        }
        return null;
    }
}

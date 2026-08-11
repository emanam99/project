<?php

declare(strict_types=1);

namespace App\Services;

use App\Database;
use App\Helpers\LiveManageWaBulkBroadcastHelper;
use PDO;

/**
 * Antrian kirim WA massal Manage Data — diproses worker CLI dengan jeda acak 2–60 dtk antar pesan.
 */
final class ManageWaBulkService
{
    /** @var array<string, bool> */
    private static array $noTelponWaliChecked = [];

    public static function tableExists(PDO $db, string $table): bool
    {
        $t = preg_replace('/[^a-zA-Z0-9_]/', '', $table);
        if ($t === '') {
            return false;
        }
        try {
            $st = $db->query('SHOW TABLES LIKE ' . $db->quote($t));

            return $st !== false && $st->rowCount() > 0;
        } catch (\Throwable $e) {
            return false;
        }
    }

    public static function hasNoTelponWaliColumn(PDO $db): bool
    {
        $key = 'santri';
        if (isset(self::$noTelponWaliChecked[$key])) {
            return self::$noTelponWaliChecked[$key];
        }
        $ok = false;
        try {
            $ok = $db->query("SHOW COLUMNS FROM santri LIKE 'no_telpon_wali'")->rowCount() > 0;
        } catch (\Throwable $e) {
            $ok = false;
        }
        self::$noTelponWaliChecked[$key] = $ok;

        return $ok;
    }

    /**
     * Normalisasi angka ke bentuk 62… (tanpa +), kosong jika tidak layak.
     */
    public static function normalizeWaDigits(?string $raw): string
    {
        $d = preg_replace('/\D/', '', (string) $raw) ?? '';
        if ($d === '') {
            return '';
        }
        if ($d[0] === '0') {
            $d = '62' . substr($d, 1);
        } elseif (strpos($d, '62') !== 0) {
            $d = '62' . $d;
        }
        if (strlen($d) < 10) {
            return '';
        }

        return $d;
    }

    /**
     * @param list<int> $idSantriList
     * @param 'santri_primary'|'wali'|'both' $sendTo
     * @return array{items: list<array{id_santri:int,nis:?int,nama:?string,recipient_kind:string,nomor:string,sort_order:int}>, skipped: list<string>}
     */
    public static function buildItemsFromSantriIds(PDO $db, array $idSantriList, string $sendTo): array
    {
        $ids = array_values(array_unique(array_filter(array_map('intval', $idSantriList), static fn ($x) => $x > 0)));
        if ($ids === []) {
            return ['items' => [], 'skipped' => []];
        }
        $hasWaliCol = self::hasNoTelponWaliColumn($db);
        $cols = 'id, nis, nama, no_wa_santri, no_telpon';
        if ($hasWaliCol) {
            $cols .= ', no_telpon_wali';
        }
        $placeholders = implode(',', array_fill(0, count($ids), '?'));
        $stmt = $db->prepare("SELECT {$cols} FROM santri WHERE id IN ($placeholders)");
        $stmt->execute($ids);
        $byId = [];
        while (($row = $stmt->fetch(PDO::FETCH_ASSOC)) !== false) {
            $byId[(int) $row['id']] = $row;
        }

        $items = [];
        $skipped = [];
        $order = 0;
        foreach ($ids as $sid) {
            $row = $byId[$sid] ?? null;
            if ($row === null) {
                $skipped[] = "Santri id {$sid}: tidak ditemukan";

                continue;
            }
            $nama = isset($row['nama']) ? (string) $row['nama'] : '';
            $nis = isset($row['nis']) ? (int) $row['nis'] : null;

            $primaryRaw = trim((string) ($row['no_wa_santri'] ?? '')) !== ''
                ? trim((string) $row['no_wa_santri'])
                : trim((string) ($row['no_telpon'] ?? ''));
            $waliRaw = $hasWaliCol ? trim((string) ($row['no_telpon_wali'] ?? '')) : '';

            $primary = self::normalizeWaDigits($primaryRaw);
            $wali = self::normalizeWaDigits($waliRaw);

            $addPrimary = in_array($sendTo, ['santri_primary', 'both'], true) && $primary !== '';
            $addWali = in_array($sendTo, ['wali', 'both'], true) && $wali !== '';

            if (!$addPrimary && !$addWali) {
                $skipped[] = "Santri {$nama} (id {$sid}): tidak ada nomor untuk mode kirim";

                continue;
            }

            if ($addPrimary) {
                $items[] = [
                    'id_santri' => $sid,
                    'nis' => $nis,
                    'nama' => $nama,
                    'recipient_kind' => 'santri_primary',
                    'nomor' => $primary,
                    'sort_order' => $order++,
                ];
            }
            if ($addWali && $wali !== '') {
                // Hindari duplikat baris jika nomor wali = nomor utama
                if (!$addPrimary || $wali !== $primary) {
                    $items[] = [
                        'id_santri' => $sid,
                        'nis' => $nis,
                        'nama' => $nama,
                        'recipient_kind' => 'wali',
                        'nomor' => $wali,
                        'sort_order' => $order++,
                    ];
                }
            }
        }

        return ['items' => $items, 'skipped' => $skipped];
    }

    public static function spawnWorker(int $jobId): void
    {
        $jobId = (int) $jobId;
        if ($jobId <= 0) {
            return;
        }
        $script = dirname(__DIR__, 2) . DIRECTORY_SEPARATOR . 'scripts' . DIRECTORY_SEPARATOR . 'manage_wa_bulk_worker.php';
        if (!is_file($script)) {
            error_log('ManageWaBulkService: worker script tidak ada: ' . $script);

            return;
        }
        $php = PHP_BINARY;
        if (PHP_OS_FAMILY === 'Windows') {
            $cmd = sprintf('start /B "" %s %s %d', escapeshellarg($php), escapeshellarg($script), $jobId);
            @pclose(@popen($cmd, 'r'));
        } else {
            $cmd = sprintf('%s %s %d > /dev/null 2>&1 &', escapeshellarg($php), escapeshellarg($script), $jobId);
            @exec($cmd);
        }
    }

    /**
     * @param array<string, mixed> $jobRow
     */
    private static function broadcastFromJobRow(array $jobRow, string $phase, ?array $extra = null): void
    {
        $payload = [
            'phase' => $phase,
            'job_id' => (int) ($jobRow['id'] ?? 0),
            'page' => (string) ($jobRow['page'] ?? ''),
            'status' => (string) ($jobRow['status'] ?? ''),
            'total_items' => (int) ($jobRow['total_items'] ?? 0),
            'sent_ok' => (int) ($jobRow['sent_ok'] ?? 0),
            'sent_fail' => (int) ($jobRow['sent_fail'] ?? 0),
            'last_error' => $jobRow['last_error'] ?? null,
            'current_item_label' => $jobRow['current_item_label'] ?? null,
            'ts' => gmdate('c'),
        ];
        if ($extra !== null) {
            $payload = array_merge($payload, $extra);
        }
        LiveManageWaBulkBroadcastHelper::emit($payload);
    }

    public static function processJob(int $jobId): void
    {
        $jobId = (int) $jobId;
        if ($jobId <= 0) {
            return;
        }
        $db = Database::getInstance()->getConnection();
        if (!self::tableExists($db, 'manage_wa_bulk_job') || !self::tableExists($db, 'manage_wa_bulk_item')) {
            error_log('ManageWaBulkService: tabel job tidak ada');

            return;
        }

        $db->beginTransaction();
        try {
            $stLock = $db->prepare('SELECT * FROM manage_wa_bulk_job WHERE id = ? FOR UPDATE');
            $stLock->execute([$jobId]);
            $job = $stLock->fetch(PDO::FETCH_ASSOC);
            if ($job === false) {
                $db->rollBack();

                return;
            }
            if (($job['status'] ?? '') !== 'queued') {
                $db->rollBack();

                return;
            }
            $up = $db->prepare("UPDATE manage_wa_bulk_job SET status = 'running', updated_at = CURRENT_TIMESTAMP WHERE id = ?");
            $up->execute([$jobId]);
            $db->commit();
        } catch (\Throwable $e) {
            if ($db->inTransaction()) {
                $db->rollBack();
            }
            error_log('ManageWaBulkService::processJob lock: ' . $e->getMessage());

            return;
        }

        $job['status'] = 'running';
        self::broadcastFromJobRow($job, 'started');

        $instance = isset($job['wa_instance']) && trim((string) $job['wa_instance']) !== ''
            ? trim((string) $job['wa_instance'])
            : null;
        $messageText = (string) ($job['message_text'] ?? '');
        $page = (string) ($job['page'] ?? 'uwaba');

        $idPengurus = isset($job['id_pengurus_created']) ? (int) $job['id_pengurus_created'] : null;

        $stItems = $db->prepare('SELECT * FROM manage_wa_bulk_item WHERE job_id = ? AND status = ? ORDER BY sort_order ASC, id ASC');
        $stItems->execute([$jobId, 'pending']);
        $items = $stItems->fetchAll(PDO::FETCH_ASSOC);

        $processedIndex = 0;
        foreach ($items as $item) {
            $stCancel = $db->prepare('SELECT cancel_requested, status FROM manage_wa_bulk_job WHERE id = ?');
            $stCancel->execute([$jobId]);
            $rowJ = $stCancel->fetch(PDO::FETCH_ASSOC);
            if ($rowJ && !empty($rowJ['cancel_requested'])) {
                $db->prepare("UPDATE manage_wa_bulk_job SET status = 'cancelled', last_error = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
                    ->execute(['Dibatalkan pengguna', $jobId]);
                $job = array_merge($job, ['status' => 'cancelled', 'last_error' => 'Dibatalkan pengguna']);
                self::broadcastFromJobRow($job, 'cancelled');

                return;
            }

            if ($processedIndex > 0) {
                $delay = random_int(2, 60);
                sleep($delay);
            }
            ++$processedIndex;

            $itemId = (int) $item['id'];
            $idSantri = (int) $item['id_santri'];
            $nomor = (string) $item['nomor_tujuan'];
            $nama = (string) ($item['nama'] ?? '');
            $label = trim($nama . ' → ' . $nomor);
            $db->prepare('UPDATE manage_wa_bulk_job SET current_item_label = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')->execute([$label, $jobId]);
            $db->prepare("UPDATE manage_wa_bulk_item SET status = 'sending', updated_at = CURRENT_TIMESTAMP WHERE id = ?")->execute([$itemId]);

            $job['current_item_label'] = $label;
            self::broadcastFromJobRow($job, 'sending_item', ['item_id' => $itemId]);

            $logContext = [
                'id_santri' => $idSantri,
                'tujuan' => 'wali_santri',
                'id_pengurus_pengirim' => $idPengurus,
                'kategori' => 'custom',
                'sumber' => 'manage_data_bulk_' . $page,
            ];

            try {
                $res = WhatsAppService::sendMessage($nomor, $messageText, $instance, $logContext, null);
                $ok = !empty($res['success']);
                if ($ok) {
                    $db->prepare("UPDATE manage_wa_bulk_item SET status = 'sent', error_detail = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?")->execute([$itemId]);
                    $db->prepare('UPDATE manage_wa_bulk_job SET sent_ok = sent_ok + 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?')->execute([$jobId]);
                    $job['sent_ok'] = (int) ($job['sent_ok'] ?? 0) + 1;
                } else {
                    $err = (string) ($res['message'] ?? 'Gagal kirim');
                    $db->prepare('UPDATE manage_wa_bulk_item SET status = ?, error_detail = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
                        ->execute(['failed', mb_substr($err, 0, 500), $itemId]);
                    $db->prepare('UPDATE manage_wa_bulk_job SET sent_fail = sent_fail + 1, last_error = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
                        ->execute([mb_substr($err, 0, 500), $jobId]);
                    $job['sent_fail'] = (int) ($job['sent_fail'] ?? 0) + 1;
                    $job['last_error'] = $err;
                }
            } catch (\Throwable $e) {
                $err = $e->getMessage();
                $db->prepare('UPDATE manage_wa_bulk_item SET status = ?, error_detail = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
                    ->execute(['failed', mb_substr($err, 0, 500), $itemId]);
                $db->prepare('UPDATE manage_wa_bulk_job SET sent_fail = sent_fail + 1, last_error = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
                    ->execute([mb_substr($err, 0, 500), $jobId]);
                $job['sent_fail'] = (int) ($job['sent_fail'] ?? 0) + 1;
                $job['last_error'] = $err;
            }

            // Refresh counts from DB
            $stFresh = $db->prepare('SELECT sent_ok, sent_fail, last_error, current_item_label FROM manage_wa_bulk_job WHERE id = ?');
            $stFresh->execute([$jobId]);
            $fr = $stFresh->fetch(PDO::FETCH_ASSOC);
            if ($fr) {
                $job['sent_ok'] = (int) $fr['sent_ok'];
                $job['sent_fail'] = (int) $fr['sent_fail'];
                $job['last_error'] = $fr['last_error'];
                $job['current_item_label'] = $fr['current_item_label'];
            }

            self::broadcastFromJobRow($job, 'item_done', ['item_id' => $itemId]);
        }

        $db->prepare("UPDATE manage_wa_bulk_job SET status = 'done', current_item_label = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?")->execute([$jobId]);
        $job['status'] = 'done';
        $job['current_item_label'] = null;
        self::broadcastFromJobRow($job, 'finished');
    }
}

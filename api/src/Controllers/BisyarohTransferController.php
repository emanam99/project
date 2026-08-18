<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Database;
use App\Helpers\BisyarohKolomComputation;
use App\Helpers\BisyarohPengurusFormulaHelper;
use App\Helpers\BisyarohRekapSnapshotHelper;
use App\Helpers\BisyarohTransferHelper;
use App\Helpers\RoleHelper;
use PDO;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;
use Psr\Http\Message\UploadedFileInterface;

/**
 * API transfer Bank Jatim untuk Bisyaroh (export batch, upload mutasi, arsip, rilis per baris).
 */
final class BisyarohTransferController
{
    private PDO $db;

    public function __construct()
    {
        $this->db = Database::getInstance()->getConnection();
    }

    /** @return array<string, mixed> */
    private function userFromRequest(Request $request): array
    {
        $u = $request->getAttribute('user');

        return is_array($u) ? $u : [];
    }

    private function json(Response $response, array $data, int $code = 200): Response
    {
        $response->getBody()->write((string) json_encode($data, JSON_UNESCAPED_UNICODE));

        return $response->withHeader('Content-Type', 'application/json')->withStatus($code);
    }

    private function isSuper(array $user): bool
    {
        return !empty($user['is_real_super_admin']);
    }

    private function hasMenuOrHalaman(array $user): bool
    {
        return RoleHelper::tokenHasEbeddienFiturCode($this->db, $user, 'menu.bisyaroh')
            || RoleHelper::tokenHasEbeddienFiturCode($this->db, $user, 'action.bisyaroh.halaman');
    }

    private function canViewTabRekap(array $user): bool
    {
        if ($this->isSuper($user)) {
            return true;
        }
        $granular = RoleHelper::tokenUserHasAnyEbeddienFiturCodePrefix($this->db, $user, 'action.bisyaroh.tab.');
        if (!$granular) {
            return $this->hasMenuOrHalaman($user);
        }

        return RoleHelper::tokenHasEbeddienFiturCode($this->db, $user, 'action.bisyaroh.tab.rekap')
            || RoleHelper::tokenHasEbeddienFiturCode($this->db, $user, 'action.bisyaroh.halaman');
    }

    private function canViewTabRilis(array $user): bool
    {
        if ($this->isSuper($user)) {
            return true;
        }
        if (RoleHelper::tokenHasEbeddienFiturCode($this->db, $user, 'action.bisyaroh.tab.rilis')) {
            return true;
        }

        return $this->canViewTabRekap($user);
    }

    private function canUploadTransfer(array $user): bool
    {
        if ($this->isSuper($user)) {
            return true;
        }
        if (RoleHelper::tokenHasEbeddienFiturCode($this->db, $user, 'action.bisyaroh.transfer.upload')) {
            return true;
        }

        return RoleHelper::tokenHasEbeddienFiturCode($this->db, $user, 'action.bisyaroh.rekap.rilis')
            || $this->hasMenuOrHalaman($user);
    }

    private function canReconcileTransfer(array $user): bool
    {
        if ($this->isSuper($user)) {
            return true;
        }
        if (RoleHelper::tokenHasEbeddienFiturCode($this->db, $user, 'action.bisyaroh.transfer.reconcile')) {
            return true;
        }

        return RoleHelper::tokenHasEbeddienFiturCode($this->db, $user, 'action.bisyaroh.rekap.rilis')
            || $this->hasMenuOrHalaman($user);
    }

    private function tablesReady(): bool
    {
        return BisyarohTransferHelper::tableExists($this->db, 'bisyaroh___transfer_batch')
            && BisyarohTransferHelper::tableExists($this->db, 'bisyaroh___transfer_baris');
    }

    private function normalizeKalender(?string $raw): string
    {
        $v = strtolower(trim((string) $raw));

        return $v === 'hijriyah' ? 'hijriyah' : 'masehi';
    }

    /** @return list<string> */
    private function parseLembagaIds(mixed $raw): array
    {
        if (is_array($raw)) {
            $ids = $raw;
        } else {
            $ids = explode(',', (string) $raw);
        }
        $out = [];
        foreach ($ids as $id) {
            $t = trim((string) $id);
            if ($t !== '') {
                $out[] = $t;
            }
        }

        return array_values(array_unique($out));
    }

    private function lembagaNama(string $lembagaId): string
    {
        $stmt = $this->db->prepare('SELECT `nama` FROM `lembaga` WHERE `id` = ? LIMIT 1');
        $stmt->execute([$lembagaId]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);

        return is_array($row) ? trim((string) ($row['nama'] ?? '')) : '';
    }

    /** @return list<int> */
    private function bisyarohIdsForLembaga(string $lembagaId): array
    {
        $stmt = $this->db->prepare(
            'SELECT DISTINCT b.`id` FROM `bisyaroh` b
             LEFT JOIN `bisyaroh___lembaga` bl ON bl.`bisyaroh_id` = b.`id`
             WHERE b.`aktif` = 1 AND (
               bl.`lembaga_id` = ? OR TRIM(COALESCE(b.`lembaga_id`, \'\')) = ?
             )'
        );
        $stmt->execute([$lembagaId, $lembagaId]);
        $ids = [];
        while ($r = $stmt->fetch(PDO::FETCH_ASSOC)) {
            $id = (int) ($r['id'] ?? 0);
            if ($id > 0) {
                $ids[] = $id;
            }
        }

        return $ids;
    }

    private function statusLembaga(int $bisyarohId, string $lembagaId, string $periode, string $kalender): string
    {
        $stmt = $this->db->prepare(
            'SELECT `status` FROM `bisyaroh___rekap_status_lembaga`
             WHERE `bisyaroh_id` = ? AND `lembaga_id` = ? AND `periode_bulan` = ? AND `kalender` = ?
             LIMIT 1'
        );
        $stmt->execute([$bisyarohId, $lembagaId, $periode, $kalender]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);

        return is_array($row) ? (string) ($row['status'] ?? 'pengajuan') : 'pengajuan';
    }

    /**
     * @return list<array<string, mixed>>
     */
    private function collectExportMetaForLembaga(
        string $lembagaId,
        string $periode,
        string $kalender,
        ?array $disabledKeys
    ): array {
        $lembagaNama = $this->lembagaNama($lembagaId);
        $bids = $this->bisyarohIdsForLembaga($lembagaId);
        $meta = [];
        $hasTransfer = BisyarohTransferHelper::rekapHasTransferStatus($this->db);
        foreach ($bids as $bid) {
            $st = $this->statusLembaga($bid, $lembagaId, $periode, $kalender);
            if ($st !== 'ditinjau' && $st !== 'pengajuan' && $st !== 'rilis') {
                continue;
            }
            // Export target: prefer ditinjau; allow pengajuan only if explicitly needed — plan says ditinjau
            if ($st !== 'ditinjau') {
                continue;
            }
            $kolomDef = BisyarohRekapSnapshotHelper::loadKolomRowsSorted($this->db, $bid, true);
            if ($kolomDef === []) {
                continue;
            }
            $hasKal = true;
            try {
                $stmt = $this->db->prepare(
                    'SELECT r.`id`, r.`id_pengurus`, r.`nilai_json`, r.`catatan`'
                    . ($hasTransfer ? ', r.`transfer_status`' : '')
                    . ' FROM `bisyaroh___rekap_baris` r
                     WHERE r.`bisyaroh_id` = ? AND r.`periode_bulan` = ? AND r.`kalender` = ?'
                );
                $stmt->execute([$bid, $periode, $kalender]);
            } catch (\Throwable $e) {
                $stmt = $this->db->prepare(
                    'SELECT r.`id`, r.`id_pengurus`, r.`nilai_json`, r.`catatan`
                     FROM `bisyaroh___rekap_baris` r
                     WHERE r.`bisyaroh_id` = ? AND r.`periode_bulan` = ?'
                );
                $stmt->execute([$bid, $periode]);
                $hasKal = false;
            }
            $saved = $stmt->fetchAll(PDO::FETCH_ASSOC);
            $byPid = [];
            foreach (is_array($saved) ? $saved : [] as $s) {
                $byPid[(int) ($s['id_pengurus'] ?? 0)] = $s;
            }
            $pengurus = $this->loadPengurusForLembaga($lembagaId);
            foreach ($pengurus as $p) {
                $pid = (int) ($p['id'] ?? 0);
                if ($pid <= 0 || !isset($byPid[$pid])) {
                    continue;
                }
                if (is_array($disabledKeys) && in_array($bid . ':' . $pid, $disabledKeys, true)) {
                    continue;
                }
                $srow = $byPid[$pid];
                if ($hasTransfer && ($srow['transfer_status'] ?? '') === 'berhasil') {
                    continue;
                }
                $rawNilai = $srow['nilai_json'] ?? null;
                $inputs = BisyarohRekapSnapshotHelper::extractInputs($rawNilai);
                $fCtx = BisyarohPengurusFormulaHelper::loadFormulaContext($this->db, $pid, null, [$lembagaId]);
                $calc = BisyarohRekapSnapshotHelper::resolveCalc($kolomDef, $inputs, $fCtx, $rawNilai);
                $nominal = BisyarohTransferHelper::floorNominal($calc['total_nominal'] ?? 0);
                if ($nominal <= 0) {
                    continue;
                }
                $rekening = BisyarohTransferHelper::sanitizeRekening($p['rekening_jatim'] ?? '');
                if ($rekening === '') {
                    continue;
                }
                $nama = BisyarohTransferHelper::sanitizeNama($p['nama'] ?? '');
                if ($nama === '') {
                    continue;
                }
                $nip = preg_replace('/\D+/', '', (string) ($p['nip'] ?? '')) ?? '';
                $ket2 = BisyarohTransferHelper::formatKeterangan2($lembagaNama !== '' ? $lembagaNama : $lembagaId, $nip);
                if ($ket2 === '' || $nip === '') {
                    continue;
                }
                $meta[] = [
                    'rekening' => $rekening,
                    'nama' => $nama,
                    'nominal' => $nominal,
                    'nip' => $nip,
                    'lembaga_id' => $lembagaId,
                    'lembaga_nama' => $lembagaNama,
                    'keterangan_2' => $ket2,
                    'id_pengurus' => $pid,
                    'rekap_baris_id' => (int) ($srow['id'] ?? 0) ?: null,
                    'bisyaroh_id' => $bid,
                ];
            }
        }

        return $meta;
    }

    /** @return list<array<string, mixed>> */
    private function loadPengurusForLembaga(string $lembagaId): array
    {
        $pjAktif = '('
            . 'pj.`status` = \'aktif\' OR pj.`status` = \'active\''
            . ' OR pj.`status` IS NULL OR TRIM(COALESCE(pj.`status`, \'\')) = \'\''
            . ')';
        $jAktif = '(j.`status` = \'aktif\' OR j.`status` IS NULL)';
        $pAktif = '('
            . 'p.`status` IS NULL OR TRIM(COALESCE(p.`status`, \'\')) = \'\''
            . ' OR LOWER(TRIM(p.`status`)) IN (\'aktif\', \'active\')'
            . ')';
        $effLembaga = 'COALESCE(NULLIF(TRIM(pj.`lembaga_id`), \'\'), j.`lembaga_id`)';
        $stmt = $this->db->prepare(
            'SELECT DISTINCT p.`id`, p.`nip`, p.`nama`, p.`rekening_jatim`
             FROM `pengurus` p
             INNER JOIN `pengurus___jabatan` pj ON pj.`pengurus_id` = p.`id`
             INNER JOIN `jabatan` j ON j.`id` = pj.`jabatan_id`
             WHERE ' . $pAktif . '
               AND ' . $pjAktif . '
               AND ' . $jAktif . '
               AND ' . $effLembaga . ' = ?
             ORDER BY p.`nama` ASC'
        );
        $stmt->execute([$lembagaId]);
        $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

        return is_array($rows) ? $rows : [];
    }

    private function storeCsvFile(string $csv, string $prefix): array
    {
        $dir = BisyarohTransferHelper::storageDir();
        $sha = hash('sha256', $csv);
        $fileName = $prefix . '_' . date('Ymd_His') . '_' . substr($sha, 0, 12) . '.csv';
        $abs = $dir . DIRECTORY_SEPARATOR . $fileName;
        if (file_put_contents($abs, $csv) === false) {
            throw new \RuntimeException('Gagal menyimpan file CSV');
        }
        $rel = 'uploads/bisyaroh_transfer/' . $fileName;

        return [
            'file_name' => $fileName,
            'file_sha256' => $sha,
            'storage_path' => $rel,
            'file_size' => strlen($csv),
            'abs' => $abs,
        ];
    }

    /**
     * POST /api/bisyaroh/transfer/export-batch
     */
    public function exportBatch(Request $request, Response $response): Response
    {
        $user = $this->userFromRequest($request);
        if (!$this->canViewTabRekap($user) || !$this->canReconcileTransfer($user)) {
            return $this->json($response, ['success' => false, 'message' => 'Akses ditolak'], 403);
        }
        if (!$this->tablesReady()) {
            return $this->json($response, ['success' => false, 'message' => 'Migrasi transfer belum dijalankan'], 503);
        }
        $body = $request->getParsedBody();
        $body = is_array($body) ? $body : [];
        $periode = trim((string) ($body['periode_bulan'] ?? ''));
        if ($periode === '' || !preg_match('/^\d{4}-\d{2}$/', $periode)) {
            return $this->json($response, ['success' => false, 'message' => 'periode_bulan wajib (YYYY-MM)'], 400);
        }
        $kalender = $this->normalizeKalender($body['kalender'] ?? null);
        $lembagaIds = $this->parseLembagaIds($body['lembaga_ids'] ?? []);
        if ($lembagaIds === []) {
            return $this->json($response, ['success' => false, 'message' => 'lembaga_ids wajib'], 400);
        }
        $disabled = $body['disabled_keys'] ?? [];
        $disabled = is_array($disabled) ? array_map('strval', $disabled) : [];
        $onlyFailedFromBatch = isset($body['retry_failed_batch_id']) ? (int) $body['retry_failed_batch_id'] : 0;

        $metaRows = [];
        try {
            if ($onlyFailedFromBatch > 0) {
                $stmt = $this->db->prepare(
                    'SELECT `rekening`, `nama`, `nominal`, `nip`, `lembaga_id`, `keterangan_2`, `id_pengurus`, `rekap_baris_id`, `bisyaroh_id`
                     FROM `bisyaroh___transfer_baris`
                     WHERE `batch_id` = ? AND `transfer_status` = \'gagal\'
                     ORDER BY `line_no` ASC'
                );
                $stmt->execute([$onlyFailedFromBatch]);
                $failed = $stmt->fetchAll(PDO::FETCH_ASSOC);
                foreach (is_array($failed) ? $failed : [] as $f) {
                    $lid = trim((string) ($f['lembaga_id'] ?? ''));
                    $metaRows[] = [
                        'rekening' => (string) ($f['rekening'] ?? ''),
                        'nama' => (string) ($f['nama'] ?? ''),
                        'nominal' => (int) ($f['nominal'] ?? 0),
                        'nip' => (string) ($f['nip'] ?? ''),
                        'lembaga_id' => $lid,
                        'lembaga_nama' => $this->lembagaNama($lid),
                        'keterangan_2' => (string) ($f['keterangan_2'] ?? ''),
                        'id_pengurus' => isset($f['id_pengurus']) ? (int) $f['id_pengurus'] : null,
                        'rekap_baris_id' => isset($f['rekap_baris_id']) ? (int) $f['rekap_baris_id'] : null,
                        'bisyaroh_id' => isset($f['bisyaroh_id']) ? (int) $f['bisyaroh_id'] : null,
                    ];
                }
            } else {
                foreach ($lembagaIds as $lid) {
                    $metaRows = array_merge(
                        $metaRows,
                        $this->collectExportMetaForLembaga($lid, $periode, $kalender, $disabled)
                    );
                }
            }
        } catch (\Throwable $e) {
            error_log('BisyarohTransferController::exportBatch collect: ' . $e->getMessage());

            return $this->json($response, [
                'success' => false,
                'message' => 'Gagal menyusun data ekspor: ' . $e->getMessage(),
            ], 500);
        }

        if ($metaRows === []) {
            return $this->json($response, [
                'success' => false,
                'message' => 'Tidak ada baris siap ekspor (butuh status ditinjau, rekening, NIP, nominal > 0)',
            ], 400);
        }

        $dryRun = !empty($body['dry_run']) || !empty($body['preview']);
        if ($dryRun) {
            $byLembaga = [];
            foreach ($metaRows as $m) {
                $lid = (string) ($m['lembaga_id'] ?? '');
                if (!isset($byLembaga[$lid])) {
                    $byLembaga[$lid] = [
                        'lembaga_id' => $lid,
                        'lembaga_nama' => (string) ($m['lembaga_nama'] ?? ''),
                        'row_count' => 0,
                        'total_nominal' => 0,
                    ];
                }
                $byLembaga[$lid]['row_count']++;
                $byLembaga[$lid]['total_nominal'] += (int) ($m['nominal'] ?? 0);
            }
            $items = array_values($byLembaga);
            $rowCount = 0;
            $totalNominal = 0;
            foreach ($items as $it) {
                $rowCount += (int) $it['row_count'];
                $totalNominal += (int) $it['total_nominal'];
            }

            return $this->json($response, [
                'success' => true,
                'data' => [
                    'preview' => true,
                    'items' => $items,
                    'row_count' => $rowCount,
                    'total_nominal' => $totalNominal,
                ],
            ]);
        }

        $built = BisyarohTransferHelper::buildExportCsv($metaRows);
        $actor = RoleHelper::getPengurusIdFromPayload($user) ?? 0;
        try {
            $this->db->beginTransaction();
            $file = $this->storeCsvFile($built['csv'], 'export');
            // Idempotency: same sha returns existing
            $chk = $this->db->prepare(
                'SELECT `id` FROM `bisyaroh___transfer_batch` WHERE `jenis` = ? AND `file_sha256` = ? LIMIT 1'
            );
            $chk->execute([BisyarohTransferHelper::JENIS_EXPORT, $file['file_sha256']]);
            $existId = (int) $chk->fetchColumn();
            if ($existId > 0) {
                $this->db->rollBack();
                @unlink($file['abs']);
                $stmt = $this->db->prepare('SELECT * FROM `bisyaroh___transfer_batch` WHERE `id` = ? LIMIT 1');
                $stmt->execute([$existId]);
                $batch = $stmt->fetch(PDO::FETCH_ASSOC);

                return $this->json($response, [
                    'success' => true,
                    'message' => 'Batch export sudah ada (file sama)',
                    'data' => [
                        'batch' => $batch,
                        'csv_text' => $built['csv'],
                        'row_count' => $built['row_count'],
                        'total_nominal' => $built['total_nominal'],
                        'reused' => true,
                    ],
                ]);
            }

            $ins = $this->db->prepare(
                'INSERT INTO `bisyaroh___transfer_batch`
                 (`jenis`, `periode_bulan`, `kalender`, `source_account`, `file_name`, `file_sha256`, `storage_path`,
                  `file_size`, `row_count`, `total_nominal`, `lembaga_ids_json`, `status`, `uploaded_by_pengurus_id`)
                 VALUES (?,?,?,?,?,?,?,?,?,?,?,\'exported\',?)'
            );
            $ins->execute([
                BisyarohTransferHelper::JENIS_EXPORT,
                $periode,
                $kalender,
                BisyarohTransferHelper::DEFAULT_SOURCE,
                $file['file_name'],
                $file['file_sha256'],
                $file['storage_path'],
                $file['file_size'],
                $built['row_count'],
                $built['total_nominal'],
                json_encode(array_values(array_unique(array_column($metaRows, 'lembaga_id'))), JSON_UNESCAPED_UNICODE),
                $actor > 0 ? $actor : null,
            ]);
            $batchId = (int) $this->db->lastInsertId();
            $insRow = $this->db->prepare(
                'INSERT INTO `bisyaroh___transfer_baris`
                 (`batch_id`, `line_no`, `rekening`, `nama`, `nominal`, `nip`, `lembaga_id`, `keterangan_2`,
                  `bisyaroh_id`, `id_pengurus`, `rekap_baris_id`, `match_status`, `transfer_status`, `raw_json`)
                 VALUES (?,?,?,?,?,?,?,?,?,?,?,\'pending\',\'pending\',?)'
            );
            $line = 0;
            foreach ($metaRows as $m) {
                ++$line;
                $insRow->execute([
                    $batchId,
                    $line,
                    $m['rekening'],
                    $m['nama'],
                    $m['nominal'],
                    $m['nip'],
                    $m['lembaga_id'],
                    $m['keterangan_2'],
                    $m['bisyaroh_id'],
                    $m['id_pengurus'],
                    $m['rekap_baris_id'],
                    json_encode($m, JSON_UNESCAPED_UNICODE),
                ]);
            }
            $this->db->commit();
        } catch (\Throwable $e) {
            if ($this->db->inTransaction()) {
                $this->db->rollBack();
            }
            error_log('BisyarohTransferController::exportBatch ' . $e->getMessage());

            return $this->json($response, ['success' => false, 'message' => 'Gagal membuat batch export'], 500);
        }

        return $this->json($response, [
            'success' => true,
            'message' => 'Batch export dibuat',
            'data' => [
                'batch_id' => $batchId,
                'csv_text' => $built['csv'],
                'file_name' => $file['file_name'],
                'row_count' => $built['row_count'],
                'total_nominal' => $built['total_nominal'],
            ],
        ], 201);
    }

    /**
     * POST /api/bisyaroh/transfer/upload-mutasi (multipart: file + export_batch_id)
     */
    public function uploadMutasi(Request $request, Response $response): Response
    {
        $user = $this->userFromRequest($request);
        if (!$this->canUploadTransfer($user)) {
            return $this->json($response, ['success' => false, 'message' => 'Akses upload ditolak'], 403);
        }
        if (!$this->tablesReady()) {
            return $this->json($response, ['success' => false, 'message' => 'Migrasi transfer belum dijalankan'], 503);
        }
        $body = $request->getParsedBody();
        $body = is_array($body) ? $body : [];
        $exportBatchId = (int) ($body['export_batch_id'] ?? 0);
        if ($exportBatchId <= 0) {
            return $this->json($response, ['success' => false, 'message' => 'export_batch_id wajib'], 400);
        }
        $stmt = $this->db->prepare(
            'SELECT * FROM `bisyaroh___transfer_batch` WHERE `id` = ? AND `jenis` = ? LIMIT 1'
        );
        $stmt->execute([$exportBatchId, BisyarohTransferHelper::JENIS_EXPORT]);
        $exportBatch = $stmt->fetch(PDO::FETCH_ASSOC);
        if (!is_array($exportBatch)) {
            return $this->json($response, ['success' => false, 'message' => 'Batch export tidak ditemukan'], 404);
        }

        $files = $request->getUploadedFiles();
        /** @var UploadedFileInterface|null $upload */
        $upload = $files['file'] ?? ($files['csv'] ?? null);
        if (!$upload instanceof UploadedFileInterface || $upload->getError() !== UPLOAD_ERR_OK) {
            return $this->json($response, ['success' => false, 'message' => 'File CSV mutasi wajib diunggah'], 400);
        }
        $clientName = (string) $upload->getClientFilename();
        if (!preg_match('/\.csv$/i', $clientName)) {
            return $this->json($response, ['success' => false, 'message' => 'Hanya file .csv yang diizinkan'], 400);
        }
        if ($upload->getSize() > 5 * 1024 * 1024) {
            return $this->json($response, ['success' => false, 'message' => 'Ukuran file maksimal 5 MB'], 400);
        }
        $content = (string) $upload->getStream()->getContents();
        try {
            $mutasiRows = BisyarohTransferHelper::parseMutasiCsv($content);
        } catch (\InvalidArgumentException $e) {
            return $this->json($response, ['success' => false, 'message' => $e->getMessage()], 400);
        }
        if ($mutasiRows === []) {
            return $this->json($response, ['success' => false, 'message' => 'Tidak ada baris Bisyaroh di file mutasi'], 400);
        }

        $sha = hash('sha256', $content);
        $chk = $this->db->prepare(
            'SELECT `id` FROM `bisyaroh___transfer_batch` WHERE `jenis` = ? AND `file_sha256` = ? LIMIT 1'
        );
        $chk->execute([BisyarohTransferHelper::JENIS_MUTASI, $sha]);
        $existId = (int) $chk->fetchColumn();
        if ($existId > 0) {
            return $this->json($response, [
                'success' => true,
                'message' => 'File mutasi sudah pernah diunggah',
                'data' => ['batch_id' => $existId, 'reused' => true],
            ]);
        }

        $stmt = $this->db->prepare(
            'SELECT * FROM `bisyaroh___transfer_baris` WHERE `batch_id` = ? ORDER BY `line_no` ASC'
        );
        $stmt->execute([$exportBatchId]);
        $exportRows = $stmt->fetchAll(PDO::FETCH_ASSOC);
        $recon = BisyarohTransferHelper::reconcileExportAgainstMutasi(
            is_array($exportRows) ? $exportRows : [],
            $mutasiRows
        );

        $actor = RoleHelper::getPengurusIdFromPayload($user) ?? 0;
        $periode = (string) ($exportBatch['periode_bulan'] ?? '');
        $kalender = (string) ($exportBatch['kalender'] ?? 'masehi');
        $totalNominal = array_sum(array_map(static fn ($m) => (int) ($m['nominal'] ?? 0), $mutasiRows));

        try {
            $this->db->beginTransaction();
            $dir = BisyarohTransferHelper::storageDir();
            $fileName = 'mutasi_' . date('Ymd_His') . '_' . substr($sha, 0, 12) . '.csv';
            $abs = $dir . DIRECTORY_SEPARATOR . $fileName;
            file_put_contents($abs, $content);
            $rel = 'uploads/bisyaroh_transfer/' . $fileName;

            $ins = $this->db->prepare(
                'INSERT INTO `bisyaroh___transfer_batch`
                 (`jenis`, `periode_bulan`, `kalender`, `source_account`, `file_name`, `file_sha256`, `storage_path`,
                  `file_size`, `row_count`, `total_nominal`, `lembaga_ids_json`, `matched_export_batch_id`,
                  `status`, `summary_json`, `uploaded_by_pengurus_id`)
                 VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)'
            );
            $status = $recon['gagal'] === 0 ? 'done' : ($recon['matched'] > 0 ? 'partial' : 'failed');
            $summary = [
                'matched' => $recon['matched'],
                'gagal' => $recon['gagal'],
                'mutasi_rows' => count($mutasiRows),
            ];
            $ins->execute([
                BisyarohTransferHelper::JENIS_MUTASI,
                $periode,
                $kalender,
                $exportBatch['source_account'] ?? BisyarohTransferHelper::DEFAULT_SOURCE,
                $clientName !== '' ? $clientName : $fileName,
                $sha,
                $rel,
                strlen($content),
                count($mutasiRows),
                $totalNominal,
                $exportBatch['lembaga_ids_json'] ?? null,
                $exportBatchId,
                $status,
                json_encode($summary, JSON_UNESCAPED_UNICODE),
                $actor > 0 ? $actor : null,
            ]);
            $mutasiBatchId = (int) $this->db->lastInsertId();

            $insMutasi = $this->db->prepare(
                'INSERT INTO `bisyaroh___transfer_baris`
                 (`batch_id`, `line_no`, `rekening`, `nama`, `nominal`, `bank_ref`, `match_status`, `transfer_status`, `raw_json`)
                 VALUES (?,?,?,?,?,?,\'pending\',\'pending\',?)'
            );
            foreach ($mutasiRows as $m) {
                $insMutasi->execute([
                    $mutasiBatchId,
                    $m['line_no'],
                    $m['rekening'],
                    $m['nama'],
                    $m['nominal'],
                    $m['bank_ref'],
                    json_encode($m['raw'], JSON_UNESCAPED_UNICODE),
                ]);
            }

            $updEx = $this->db->prepare(
                'UPDATE `bisyaroh___transfer_baris`
                 SET `match_status` = ?, `transfer_status` = ?, `bank_ref` = ?, `last_error` = ?,
                     `processed_at` = CURRENT_TIMESTAMP, `attempt_count` = `attempt_count` + 1
                 WHERE `id` = ? LIMIT 1'
            );
            foreach ($recon['details'] as $d) {
                $exId = (int) ($d['export_baris_id'] ?? 0);
                if ($exId <= 0) {
                    continue;
                }
                $updEx->execute([
                    $d['match_status'] ?? 'unmatched',
                    $d['transfer_status'] ?? 'gagal',
                    $d['bank_ref'] ?? null,
                    $d['last_error'] ?? null,
                    $exId,
                ]);
                if (($d['transfer_status'] ?? '') === 'berhasil' && !empty($d['rekap_baris_id'])) {
                    BisyarohTransferHelper::markRekapBarisBerhasil(
                        $this->db,
                        (int) $d['rekap_baris_id'],
                        $d['lembaga_id'] ?? null,
                        $periode,
                        $kalender,
                        $actor
                    );
                } elseif (($d['transfer_status'] ?? '') === 'gagal' && !empty($d['rekap_baris_id'])
                    && BisyarohTransferHelper::rekapHasTransferStatus($this->db)) {
                    $g = $this->db->prepare(
                        'UPDATE `bisyaroh___rekap_baris` SET `transfer_status` = \'gagal\'
                         WHERE `id` = ? AND (`transfer_status` IS NULL OR `transfer_status` <> \'berhasil\') LIMIT 1'
                    );
                    $g->execute([(int) $d['rekap_baris_id']]);
                }
            }

            $this->db->prepare(
                'UPDATE `bisyaroh___transfer_batch` SET `status` = ?, `summary_json` = ? WHERE `id` = ?'
            )->execute([
                $status === 'done' ? 'done' : 'partial',
                json_encode($summary, JSON_UNESCAPED_UNICODE),
                $exportBatchId,
            ]);

            $this->db->commit();
        } catch (\Throwable $e) {
            if ($this->db->inTransaction()) {
                $this->db->rollBack();
            }
            error_log('BisyarohTransferController::uploadMutasi ' . $e->getMessage());

            return $this->json($response, ['success' => false, 'message' => 'Gagal memproses mutasi'], 500);
        }

        return $this->json($response, [
            'success' => true,
            'message' => 'Mutasi diproses',
            'data' => [
                'mutasi_batch_id' => $mutasiBatchId,
                'export_batch_id' => $exportBatchId,
                'matched' => $recon['matched'],
                'gagal' => $recon['gagal'],
                'status' => $status,
            ],
        ], 201);
    }

    /** GET /api/bisyaroh/transfer/batches */
    public function listBatches(Request $request, Response $response): Response
    {
        $user = $this->userFromRequest($request);
        if (!$this->canViewTabRilis($user)) {
            return $this->json($response, ['success' => false, 'message' => 'Akses ditolak'], 403);
        }
        if (!$this->tablesReady()) {
            return $this->json($response, [
                'success' => true,
                'data' => ['items' => [], 'total' => 0, 'has_more' => false, 'limit' => 50, 'offset' => 0],
                'ready' => false,
            ]);
        }
        $q = $request->getQueryParams();
        $jenis = trim((string) ($q['jenis'] ?? ''));
        $periode = trim((string) ($q['periode_bulan'] ?? ''));
        $kalenderRaw = strtolower(trim((string) ($q['kalender'] ?? '')));
        $kalenderFilter = ($kalenderRaw === 'masehi' || $kalenderRaw === 'hijriyah') ? $kalenderRaw : '';
        $limit = (int) ($q['limit'] ?? 50);
        if ($limit < 1) {
            $limit = 50;
        }
        if ($limit > 200) {
            $limit = 200;
        }
        $offset = (int) ($q['offset'] ?? 0);
        if ($offset < 0) {
            $offset = 0;
        }

        $where = ' WHERE 1=1';
        $bind = [];
        if ($jenis === BisyarohTransferHelper::JENIS_EXPORT || $jenis === BisyarohTransferHelper::JENIS_MUTASI) {
            $where .= ' AND b.`jenis` = ?';
            $bind[] = $jenis;
        }
        if ($periode !== '' && preg_match('/^\d{4}-\d{2}$/', $periode)) {
            $where .= ' AND b.`periode_bulan` = ?';
            $bind[] = $periode;
        }
        if ($kalenderFilter !== '') {
            $where .= ' AND b.`kalender` = ?';
            $bind[] = $kalenderFilter;
        }

        $countSql = 'SELECT COUNT(*) FROM `bisyaroh___transfer_batch` b' . $where;
        $countStmt = $this->db->prepare($countSql);
        $countStmt->execute($bind);
        $total = (int) $countStmt->fetchColumn();

        $sql = 'SELECT b.*, p.`nama` AS `uploader_nama`
                FROM `bisyaroh___transfer_batch` b
                LEFT JOIN `pengurus` p ON p.`id` = b.`uploaded_by_pengurus_id`'
            . $where
            . ' ORDER BY b.`created_at` DESC, b.`id` DESC LIMIT ' . $limit . ' OFFSET ' . $offset;
        $stmt = $this->db->prepare($sql);
        $stmt->execute($bind);
        $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
        $items = is_array($rows) ? $rows : [];
        $hasMore = ($offset + count($items)) < $total;

        return $this->json($response, [
            'success' => true,
            'ready' => true,
            'data' => [
                'items' => $items,
                'total' => $total,
                'has_more' => $hasMore,
                'limit' => $limit,
                'offset' => $offset,
            ],
        ]);
    }

    /** GET /api/bisyaroh/transfer/batches/{id} */
    public function showBatch(Request $request, Response $response, array $args): Response
    {
        $user = $this->userFromRequest($request);
        if (!$this->canViewTabRilis($user)) {
            return $this->json($response, ['success' => false, 'message' => 'Akses ditolak'], 403);
        }
        $id = (int) ($args['id'] ?? 0);
        $stmt = $this->db->prepare(
            'SELECT b.*, p.`nama` AS `uploader_nama`
             FROM `bisyaroh___transfer_batch` b
             LEFT JOIN `pengurus` p ON p.`id` = b.`uploaded_by_pengurus_id`
             WHERE b.`id` = ? LIMIT 1'
        );
        $stmt->execute([$id]);
        $batch = $stmt->fetch(PDO::FETCH_ASSOC);
        if (!is_array($batch)) {
            return $this->json($response, ['success' => false, 'message' => 'Batch tidak ditemukan'], 404);
        }
        $sum = $this->db->prepare(
            'SELECT
                SUM(CASE WHEN `transfer_status` = \'berhasil\' THEN 1 ELSE 0 END) AS berhasil,
                SUM(CASE WHEN `transfer_status` = \'gagal\' THEN 1 ELSE 0 END) AS gagal,
                SUM(CASE WHEN `transfer_status` = \'pending\' THEN 1 ELSE 0 END) AS pending,
                COUNT(*) AS total
             FROM `bisyaroh___transfer_baris` WHERE `batch_id` = ?'
        );
        $sum->execute([$id]);
        $counts = $sum->fetch(PDO::FETCH_ASSOC) ?: [];

        return $this->json($response, [
            'success' => true,
            'data' => [
                'batch' => $batch,
                'counts' => [
                    'berhasil' => (int) ($counts['berhasil'] ?? 0),
                    'gagal' => (int) ($counts['gagal'] ?? 0),
                    'pending' => (int) ($counts['pending'] ?? 0),
                    'total' => (int) ($counts['total'] ?? 0),
                ],
            ],
        ]);
    }

    /** GET /api/bisyaroh/transfer/batches/{id}/rows */
    public function listBatchRows(Request $request, Response $response, array $args): Response
    {
        $user = $this->userFromRequest($request);
        if (!$this->canViewTabRilis($user)) {
            return $this->json($response, ['success' => false, 'message' => 'Akses ditolak'], 403);
        }
        $id = (int) ($args['id'] ?? 0);
        $q = $request->getQueryParams();
        $status = trim((string) ($q['transfer_status'] ?? ''));
        $sql = 'SELECT * FROM `bisyaroh___transfer_baris` WHERE `batch_id` = ?';
        $bind = [$id];
        if (in_array($status, ['pending', 'berhasil', 'gagal'], true)) {
            $sql .= ' AND `transfer_status` = ?';
            $bind[] = $status;
        }
        $sql .= ' ORDER BY `line_no` ASC';
        $stmt = $this->db->prepare($sql);
        $stmt->execute($bind);
        $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

        return $this->json($response, [
            'success' => true,
            'data' => ['items' => is_array($rows) ? $rows : []],
        ]);
    }

    /**
     * POST /api/bisyaroh/transfer/rilis-manual
     * Body: rekap_baris_id | transfer_baris_id
     */
    public function rilisManual(Request $request, Response $response): Response
    {
        $user = $this->userFromRequest($request);
        if (!$this->canReconcileTransfer($user)) {
            return $this->json($response, ['success' => false, 'message' => 'Akses rilis ditolak'], 403);
        }
        if (!BisyarohTransferHelper::rekapHasTransferStatus($this->db)) {
            return $this->json($response, ['success' => false, 'message' => 'Migrasi transfer belum dijalankan'], 503);
        }
        $body = $request->getParsedBody();
        $body = is_array($body) ? $body : [];
        $rekapBarisId = (int) ($body['rekap_baris_id'] ?? 0);
        $transferBarisId = (int) ($body['transfer_baris_id'] ?? 0);
        $periode = trim((string) ($body['periode_bulan'] ?? ''));
        $kalender = $this->normalizeKalender($body['kalender'] ?? null);
        $lembagaId = trim((string) ($body['lembaga_id'] ?? ''));

        if ($transferBarisId > 0) {
            $stmt = $this->db->prepare('SELECT * FROM `bisyaroh___transfer_baris` WHERE `id` = ? LIMIT 1');
            $stmt->execute([$transferBarisId]);
            $tb = $stmt->fetch(PDO::FETCH_ASSOC);
            if (!is_array($tb)) {
                return $this->json($response, ['success' => false, 'message' => 'Baris transfer tidak ditemukan'], 404);
            }
            $rekapBarisId = (int) ($tb['rekap_baris_id'] ?? 0);
            $lembagaId = $lembagaId !== '' ? $lembagaId : trim((string) ($tb['lembaga_id'] ?? ''));
            $bstmt = $this->db->prepare('SELECT `periode_bulan`, `kalender` FROM `bisyaroh___transfer_batch` WHERE `id` = ?');
            $bstmt->execute([(int) $tb['batch_id']]);
            $b = $bstmt->fetch(PDO::FETCH_ASSOC);
            if (is_array($b)) {
                $periode = $periode !== '' ? $periode : (string) ($b['periode_bulan'] ?? '');
                $kalender = $this->normalizeKalender($b['kalender'] ?? $kalender);
            }
        }

        if ($rekapBarisId <= 0) {
            return $this->json($response, ['success' => false, 'message' => 'rekap_baris_id wajib'], 400);
        }
        if ($periode === '' || !preg_match('/^\d{4}-\d{2}$/', $periode)) {
            $stmt = $this->db->prepare('SELECT `periode_bulan`, `kalender` FROM `bisyaroh___rekap_baris` WHERE `id` = ?');
            $stmt->execute([$rekapBarisId]);
            $rb = $stmt->fetch(PDO::FETCH_ASSOC);
            if (is_array($rb)) {
                $periode = (string) ($rb['periode_bulan'] ?? '');
                $kalender = $this->normalizeKalender($rb['kalender'] ?? $kalender);
            }
        }
        $actor = RoleHelper::getPengurusIdFromPayload($user) ?? 0;
        $res = BisyarohTransferHelper::markRekapBarisBerhasil(
            $this->db,
            $rekapBarisId,
            $lembagaId !== '' ? $lembagaId : null,
            $periode,
            $kalender,
            $actor
        );
        if (!$res['ok']) {
            return $this->json($response, ['success' => false, 'message' => $res['message'] ?? 'Gagal'], 400);
        }
        if ($transferBarisId > 0) {
            $this->db->prepare(
                'UPDATE `bisyaroh___transfer_baris`
                 SET `transfer_status` = \'berhasil\', `match_status` = \'matched\', `processed_at` = CURRENT_TIMESTAMP
                 WHERE `id` = ? LIMIT 1'
            )->execute([$transferBarisId]);
        }

        return $this->json($response, [
            'success' => true,
            'message' => 'Transfer ditandai berhasil',
            'data' => ['rekap_baris_id' => $rekapBarisId, 'potong' => $res['potong'] ?? null],
        ]);
    }

    /** POST /api/bisyaroh/transfer/export-retry-failed — alias exportBatch dengan retry_failed_batch_id */
    public function exportRetryFailed(Request $request, Response $response): Response
    {
        $body = $request->getParsedBody();
        $body = is_array($body) ? $body : [];
        if (empty($body['retry_failed_batch_id'])) {
            return $this->json($response, ['success' => false, 'message' => 'retry_failed_batch_id wajib'], 400);
        }
        $stmt = $this->db->prepare('SELECT * FROM `bisyaroh___transfer_batch` WHERE `id` = ? LIMIT 1');
        $stmt->execute([(int) $body['retry_failed_batch_id']]);
        $batch = $stmt->fetch(PDO::FETCH_ASSOC);
        if (!is_array($batch)) {
            return $this->json($response, ['success' => false, 'message' => 'Batch tidak ditemukan'], 404);
        }
        $lembagaIds = [];
        if (!empty($batch['lembaga_ids_json'])) {
            $dec = json_decode((string) $batch['lembaga_ids_json'], true);
            if (is_array($dec)) {
                $lembagaIds = $dec;
            }
        }
        $request = $request->withParsedBody([
            'periode_bulan' => $batch['periode_bulan'],
            'kalender' => $batch['kalender'],
            'lembaga_ids' => $lembagaIds,
            'retry_failed_batch_id' => (int) $batch['id'],
        ]);

        return $this->exportBatch($request, $response);
    }
}

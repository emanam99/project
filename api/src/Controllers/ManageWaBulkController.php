<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Helpers\RoleHelper;
use App\Services\ManageWaBulkService;
use PDO;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;

final class ManageWaBulkController
{
    /** @var \PDO */
    private $db;

    public function __construct()
    {
        $this->db = \App\Database::getInstance()->getConnection();
    }

    /**
     * GET /api/dashboard/manage-data/wa-bulk/active?page=uwaba|khusus|tunggakan
     */
    public function getActive(Request $request, Response $response): Response
    {
        $page = trim((string) ($request->getQueryParams()['page'] ?? ''));
        if (!in_array($page, ['uwaba', 'khusus', 'tunggakan'], true)) {
            return $this->json($response, ['success' => false, 'message' => 'Parameter page tidak valid'], 400);
        }
        if (!$this->tablesReady()) {
            return $this->json($response, ['success' => true, 'job' => null], 200);
        }
        $sql = "SELECT id, page, status, message_text, wa_instance, users_id_created, id_pengurus_created,
                total_items, sent_ok, sent_fail, cancel_requested, last_error, current_item_label,
                created_at, updated_at
                FROM manage_wa_bulk_job
                WHERE page = ? AND status IN ('queued','running')
                ORDER BY id DESC LIMIT 1";
        $st = $this->db->prepare($sql);
        $st->execute([$page]);
        $row = $st->fetch(PDO::FETCH_ASSOC);

        return $this->json($response, ['success' => true, 'job' => $row ?: null], 200);
    }

    /**
     * POST /api/dashboard/manage-data/wa-bulk/start
     * Body: { page, id_santri: number[], pesan: string, send_to?: santri_primary|wali|both, wa_instance?: string }
     */
    public function postStart(Request $request, Response $response): Response
    {
        $user = $request->getAttribute('user');
        if (!is_array($user)) {
            return $this->json($response, ['success' => false, 'message' => 'Tidak terautentikasi'], 401);
        }
        $usersId = isset($user['users_id']) ? (int) $user['users_id'] : 0;
        if ($usersId <= 0 && isset($user['user_id'])) {
            $usersId = (int) $user['user_id'];
        }
        $idPengurus = RoleHelper::getPengurusIdFromPayload($user);
        $body = $request->getParsedBody();
        if (!is_array($body)) {
            $body = [];
        }
        $page = trim((string) ($body['page'] ?? ''));
        if (!in_array($page, ['uwaba', 'khusus', 'tunggakan'], true)) {
            return $this->json($response, ['success' => false, 'message' => 'Field page wajib (uwaba|khusus|tunggakan)'], 400);
        }
        $pesan = trim((string) ($body['pesan'] ?? ''));
        if ($pesan === '') {
            return $this->json($response, ['success' => false, 'message' => 'Pesan tidak boleh kosong'], 400);
        }
        $sendTo = trim((string) ($body['send_to'] ?? 'santri_primary'));
        if (!in_array($sendTo, ['santri_primary', 'wali', 'both'], true)) {
            return $this->json($response, ['success' => false, 'message' => 'send_to tidak valid'], 400);
        }
        $ids = $body['id_santri'] ?? [];
        if (!is_array($ids)) {
            $ids = [];
        }
        $waInstance = isset($body['wa_instance']) ? trim((string) $body['wa_instance']) : null;
        if ($waInstance === '') {
            $waInstance = null;
        }

        if (!$this->tablesReady()) {
            return $this->json($response, ['success' => false, 'message' => 'Fitur belum siap (jalankan migrasi DB).'], 503);
        }

        // Satu job aktif per kombinasi global (semua page) — hindari tabrakan antar pengguna
        $stBusy = $this->db->query("SELECT id FROM manage_wa_bulk_job WHERE status IN ('queued','running') ORDER BY id DESC LIMIT 1");
        $busyRow = $stBusy ? $stBusy->fetch(PDO::FETCH_ASSOC) : false;
        if ($busyRow) {
            return $this->json($response, [
                'success' => false,
                'message' => 'Masih ada pengiriman massal berjalan (job #' . (int) $busyRow['id'] . '). Tunggu selesai atau batalkan dulu.',
                'blocking_job_id' => (int) $busyRow['id'],
            ], 409);
        }

        $built = ManageWaBulkService::buildItemsFromSantriIds($this->db, $ids, $sendTo);
        $items = $built['items'];
        if ($items === []) {
            return $this->json($response, [
                'success' => false,
                'message' => 'Tidak ada nomor tujuan yang valid untuk daftar santri terpilih.',
                'skipped' => $built['skipped'],
            ], 400);
        }

        try {
            $this->db->beginTransaction();
            $ins = $this->db->prepare(
                'INSERT INTO manage_wa_bulk_job (page, status, message_text, wa_instance, users_id_created, id_pengurus_created, total_items)
                 VALUES (?, ?, ?, ?, ?, ?, ?)'
            );
            $ins->execute([
                $page,
                'queued',
                $pesan,
                $waInstance,
                $usersId > 0 ? $usersId : null,
                $idPengurus,
                count($items),
            ]);
            $jobId = (int) $this->db->lastInsertId();

            $insItem = $this->db->prepare(
                'INSERT INTO manage_wa_bulk_item (job_id, sort_order, id_santri, nis, nama, recipient_kind, nomor_tujuan, status)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
            );
            foreach ($items as $it) {
                $insItem->execute([
                    $jobId,
                    (int) $it['sort_order'],
                    (int) $it['id_santri'],
                    $it['nis'],
                    $it['nama'],
                    $it['recipient_kind'],
                    $it['nomor'],
                    'pending',
                ]);
            }
            $this->db->commit();
        } catch (\Throwable $e) {
            if ($this->db->inTransaction()) {
                $this->db->rollBack();
            }
            error_log('ManageWaBulkController::postStart: ' . $e->getMessage());

            return $this->json($response, ['success' => false, 'message' => 'Gagal membuat job pengiriman'], 500);
        }

        ManageWaBulkService::spawnWorker($jobId);

        return $this->json($response, [
            'success' => true,
            'job_id' => $jobId,
            'total_items' => count($items),
            'skipped' => $built['skipped'],
        ], 200);
    }

    /**
     * POST /api/dashboard/manage-data/wa-bulk/cancel
     * Body: { job_id?: int } — tanpa job_id: batalkan job aktif apa pun
     */
    public function postCancel(Request $request, Response $response): Response
    {
        $body = $request->getParsedBody();
        if (!is_array($body)) {
            $body = [];
        }
        $jobId = isset($body['job_id']) ? (int) $body['job_id'] : 0;

        if (!$this->tablesReady()) {
            return $this->json($response, ['success' => false, 'message' => 'Fitur belum siap'], 503);
        }

        if ($jobId > 0) {
            $st = $this->db->prepare("UPDATE manage_wa_bulk_job SET cancel_requested = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND status IN ('queued','running')");
            $st->execute([$jobId]);
        } else {
            $this->db->exec("UPDATE manage_wa_bulk_job SET cancel_requested = 1, updated_at = CURRENT_TIMESTAMP WHERE status IN ('queued','running')");
        }

        return $this->json($response, ['success' => true, 'message' => 'Permintaan pembatalan dicatat'], 200);
    }

    private function tablesReady(): bool
    {
        return ManageWaBulkService::tableExists($this->db, 'manage_wa_bulk_job')
            && ManageWaBulkService::tableExists($this->db, 'manage_wa_bulk_item');
    }

    private function json(Response $response, array $data, int $code): Response
    {
        $response->getBody()->write(json_encode($data, JSON_UNESCAPED_UNICODE));

        return $response->withStatus($code)->withHeader('Content-Type', 'application/json');
    }
}

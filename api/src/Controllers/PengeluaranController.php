<?php

namespace App\Controllers;

use App\Database;
use App\Helpers\PengeluaranWaNotifRecipientHelper;
use App\Helpers\PengurusHelper;
use App\Helpers\TextSanitizer;
use App\Helpers\RoleHelper;
use App\Helpers\UserAktivitasLogger;
use App\Services\RencanaPengeluaranWaHelper;
use App\Services\WhatsAppService;
use App\Utils\DeferredHttpTask;
use App\Utils\PushNotificationService;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;

class PengeluaranController
{
    private $db;

    /** Path folder upload (base + UPLOADS_FOLDER: uploads atau uploads2) */
    private string $uploadsPath;

    public function __construct()
    {
        $this->db = Database::getInstance()->getConnection();
        $config = require __DIR__ . '/../../config.php';
        $base = rtrim($config['uploads_base_path'] ?? __DIR__ . '/../..', '/\\');
        $folder = $config['uploads_folder'] ?? 'uploads';
        $this->uploadsPath = $base . '/' . trim($folder, '/\\');
    }

    private function resolveUploadPath(string $pathFile): string
    {
        $pathFile = preg_replace('#^uploads2?/#', '', str_replace(['\\'], '/', $pathFile));
        return $this->uploadsPath . '/' . ltrim($pathFile, '/');
    }

    private function jsonResponse(Response $response, array $data, int $statusCode): Response
    {
        $response->getBody()->write(json_encode($data, JSON_UNESCAPED_UNICODE));
        return $response
            ->withStatus($statusCode)
            ->withHeader('Content-Type', 'application/json; charset=utf-8');
    }

    /** @return array<string, mixed> */
    private function userFromRequest(Request $request): array
    {
        $u = $request->getAttribute('user');

        return is_array($u) ? $u : [];
    }

    private function pengeluaranDenyUnlessAction(Request $request, Response $response, string $code): ?Response
    {
        $user = $this->userFromRequest($request);
        if (RoleHelper::tokenPengeluaranActionAllowed($this->db, $user, $code)) {
            return null;
        }

        return $this->jsonResponse($response, [
            'success' => false,
            'message' => 'Akses ditolak untuk aksi ini',
        ], 403);
    }

    /**
     * Ubah penerima uang (id_penerima) + daftar pengurus untuk dropdown: item.kelola_penerima atau kompatibel rencana.kelola_penerima_notif.
     */
    private function pengeluaranDenyUnlessMoneyRecipientKelola(Request $request, Response $response): ?Response
    {
        $user = $this->userFromRequest($request);
        foreach ([
            'action.pengeluaran.item.kelola_penerima',
            'action.pengeluaran.rencana.kelola_penerima_notif',
        ] as $code) {
            if (RoleHelper::tokenPengeluaranActionAllowed($this->db, $user, $code)) {
                return null;
            }
        }

        return $this->jsonResponse($response, [
            'success' => false,
            'message' => 'Akses ditolak untuk aksi ini',
        ], 403);
    }

    /**
     * @param list<string> $conditions
     * @param list<mixed> $params
     */
    private function appendRencanaLembagaScope(Request $request, array &$conditions, array &$params, string $which): void
    {
        $user = $this->userFromRequest($request);
        if (!RoleHelper::tokenPengeluaranApplyLembagaScope($this->db, $user, $which)) {
            return;
        }
        $ids = RoleHelper::tokenPengeluaranLembagaIdsFromUser($user);
        if ($ids === []) {
            return;
        }
        $placeholders = implode(',', array_fill(0, count($ids), '?'));
        $conditions[] = "lembaga IN ({$placeholders})";
        foreach ($ids as $id) {
            $params[] = $id;
        }
    }

    /**
     * @param list<string> $conditions
     * @param list<mixed> $params
     */
    private function appendPengeluaranLembagaScope(Request $request, array &$conditions, array &$params): void
    {
        $user = $this->userFromRequest($request);
        if (!RoleHelper::tokenPengeluaranApplyLembagaScope($this->db, $user, 'pengeluaran')) {
            return;
        }
        $ids = RoleHelper::tokenPengeluaranLembagaIdsFromUser($user);
        if ($ids === []) {
            return;
        }
        $placeholders = implode(',', array_fill(0, count($ids), '?'));
        $conditions[] = "p.lembaga IN ({$placeholders})";
        foreach ($ids as $id) {
            $params[] = $id;
        }
    }

    private function assertRencanaLembagaRow(Request $request, Response $response, ?string $lembaga, string $which): ?Response
    {
        $user = $this->userFromRequest($request);
        if (!RoleHelper::tokenPengeluaranApplyLembagaScope($this->db, $user, $which)) {
            return null;
        }
        $ids = RoleHelper::tokenPengeluaranLembagaIdsFromUser($user);
        $lid = $lembaga !== null && $lembaga !== '' ? trim((string) $lembaga) : '';
        if ($lid === '' || !in_array($lid, $ids, true)) {
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Akses ditolak untuk lembaga ini',
            ], 403);
        }

        return null;
    }

    private function assertPengeluaranLembagaRow(Request $request, Response $response, ?string $lembaga): ?Response
    {
        return $this->assertRencanaLembagaRow($request, $response, $lembaga, 'pengeluaran');
    }

    /**
     * POST /api/pengeluaran/rencana - Buat rencana pengeluaran baru
     */
    public function createRencana(Request $request, Response $response): Response
    {
        try {
            $data = $request->getParsedBody();
            $data = is_array($data) ? TextSanitizer::sanitizeStringValues($data, []) : [];
            if (!empty($data['details']) && is_array($data['details'])) {
                $data['details'] = array_map(function ($row) {
                    return is_array($row) ? TextSanitizer::sanitizeStringValues($row, []) : $row;
                }, $data['details']);
            }
            $user = $request->getAttribute('user');
            $userArr = is_array($user) ? $user : [];

            $idAdmin = $user['user_id'] ?? $user['id'] ?? null;
            $keterangan = $data['keterangan'] ?? '';
            $kategori = $data['kategori'] ?? null;
            $lembaga = $data['lembaga'] ?? null;
            $sumberUang = $data['sumber_uang'] ?? 'Cash';
            $hijriyah = $data['hijriyah'] ?? null;
            $tahunAjaran = $data['tahun_ajaran'] ?? null;
            $details = $data['details'] ?? [];

            if (empty($keterangan)) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Keterangan wajib diisi'
                ], 400);
            }

            if (empty($details) || !is_array($details)) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Detail item wajib diisi'
                ], 400);
            }

            // Validasi kategori
            if ($kategori !== null) {
                $validKategori = ['Bisyaroh', 'Acara', 'Pengadaan', 'Perbaikan', 'ATK', 'lainnya', 'Listrik', 'Wifi', 'Langganan'];
                if (!in_array($kategori, $validKategori)) {
                    return $this->jsonResponse($response, [
                        'success' => false,
                        'message' => 'Kategori tidak valid'
                    ], 400);
                }
            }

            // Validasi detail items - tidak boleh ada item dengan nama sama
            $itemNames = [];
            foreach ($details as $detail) {
                $itemName = trim($detail['item'] ?? '');
                if (empty($itemName)) {
                    return $this->jsonResponse($response, [
                        'success' => false,
                        'message' => 'Nama item tidak boleh kosong'
                    ], 400);
                }
                if (in_array($itemName, $itemNames)) {
                    return $this->jsonResponse($response, [
                        'success' => false,
                        'message' => "Item '{$itemName}' duplikat dalam rencana yang sama"
                    ], 400);
                }
                $itemNames[] = $itemName;
            }

                // Insert rencana - support draft status
                $status = $data['status'] ?? 'pending'; // 'pending' atau 'draft'
                if (!in_array($status, ['pending', 'draft'])) {
                    $status = 'pending';
                }

            $actionCode = $status === 'draft'
                ? 'action.pengeluaran.rencana.simpan_draft'
                : 'action.pengeluaran.rencana.simpan';
            $denyA = $this->pengeluaranDenyUnlessAction($request, $response, $actionCode);
            if ($denyA !== null) {
                return $denyA;
            }
            $denyL = $this->assertRencanaLembagaRow($request, $response, $lembaga !== null ? (string) $lembaga : null, 'rencana');
            if ($denyL !== null) {
                return $denyL;
            }
            if (RoleHelper::tokenPengeluaranApplyLembagaScope($this->db, $userArr, 'rencana')) {
                $lid = $lembaga !== null && $lembaga !== '' ? trim((string) $lembaga) : '';
                if ($lid === '') {
                    return $this->jsonResponse($response, [
                        'success' => false,
                        'message' => 'Lembaga wajib dipilih sesuai akses Anda',
                    ], 400);
                }
            }

            $this->db->beginTransaction();

            try {
                // Hitung total nominal (hanya yang tidak ditolak)
                $totalNominal = 0;
                foreach ($details as $detail) {
                    $isRejected = $detail['rejected'] ?? false;
                    if ($isRejected) {
                        continue; // Skip detail yang ditolak
                    }
                    $harga = floatval($detail['harga'] ?? 0);
                    $jumlah = intval($detail['jumlah'] ?? 1);
                    $totalNominal += $harga * $jumlah;
                }
                
                $sqlRencana = "INSERT INTO pengeluaran___rencana (keterangan, kategori, lembaga, sumber_uang, id_admin, nominal, hijriyah, tahun_ajaran, ket) 
                              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)";
                $stmtRencana = $this->db->prepare($sqlRencana);
                $stmtRencana->execute([$keterangan, $kategori, $lembaga, $sumberUang, $idAdmin, $totalNominal, $hijriyah, $tahunAjaran, $status]);
                $idRencana = $this->db->lastInsertId();

                // Insert detail items
                $sqlDetail = "INSERT INTO pengeluaran___rencana_detail 
                             (id_pengeluaran_rencana, item, harga, jumlah, nominal, versi, id_admin, rejected) 
                             VALUES (?, ?, ?, ?, ?, 1, ?, 0)";
                $stmtDetail = $this->db->prepare($sqlDetail);

                foreach ($details as $detail) {
                    $item = trim($detail['item']);
                    $harga = floatval($detail['harga'] ?? 0);
                    $jumlah = intval($detail['jumlah'] ?? 1);
                    $nominal = $harga * $jumlah;
                    $detailAdmin = $detail['id_admin'] ?? $idAdmin; // Bisa berbeda admin

                    $stmtDetail->execute([$idRencana, $item, $harga, $jumlah, $nominal, $detailAdmin]);
                }

                $this->db->commit();

                $stmtR = $this->db->prepare("SELECT * FROM pengeluaran___rencana WHERE id = ?");
                $stmtR->execute([$idRencana]);
                $newRencana = $stmtR->fetch(\PDO::FETCH_ASSOC);
                if ($newRencana) {
                    UserAktivitasLogger::log(null, $idAdmin, UserAktivitasLogger::ACTION_CREATE, 'pengeluaran___rencana', $idRencana, null, $newRencana, $request);
                }

                if ($status === 'draft') {
                    $this->scheduleNotifOnDraftSaved(
                        (int) $idRencana,
                        $lembaga !== null ? (string) $lembaga : null,
                        $idAdmin !== null ? (int) $idAdmin : null,
                        (string) $keterangan,
                        false
                    );
                }

                return $this->jsonResponse($response, [
                    'success' => true,
                    'message' => 'Rencana pengeluaran berhasil dibuat',
                    'data' => ['id' => $idRencana]
                ], 201);

            } catch (\Exception $e) {
                $this->db->rollBack();
                throw $e;
            }

        } catch (\Exception $e) {
            error_log("Create rencana error: " . $e->getMessage());
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Gagal membuat rencana: ' . $e->getMessage()
            ], 500);
        }
    }

    /**
     * GET /api/pengeluaran/rencana - List semua rencana pengeluaran
     */
    public function getRencanaList(Request $request, Response $response): Response
    {
        try {
            $queryParams = $request->getQueryParams();
            $status = $queryParams['status'] ?? null;
            $kategori = $queryParams['kategori'] ?? null;
            $lembaga = $queryParams['lembaga'] ?? null;
            $tanggalDari = $queryParams['tanggal_dari'] ?? null;
            $tanggalSampai = $queryParams['tanggal_sampai'] ?? null;
            $lembagaContext = isset($queryParams['lembaga_context']) ? trim((string) $queryParams['lembaga_context']) : '';
            $page = isset($queryParams['page']) ? (int)$queryParams['page'] : 1;
            $limit = isset($queryParams['limit']) ? (int)$queryParams['limit'] : 20;
            $offset = ($page - 1) * $limit;

            $whereClause = '';
            $params = [];
            $conditions = [];

            if ($status) {
                $conditions[] = "ket = ?";
                $params[] = $status;
            }
            
            if ($kategori) {
                $conditions[] = "kategori = ?";
                $params[] = $kategori;
            }
            
            if ($lembaga) {
                $conditions[] = "lembaga = ?";
                $params[] = $lembaga;
            }

            if ($tanggalDari) {
                $conditions[] = "DATE(tanggal_dibuat) >= ?";
                $params[] = $tanggalDari;
            }

            if ($tanggalSampai) {
                $conditions[] = "DATE(tanggal_dibuat) <= ?";
                $params[] = $tanggalSampai;
            }

            $whichScope = 'rencana';
            if ($status === 'draft' || $lembagaContext === 'draft') {
                $whichScope = 'draft';
            }
            if ($whichScope === 'rencana' && !$status) {
                $conditions[] = "ket <> 'draft'";
            }
            $this->appendRencanaLembagaScope($request, $conditions, $params, $whichScope);

            if (!empty($conditions)) {
                $whereClause = "WHERE " . implode(" AND ", $conditions);
            }

            // Get total
            $sqlCount = "SELECT COUNT(*) as total FROM pengeluaran___rencana {$whereClause}";
            $stmtCount = $this->db->prepare($sqlCount);
            $stmtCount->execute($params);
            $total = $stmtCount->fetch(\PDO::FETCH_ASSOC)['total'];

            // Get list dengan info detail yang ditolak, jumlah komentar, dan jumlah viewer
            // Urutan: pending/di edit di atas, approve/ditolak di bawah (urut tanggal)
            $sql = "SELECT r.*, p.nama as admin_nama,
                    (SELECT COUNT(*) FROM pengeluaran___rencana_detail d
                     WHERE d.id_pengeluaran_rencana = r.id
                     AND COALESCE(d.rejected, 0) = 1
                     AND d.versi = (
                         SELECT MAX(versi) FROM pengeluaran___rencana_detail d2
                         WHERE d2.id_pengeluaran_rencana = d.id_pengeluaran_rencana
                         AND d2.item = d.item
                     )) as jumlah_detail_ditolak,
                    (SELECT COUNT(*) FROM pengeluaran___komentar k
                     WHERE k.id_rencana = r.id) as jumlah_komentar,
                    (SELECT COUNT(*) FROM pengeluaran___viewer v
                     WHERE v.id_rencana = r.id) as jumlah_viewer
                    FROM pengeluaran___rencana r 
                    LEFT JOIN pengurus p ON r.id_admin = p.id 
                    {$whereClause} 
                    ORDER BY 
                        CASE 
                            WHEN r.ket IN ('pending', 'di edit') THEN 1
                            WHEN r.ket IN ('di approve', 'ditolak') THEN 2
                            ELSE 3
                        END ASC,
                        r.tanggal_dibuat DESC 
                    LIMIT ? OFFSET ?";
            $params[] = $limit;
            $params[] = $offset;
            $stmt = $this->db->prepare($sql);
            $stmt->execute($params);
            $rencana = $stmt->fetchAll(\PDO::FETCH_ASSOC);

            return $this->jsonResponse($response, [
                'success' => true,
                'data' => [
                    'rencana' => $rencana,
                    'pagination' => [
                        'page' => $page,
                        'limit' => $limit,
                        'total' => (int)$total,
                        'total_pages' => ceil($total / $limit)
                    ]
                ]
            ], 200);

        } catch (\Exception $e) {
            error_log("Get rencana list error: " . $e->getMessage());
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Gagal mengambil daftar rencana: ' . $e->getMessage()
            ], 500);
        }
    }

    /**
     * GET /api/pengeluaran/rencana/{id} - Detail rencana dengan items
     */
    public function getRencanaDetail(Request $request, Response $response, array $args): Response
    {
        try {
            $idRencana = $args['id'] ?? null;

            if (!$idRencana) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'ID rencana tidak valid'
                ], 400);
            }

            // Get rencana dengan admin_approve_nama (siapa approve), admin_nama (pembuat), last_edit_admin_nama (siapa terakhir edit)
            $sqlRencana = "SELECT r.*, 
                          p.nama as admin_nama,
                          peng_approve.nama as admin_approve_nama,
                          (SELECT pg.nama FROM pengeluaran___rencana_detail rd
                           LEFT JOIN pengurus pg ON rd.id_admin = pg.id
                           WHERE rd.id_pengeluaran_rencana = r.id
                           ORDER BY rd.id DESC LIMIT 1) as last_edit_admin_nama,
                          (SELECT COUNT(*) FROM pengeluaran___komentar k
                           WHERE k.id_rencana = r.id) as jumlah_komentar,
                          (SELECT COUNT(*) FROM pengeluaran___viewer v
                           WHERE v.id_rencana = r.id) as jumlah_viewer
                          FROM pengeluaran___rencana r 
                          LEFT JOIN pengurus p ON r.id_admin = p.id 
                          LEFT JOIN pengeluaran peng ON peng.id_rencana = r.id
                          LEFT JOIN pengurus peng_approve ON peng.id_admin_approve = peng_approve.id
                          WHERE r.id = ?";
            $stmtRencana = $this->db->prepare($sqlRencana);
            $stmtRencana->execute([$idRencana]);
            $rencana = $stmtRencana->fetch(\PDO::FETCH_ASSOC);

            if (!$rencana) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Rencana tidak ditemukan'
                ], 404);
            }

            $whichDet = (($rencana['ket'] ?? '') === 'draft') ? 'draft' : 'rencana';
            $denyLb = $this->assertRencanaLembagaRow($request, $response, isset($rencana['lembaga']) ? (string) $rencana['lembaga'] : null, $whichDet);
            if ($denyLb !== null) {
                return $denyLb;
            }

            // Get detail items (hanya versi terbaru untuk setiap item)
            $sqlDetail = "SELECT d.*, p.nama as admin_nama,
                         d.versi,
                         COALESCE(d.rejected, 0) as rejected,
                         d.alasan_penolakan
                         FROM pengeluaran___rencana_detail d
                         LEFT JOIN pengurus p ON d.id_admin = p.id
                         WHERE d.id_pengeluaran_rencana = ?
                         AND d.versi = (
                             SELECT MAX(versi) FROM pengeluaran___rencana_detail 
                             WHERE id_pengeluaran_rencana = d.id_pengeluaran_rencana 
                             AND item = d.item
                         )
                         ORDER BY d.item";
            $stmtDetail = $this->db->prepare($sqlDetail);
            $stmtDetail->execute([$idRencana]);
            $details = $stmtDetail->fetchAll(\PDO::FETCH_ASSOC);

            $rencana['details'] = $details;

            // Track viewer - auto track saat melihat detail; PWA ke audiens notif WA hanya pada kunjungan pertama per admin per rencana
            $user = $request->getAttribute('user');
            $idAdmin = $user['user_id'] ?? $user['id'] ?? null;
            if ($idAdmin) {
                try {
                    $stmtHad = $this->db->prepare('SELECT 1 FROM pengeluaran___viewer WHERE id_rencana = ? AND id_admin = ? LIMIT 1');
                    $stmtHad->execute([$idRencana, $idAdmin]);
                    $alreadyViewed = $stmtHad->fetch() !== false;

                    $waktuIndonesia = (new \DateTime('now', new \DateTimeZone('Asia/Jakarta')))->format('Y-m-d H:i:s');
                    $sqlViewer = "INSERT INTO pengeluaran___viewer (id_rencana, id_admin, jumlah_view)
                                  VALUES (?, ?, 1)
                                  ON DUPLICATE KEY UPDATE 
                                    tanggal_update = ?,
                                    jumlah_view = jumlah_view + 1";
                    $stmtViewer = $this->db->prepare($sqlViewer);
                    $stmtViewer->execute([$idRencana, $idAdmin, $waktuIndonesia]);

                    if (!$alreadyViewed) {
                        $stmtVn = $this->db->prepare('SELECT nama FROM pengurus WHERE id = ? LIMIT 1');
                        $stmtVn->execute([(int) $idAdmin]);
                        $viewerNama = trim((string) ($stmtVn->fetchColumn() ?: ''));
                        $ketLabel = (string) ($rencana['keterangan'] ?? 'Rencana pengeluaran');
                        if (strlen($ketLabel) > 80) {
                            $ketLabel = substr($ketLabel, 0, 77) . '...';
                        }
                        $who = $viewerNama !== '' ? $viewerNama : 'Seorang admin';
                        $lembagaPush = isset($rencana['lembaga']) ? trim((string) $rencana['lembaga']) : '';
                        $isDraftPush = (($rencana['ket'] ?? '') === 'draft');
                        $idAdminInt = (int) $idAdmin;
                        $idRencanaInt = (int) $idRencana;
                        $self = $this;
                        $titleBuka = 'Rencana dibuka - ' . $ketLabel;
                        $bodyBuka = $who . ' melihat detail rencana';
                        DeferredHttpTask::runAfterResponse(function () use (
                            $self,
                            $lembagaPush,
                            $isDraftPush,
                            $idAdminInt,
                            $titleBuka,
                            $bodyBuka,
                            $idRencanaInt
                        ): void {
                            $self->sendPengeluaranNotifPolicyPush(
                                $lembagaPush !== '' ? $lembagaPush : null,
                                $isDraftPush,
                                [$idAdminInt],
                                $titleBuka,
                                $bodyBuka,
                                '/pengeluaran?tab=rencana&rencana=' . $idRencanaInt,
                                'rencana-dilihat-' . $idRencanaInt . '-' . $idAdminInt . '-' . microtime(true),
                                [
                                    'type' => 'rencana_dilihat',
                                    'rencana_id' => $idRencanaInt,
                                ]
                            );
                        });
                    }
                } catch (\Exception $e) {
                    // Log error tapi jangan gagalkan response
                    error_log("Track viewer error: " . $e->getMessage());
                }
            }

            // Get komentar dengan role admin
            $sqlKomentar = "SELECT k.*, p.nama as admin_nama,
                           (SELECT r.`key` FROM pengurus___role pr INNER JOIN role r ON pr.role_id = r.id WHERE pr.pengurus_id = p.id ORDER BY CASE r.`key` WHEN 'super_admin' THEN 1 WHEN 'admin_uwaba' THEN 2 WHEN 'admin_lembaga' THEN 3 ELSE 4 END LIMIT 1) AS level
                           FROM pengeluaran___komentar k
                           LEFT JOIN pengurus p ON k.id_admin = p.id
                           WHERE k.id_rencana = ?
                           ORDER BY k.tanggal_dibuat DESC";
            $stmtKomentar = $this->db->prepare($sqlKomentar);
            $stmtKomentar->execute([$idRencana]);
            $komentar = $stmtKomentar->fetchAll(\PDO::FETCH_ASSOC);
            
            // Ambil semua role untuk setiap admin dan gabungkan
            foreach ($komentar as &$k) {
                $sqlRole = "SELECT r.label, r.`key`
                           FROM pengurus___role pr
                           INNER JOIN role r ON pr.role_id = r.id
                           WHERE pr.pengurus_id = ?
                           ORDER BY CASE r.`key`
                               WHEN 'super_admin' THEN 1
                               WHEN 'admin_uwaba' THEN 2
                               WHEN 'admin_lembaga' THEN 3
                               ELSE 4
                           END";
                $stmtRole = $this->db->prepare($sqlRole);
                $stmtRole->execute([$k['id_admin']]);
                $roles = $stmtRole->fetchAll(\PDO::FETCH_ASSOC);
                
                if (!empty($roles)) {
                    // Gabungkan semua role dengan pemisah " - "
                    $roleLabels = array_map(function($r) {
                        return $r['label'];
                    }, $roles);
                    $k['admin_role'] = implode(' - ', $roleLabels);
                } else {
                    // Fallback ke level jika tidak ada role
                    $k['admin_role'] = $k['level'] ?? 'User';
                }
            }
            unset($k);
            
            $rencana['komentar'] = $komentar;

            // Get viewer list
            $sqlViewerList = "SELECT v.*, p.nama as admin_nama
                             FROM pengeluaran___viewer v
                             LEFT JOIN pengurus p ON v.id_admin = p.id
                             WHERE v.id_rencana = ?
                             ORDER BY v.tanggal_dilihat DESC";
            $stmtViewerList = $this->db->prepare($sqlViewerList);
            $stmtViewerList->execute([$idRencana]);
            $viewers = $stmtViewerList->fetchAll(\PDO::FETCH_ASSOC);
            $rencana['viewers'] = $viewers;

            // Get edit history untuk setiap item
            $sqlHistory = "SELECT rd.*, p.nama as admin_nama
                          FROM pengeluaran___rencana_detail rd
                          LEFT JOIN pengurus p ON rd.id_admin = p.id
                          WHERE rd.id_pengeluaran_rencana = ?
                          ORDER BY rd.item, rd.versi ASC";
            $stmtHistory = $this->db->prepare($sqlHistory);
            $stmtHistory->execute([$idRencana]);
            $historyDetails = $stmtHistory->fetchAll(\PDO::FETCH_ASSOC);
            
            // Group by item untuk melihat history edit per item
            $historyByItem = [];
            foreach ($historyDetails as $hist) {
                $item = $hist['item'];
                if (!isset($historyByItem[$item])) {
                    $historyByItem[$item] = [];
                }
                $historyByItem[$item][] = $hist;
            }
            $rencana['edit_history'] = $historyByItem;

            // Get detail yang ditolak dengan alasan
            $sqlRejected = "SELECT rd.*, 
                          p.nama as admin_nama,
                          rd.alasan_penolakan
                          FROM pengeluaran___rencana_detail rd
                          LEFT JOIN pengurus p ON rd.id_admin = p.id
                          WHERE rd.id_pengeluaran_rencana = ?
                          AND COALESCE(rd.rejected, 0) = 1
                          AND rd.versi = (
                              SELECT MAX(versi) FROM pengeluaran___rencana_detail d2
                              WHERE d2.id_pengeluaran_rencana = rd.id_pengeluaran_rencana
                              AND d2.item = rd.item
                          )
                          ORDER BY rd.item";
            $stmtRejected = $this->db->prepare($sqlRejected);
            $stmtRejected->execute([$idRencana]);
            $rejectedDetails = $stmtRejected->fetchAll(\PDO::FETCH_ASSOC);
            $rencana['rejected_details'] = $rejectedDetails;

            return $this->jsonResponse($response, [
                'success' => true,
                'data' => $rencana
            ], 200);

        } catch (\Exception $e) {
            error_log("Get rencana detail error: " . $e->getMessage());
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Gagal mengambil detail rencana: ' . $e->getMessage()
            ], 500);
        }
    }

    /**
     * POST /api/pengeluaran/rencana/notif-wa - Kirim notifikasi WA + Web Push (PWA) ke admin (backend + log).
     * Penerima push = daftar penerima yang sama setelah filter akses notif WA (termasuk aturan draft).
     * Body: { "rencana_id": int, "message": string, "recipients": [ { "id": pengurus_id, "whatsapp": "08xxx" } ] }
     */
    public function sendRencanaNotifWa(Request $request, Response $response): Response
    {
        try {
            $input = $request->getParsedBody();
            if (!is_array($input)) {
                $body = $request->getBody()->getContents();
                $input = is_string($body) && $body !== '' ? json_decode($body, true) : null;
            }
            if (!is_array($input)) {
                return $this->jsonResponse($response, ['success' => false, 'message' => 'Body harus JSON'], 400);
            }
            $rawMessage = isset($input['message']) && is_string($input['message']) ? $input['message'] : '';
            // Hanya cleanText untuk field selain message — cleanText meruntuhkan \n jadi satu paragraf.
            $input = TextSanitizer::sanitizeStringValues($input, ['rencana_id']);
            $message = TextSanitizer::cleanMultilineMessage($rawMessage);
            $rencanaId = isset($input['rencana_id']) ? (int) $input['rencana_id'] : 0;
            $recipients = $input['recipients'] ?? [];

            if ($rencanaId < 1) {
                return $this->jsonResponse($response, ['success' => false, 'message' => 'rencana_id wajib dan harus positif'], 400);
            }
            if ($message === '') {
                return $this->jsonResponse($response, ['success' => false, 'message' => 'Pesan wajib diisi'], 400);
            }
            if (!is_array($recipients) || empty($recipients)) {
                return $this->jsonResponse($response, ['success' => false, 'message' => 'Pilih minimal satu penerima (recipients)'], 400);
            }

            $stmt = $this->db->prepare('SELECT id, lembaga, ket FROM pengeluaran___rencana WHERE id = ? LIMIT 1');
            $stmt->execute([$rencanaId]);
            $rencRow = $stmt->fetch(\PDO::FETCH_ASSOC);
            if (!$rencRow) {
                return $this->jsonResponse($response, ['success' => false, 'message' => 'Rencana tidak ditemukan'], 404);
            }
            $lem = isset($rencRow['lembaga']) ? trim((string) $rencRow['lembaga']) : '';
            $isDraftWa = (($rencRow['ket'] ?? '') === 'draft');
            $recipients = PengeluaranWaNotifRecipientHelper::filterRecipients(
                $this->db,
                $lem !== '' ? $lem : null,
                $recipients,
                $isDraftWa
            );
            if ($recipients === []) {
                return $this->jsonResponse($response, ['success' => false, 'message' => 'Tidak ada penerima yang diizinkan (periksa aksi notif WA di Pengaturan → Fitur untuk role terkait).'], 400);
            }

            $user = $request->getAttribute('user');
            $idPengurusPengirim = isset($user['user_id']) ? (int) $user['user_id'] : (isset($user['id']) ? (int) $user['id'] : null);

            $recipientsCopy = $recipients;
            $messageCopy = $message;
            $rid = $rencanaId;
            $idSender = $idPengurusPengirim;
            $self = $this;
            DeferredHttpTask::runAfterResponse(function () use ($self, $recipientsCopy, $messageCopy, $rid, $idSender): void {
                $self->runRencanaNotifWaDelivery($recipientsCopy, $messageCopy, $rid, $idSender);
            });

            return $this->jsonResponse($response, [
                'success' => true,
                'message' => 'Notifikasi WA dan push sedang diproses di latar belakang',
                'data' => [
                    'queued' => true,
                    'recipient_count' => \count($recipients),
                ],
            ], 200);
        } catch (\Throwable $e) {
            error_log("Pengeluaran sendRencanaNotifWa error: " . $e->getMessage());
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Gagal mengirim notifikasi: ' . $e->getMessage(),
            ], 500);
        }
    }

    /**
     * POST /api/pengeluaran/notif-wa - Kirim notifikasi WA + Web Push (PWA) pengeluaran ke admin.
     * Penerima push = daftar penerima yang sama setelah filter akses notif WA.
     * Body: { "pengeluaran_id": int, "message": string, "recipients": [ { "id": pengurus_id, "whatsapp": "08xxx" } ] }
     */
    public function sendPengeluaranNotifWa(Request $request, Response $response): Response
    {
        try {
            $input = $request->getParsedBody();
            if (!is_array($input)) {
                $body = $request->getBody()->getContents();
                $input = is_string($body) && $body !== '' ? json_decode($body, true) : null;
            }
            if (!is_array($input)) {
                return $this->jsonResponse($response, ['success' => false, 'message' => 'Body harus JSON'], 400);
            }
            $rawMessage = isset($input['message']) && is_string($input['message']) ? $input['message'] : '';
            $input = TextSanitizer::sanitizeStringValues($input, ['pengeluaran_id']);
            $message = TextSanitizer::cleanMultilineMessage($rawMessage);
            $pengeluaranId = isset($input['pengeluaran_id']) ? (int) $input['pengeluaran_id'] : 0;
            $recipients = $input['recipients'] ?? [];

            if ($pengeluaranId < 1) {
                return $this->jsonResponse($response, ['success' => false, 'message' => 'pengeluaran_id wajib dan harus positif'], 400);
            }
            if ($message === '') {
                return $this->jsonResponse($response, ['success' => false, 'message' => 'Pesan wajib diisi'], 400);
            }
            if (!is_array($recipients) || empty($recipients)) {
                return $this->jsonResponse($response, ['success' => false, 'message' => 'Pilih minimal satu penerima (recipients)'], 400);
            }

            $stmt = $this->db->prepare('SELECT id, lembaga FROM pengeluaran WHERE id = ? LIMIT 1');
            $stmt->execute([$pengeluaranId]);
            $pRow = $stmt->fetch(\PDO::FETCH_ASSOC);
            if (!$pRow) {
                return $this->jsonResponse($response, ['success' => false, 'message' => 'Pengeluaran tidak ditemukan'], 404);
            }
            $lemP = isset($pRow['lembaga']) ? trim((string) $pRow['lembaga']) : '';
            $recipients = PengeluaranWaNotifRecipientHelper::filterRecipients($this->db, $lemP !== '' ? $lemP : null, $recipients);
            if ($recipients === []) {
                return $this->jsonResponse($response, ['success' => false, 'message' => 'Tidak ada penerima yang diizinkan (periksa aksi notif WA di Pengaturan → Fitur untuk role terkait).'], 400);
            }

            $user = $request->getAttribute('user');
            $idPengurusPengirim = isset($user['user_id']) ? (int) $user['user_id'] : (isset($user['id']) ? (int) $user['id'] : null);

            $recipientsCopy = $recipients;
            $messageCopy = $message;
            $pid = $pengeluaranId;
            $idSender = $idPengurusPengirim;
            $self = $this;
            DeferredHttpTask::runAfterResponse(function () use ($self, $recipientsCopy, $messageCopy, $pid, $idSender): void {
                $self->runPengeluaranNotifWaDelivery($recipientsCopy, $messageCopy, $pid, $idSender);
            });

            return $this->jsonResponse($response, [
                'success' => true,
                'message' => 'Notifikasi WA dan push sedang diproses di latar belakang',
                'data' => [
                    'queued' => true,
                    'recipient_count' => \count($recipients),
                ],
            ], 200);
        } catch (\Throwable $e) {
            error_log("Pengeluaran sendPengeluaranNotifWa error: " . $e->getMessage());
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Gagal mengirim notifikasi: ' . $e->getMessage(),
            ], 500);
        }
    }

    /**
     * PUT /api/pengeluaran/rencana/{id} - Edit rencana (buat versi baru untuk item yang diubah)
     */
    public function updateRencana(Request $request, Response $response, array $args): Response
    {
        try {
            $idRencana = $args['id'] ?? null;
            $data = $request->getParsedBody();
            $data = is_array($data) ? TextSanitizer::sanitizeStringValues($data, []) : [];
            if (!empty($data['details']) && is_array($data['details'])) {
                $data['details'] = array_map(function ($row) {
                    return is_array($row) ? TextSanitizer::sanitizeStringValues($row, []) : $row;
                }, $data['details']);
            }
            $user = $request->getAttribute('user');
            
            $idAdmin = $user['user_id'] ?? $user['id'] ?? null;
            $keterangan = $data['keterangan'] ?? null;
            $kategori = $data['kategori'] ?? null;
            $lembaga = $data['lembaga'] ?? null;
            $details = $data['details'] ?? null;

            if (!$idRencana) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'ID rencana tidak valid'
                ], 400);
            }

            // Cek apakah rencana ada dan masih pending
            $sqlCheck = "SELECT ket, lembaga FROM pengeluaran___rencana WHERE id = ?";
            $stmtCheck = $this->db->prepare($sqlCheck);
            $stmtCheck->execute([$idRencana]);
            $rencana = $stmtCheck->fetch(\PDO::FETCH_ASSOC);

            if (!$rencana) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Rencana tidak ditemukan'
                ], 404);
            }

            $isDraftRow = ($rencana['ket'] ?? '') === 'draft';
            $editCode = $isDraftRow ? 'action.pengeluaran.draft.edit' : 'action.pengeluaran.rencana.edit';
            $denyAc = $this->pengeluaranDenyUnlessAction($request, $response, $editCode);
            if ($denyAc !== null) {
                return $denyAc;
            }
            $whichEdit = $isDraftRow ? 'draft' : 'rencana';
            $denyLb0 = $this->assertRencanaLembagaRow($request, $response, isset($rencana['lembaga']) ? (string) $rencana['lembaga'] : null, $whichEdit);
            if ($denyLb0 !== null) {
                return $denyLb0;
            }

            // Boleh edit jika status pending, di edit, atau draft
            // Tidak boleh edit jika sudah di-approve atau ditolak
            if ($rencana['ket'] === 'di approve') {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Rencana yang sudah di-approve tidak dapat diedit'
                ], 400);
            }
            
            if ($rencana['ket'] === 'ditolak') {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Rencana yang sudah ditolak tidak dapat diedit'
                ], 400);
            }

            $stmtOld = $this->db->prepare("SELECT * FROM pengeluaran___rencana WHERE id = ?");
            $stmtOld->execute([$idRencana]);
            $oldRencana = $stmtOld->fetch(\PDO::FETCH_ASSOC);

            $this->db->beginTransaction();

            try {
                // Update keterangan, kategori, lembaga, sumber_uang, hijriyah, tahun_ajaran, dan status jika ada
                $keterangan = $data['keterangan'] ?? null;
                $kategori = $data['kategori'] ?? null;
                $lembaga = $data['lembaga'] ?? null;
                $sumberUang = $data['sumber_uang'] ?? null;
                $hijriyah = $data['hijriyah'] ?? null;
                $tahunAjaran = $data['tahun_ajaran'] ?? null;
                $status = $data['status'] ?? null; // 'pending' atau 'draft'
                
                if ($keterangan !== null || $kategori !== null || $lembaga !== null || $sumberUang !== null || $hijriyah !== null || $tahunAjaran !== null || $status !== null) {
                    $updateFields = [];
                    $updateParams = [];
                    
                    if ($keterangan !== null) {
                        $updateFields[] = "keterangan = ?";
                        $updateParams[] = $keterangan;
                    }
                    if ($kategori !== null) {
                        // Validasi kategori
                        $validKategori = ['Bisyaroh', 'Acara', 'Pengadaan', 'Perbaikan', 'ATK', 'lainnya', 'Listrik', 'Wifi', 'Langganan'];
                        if (!in_array($kategori, $validKategori)) {
                            $this->db->rollBack();
                            return $this->jsonResponse($response, [
                                'success' => false,
                                'message' => 'Kategori tidak valid'
                            ], 400);
                        }
                        $updateFields[] = "kategori = ?";
                        $updateParams[] = $kategori;
                    }
                    if ($lembaga !== null) {
                        $whichTarget = $whichEdit;
                        if ($status === 'pending') {
                            $whichTarget = 'rencana';
                        } elseif ($status === 'draft') {
                            $whichTarget = 'draft';
                        }
                        $denyLb1 = $this->assertRencanaLembagaRow($request, $response, (string) $lembaga, $whichTarget);
                        if ($denyLb1 !== null) {
                            $this->db->rollBack();
                            return $denyLb1;
                        }
                        $updateFields[] = "lembaga = ?";
                        $updateParams[] = $lembaga;
                    }
                    if ($sumberUang !== null) {
                        $updateFields[] = "sumber_uang = ?";
                        $updateParams[] = $sumberUang;
                    }
                    if ($hijriyah !== null) {
                        $updateFields[] = "hijriyah = ?";
                        $updateParams[] = $hijriyah;
                    }
                    if ($tahunAjaran !== null) {
                        $updateFields[] = "tahun_ajaran = ?";
                        $updateParams[] = $tahunAjaran;
                    }
                    if ($status !== null && in_array($status, ['pending', 'draft'])) {
                        $updateFields[] = "ket = ?";
                        $updateParams[] = $status;
                    }
                    
                    $updateParams[] = $idRencana;
                    $sqlUpdate = "UPDATE pengeluaran___rencana SET " . implode(", ", $updateFields) . " WHERE id = ?";
                    $stmtUpdate = $this->db->prepare($sqlUpdate);
                    $stmtUpdate->execute($updateParams);
                }

                // Update detail items jika ada
                if ($details !== null && is_array($details)) {
                    // Filter detail yang tidak ditolak untuk validasi
                    $activeDetails = array_filter($details, function($d) {
                        return !($d['rejected'] ?? false);
                    });
                    
                    // Validasi tidak ada item duplikat (hanya untuk yang tidak ditolak)
                    $itemNames = [];
                    foreach ($activeDetails as $detail) {
                        $itemName = trim($detail['item'] ?? '');
                        if (empty($itemName)) {
                            throw new \Exception('Nama item tidak boleh kosong');
                        }
                        if (in_array($itemName, $itemNames)) {
                            throw new \Exception("Item '{$itemName}' duplikat");
                        }
                        $itemNames[] = $itemName;
                    }

                    // Get semua item yang ada saat ini (versi terbaru)
                    $sqlCurrentItems = "SELECT DISTINCT item FROM pengeluaran___rencana_detail 
                                       WHERE id_pengeluaran_rencana = ? 
                                       AND versi = (
                                           SELECT MAX(versi) FROM pengeluaran___rencana_detail d2
                                           WHERE d2.id_pengeluaran_rencana = pengeluaran___rencana_detail.id_pengeluaran_rencana
                                           AND d2.item = pengeluaran___rencana_detail.item
                                       )";
                    $stmtCurrentItems = $this->db->prepare($sqlCurrentItems);
                    $stmtCurrentItems->execute([$idRencana]);
                    $currentItems = array_map(function($row) { return $row['item']; }, $stmtCurrentItems->fetchAll(\PDO::FETCH_ASSOC));

                    // Proses setiap detail
                    foreach ($details as $detail) {
                        $item = trim($detail['item'] ?? '');
                        $isRejected = $detail['rejected'] ?? false;
                        $isNew = $detail['isNew'] ?? false;
                        
                        // Jika item ditolak, tandai versi terbaru sebagai rejected
                        if ($isRejected) {
                            $alasanPenolakan = trim($detail['alasan_penolakan'] ?? '');
                            
                            // Cari ID detail versi terbaru untuk item ini
                            $sqlGetLatestDetail = "SELECT id FROM pengeluaran___rencana_detail 
                                                  WHERE id_pengeluaran_rencana = ? 
                                                  AND item = ? 
                                                  AND versi = (
                                                      SELECT MAX(versi) FROM pengeluaran___rencana_detail d2
                                                      WHERE d2.id_pengeluaran_rencana = pengeluaran___rencana_detail.id_pengeluaran_rencana
                                                      AND d2.item = pengeluaran___rencana_detail.item
                                                  )
                                                  LIMIT 1";
                            $stmtGetLatestDetail = $this->db->prepare($sqlGetLatestDetail);
                            $stmtGetLatestDetail->execute([$idRencana, $item]);
                            $latestDetail = $stmtGetLatestDetail->fetch(\PDO::FETCH_ASSOC);
                            
                            if ($latestDetail) {
                                // Update versi terbaru untuk menandai sebagai rejected dengan alasan
                                $sqlUpdateRejected = "UPDATE pengeluaran___rencana_detail 
                                                     SET rejected = 1, alasan_penolakan = ? 
                                                     WHERE id = ?";
                                $stmtUpdateRejected = $this->db->prepare($sqlUpdateRejected);
                                $stmtUpdateRejected->execute([$alasanPenolakan, $latestDetail['id']]);
                            }
                            continue;
                        }
                        
                        // Jika item kosong (untuk item baru yang belum diisi), skip
                        if (empty($item)) {
                            continue;
                        }

                        $harga = floatval($detail['harga'] ?? 0);
                        $jumlah = intval($detail['jumlah'] ?? 1);
                        $nominal = $harga * $jumlah;
                        $detailAdmin = $detail['id_admin'] ?? $idAdmin;

                        // Jika item baru (belum ada di database)
                        if ($isNew || !in_array($item, $currentItems)) {
                            // Insert sebagai versi 1 (item baru, rejected = 0)
                            $sqlInsertDetail = "INSERT INTO pengeluaran___rencana_detail 
                                               (id_pengeluaran_rencana, item, harga, jumlah, nominal, versi, id_detail_asal, id_admin, rejected) 
                                               VALUES (?, ?, ?, ?, ?, 1, NULL, ?, 0)";
                            $stmtInsertDetail = $this->db->prepare($sqlInsertDetail);
                            $stmtInsertDetail->execute([
                                $idRencana, $item, $harga, $jumlah, $nominal, $detailAdmin
                            ]);
                        } else {
                            // Item sudah ada, cek apakah ada perubahan
                            $sqlCheckCurrent = "SELECT harga, jumlah FROM pengeluaran___rencana_detail 
                                              WHERE id_pengeluaran_rencana = ? AND item = ? 
                                              AND versi = (
                                                  SELECT MAX(versi) FROM pengeluaran___rencana_detail d2
                                                  WHERE d2.id_pengeluaran_rencana = pengeluaran___rencana_detail.id_pengeluaran_rencana
                                                  AND d2.item = pengeluaran___rencana_detail.item
                                              )";
                            $stmtCheckCurrent = $this->db->prepare($sqlCheckCurrent);
                            $stmtCheckCurrent->execute([$idRencana, $item]);
                            $currentDetail = $stmtCheckCurrent->fetch(\PDO::FETCH_ASSOC);
                            
                            // Jika ada perubahan, buat versi baru
                            if ($currentDetail && (
                                abs(floatval($currentDetail['harga']) - $harga) > 0.01 ||
                                intval($currentDetail['jumlah']) !== $jumlah
                            )) {
                                // Ada perubahan, buat versi baru
                                $sqlVersi = "SELECT MAX(versi) as max_versi, id as id_detail_asal 
                                            FROM pengeluaran___rencana_detail 
                                            WHERE id_pengeluaran_rencana = ? AND item = ?";
                                $stmtVersi = $this->db->prepare($sqlVersi);
                                $stmtVersi->execute([$idRencana, $item]);
                                $versiData = $stmtVersi->fetch(\PDO::FETCH_ASSOC);
                                
                                $versiBaru = ($versiData['max_versi'] ?? 0) + 1;
                                $idDetailAsal = $versiData['id_detail_asal'] ?? null;

                                $sqlInsertDetail = "INSERT INTO pengeluaran___rencana_detail 
                                                   (id_pengeluaran_rencana, item, harga, jumlah, nominal, versi, id_detail_asal, id_admin, rejected) 
                                                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)";
                                $stmtInsertDetail = $this->db->prepare($sqlInsertDetail);
                                $stmtInsertDetail->execute([
                                    $idRencana, $item, $harga, $jumlah, $nominal, 
                                    $versiBaru, $idDetailAsal, $detailAdmin
                                ]);
                            }
                            // Jika tidak ada perubahan, tidak perlu buat versi baru
                        }
                    }

                    // Update total nominal (hanya yang tidak ditolak)
                    $sqlTotal = "SELECT SUM(nominal) as total FROM pengeluaran___rencana_detail 
                                WHERE id_pengeluaran_rencana = ? 
                                AND rejected = 0
                                AND versi = (
                                    SELECT MAX(versi) FROM pengeluaran___rencana_detail d2
                                    WHERE d2.id_pengeluaran_rencana = pengeluaran___rencana_detail.id_pengeluaran_rencana
                                    AND d2.item = pengeluaran___rencana_detail.item
                                )";
                    $stmtTotal = $this->db->prepare($sqlTotal);
                    $stmtTotal->execute([$idRencana]);
                    $totalData = $stmtTotal->fetch(\PDO::FETCH_ASSOC);
                    $totalNominal = floatval($totalData['total'] ?? 0);

                    $stmtKetNow = $this->db->prepare('SELECT ket FROM pengeluaran___rencana WHERE id = ? LIMIT 1');
                    $stmtKetNow->execute([$idRencana]);
                    $ketNow = trim((string) ($stmtKetNow->fetchColumn() ?: ''));
                    if ($ketNow === 'draft') {
                        $nextKet = 'draft';
                    } elseif ($ketNow === 'pending' && $isDraftRow) {
                        $nextKet = 'pending';
                    } else {
                        $nextKet = 'di edit';
                    }

                    $sqlUpdateNominal = 'UPDATE pengeluaran___rencana SET nominal = ?, ket = ? WHERE id = ?';
                    $stmtUpdateNominal = $this->db->prepare($sqlUpdateNominal);
                    $stmtUpdateNominal->execute([$totalNominal, $nextKet, $idRencana]);
                }

                $this->db->commit();

                $stmtNew = $this->db->prepare("SELECT * FROM pengeluaran___rencana WHERE id = ?");
                $stmtNew->execute([$idRencana]);
                $newRencana = $stmtNew->fetch(\PDO::FETCH_ASSOC);
                if ($oldRencana && $newRencana) {
                    UserAktivitasLogger::log(null, $idAdmin, UserAktivitasLogger::ACTION_UPDATE, 'pengeluaran___rencana', $idRencana, $oldRencana, $newRencana, $request);
                }

                if ($newRencana && (($newRencana['ket'] ?? '') === 'draft')) {
                    $this->scheduleNotifOnDraftSaved(
                        (int) $idRencana,
                        isset($newRencana['lembaga']) ? (string) $newRencana['lembaga'] : null,
                        $idAdmin !== null ? (int) $idAdmin : null,
                        (string) ($newRencana['keterangan'] ?? ''),
                        true
                    );
                }

                return $this->jsonResponse($response, [
                    'success' => true,
                    'message' => 'Rencana berhasil diupdate'
                ], 200);

            } catch (\Exception $e) {
                $this->db->rollBack();
                throw $e;
            }

        } catch (\Exception $e) {
            error_log("Update rencana error: " . $e->getMessage());
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Gagal mengupdate rencana: ' . $e->getMessage()
            ], 500);
        }
    }

    /** @return array<string, mixed> */
    private function parseRequestJsonBody(Request $request): array
    {
        $input = $request->getParsedBody();

        return is_array($input) ? $input : [];
    }

    private function sumRencanaDetailNominalNonRejected(int $idRencana): float
    {
        $sqlDetail = "SELECT d.nominal FROM pengeluaran___rencana_detail d
                 WHERE d.id_pengeluaran_rencana = ?
                 AND COALESCE(d.rejected, 0) = 0
                 AND d.versi = (
                     SELECT MAX(versi) FROM pengeluaran___rencana_detail
                     WHERE id_pengeluaran_rencana = d.id_pengeluaran_rencana
                     AND item = d.item
                 )";
        $stmtDetail = $this->db->prepare($sqlDetail);
        $stmtDetail->execute([$idRencana]);
        $rows = $stmtDetail->fetchAll(\PDO::FETCH_ASSOC);
        $sum = 0.0;
        foreach ($rows as $r) {
            $sum += floatval($r['nominal'] ?? 0);
        }

        return $sum;
    }

    /** @return array<string, mixed>|null */
    private function fetchRencanaRowForWaAfterApprove(int $idRencana): ?array
    {
        $sql = "SELECT r.*, p.nama as admin_nama,
            peng_approve.nama as admin_approve_nama
            FROM pengeluaran___rencana r
            LEFT JOIN pengurus p ON r.id_admin = p.id
            LEFT JOIN pengeluaran peng ON peng.id_rencana = r.id
            LEFT JOIN pengurus peng_approve ON peng.id_admin_approve = peng_approve.id
            WHERE r.id = ? LIMIT 1";
        $stmt = $this->db->prepare($sql);
        $stmt->execute([$idRencana]);
        $row = $stmt->fetch(\PDO::FETCH_ASSOC);

        return $row ?: null;
    }

    /**
     * Nama pengurus untuk teks PWA; $actorId dari JWT bisa berupa pengurus.id atau users.id.
     */
    private function resolvePengurusNamaForPush(?int $actorId): string
    {
        if ($actorId === null || $actorId <= 0) {
            return '—';
        }
        $stmt = $this->db->prepare('SELECT nama FROM pengurus WHERE id = ? LIMIT 1');
        $stmt->execute([$actorId]);
        $nama = trim((string) ($stmt->fetchColumn() ?: ''));
        if ($nama !== '') {
            return $nama;
        }
        $stmt2 = $this->db->prepare('SELECT nama FROM pengurus WHERE id_user = ? LIMIT 1');
        $stmt2->execute([$actorId]);
        $nama2 = trim((string) ($stmt2->fetchColumn() ?: ''));

        return $nama2 !== '' ? $nama2 : '—';
    }

    /** Token JWT: pengurus.id atau users.id → pengurus.id (untuk exclude penerima notif). */
    private function resolveActorPengurusId(?int $actorId): ?int
    {
        if ($actorId === null || $actorId <= 0) {
            return null;
        }
        $stmt = $this->db->prepare('SELECT id FROM pengurus WHERE id = ? LIMIT 1');
        $stmt->execute([$actorId]);
        if ($stmt->fetchColumn()) {
            return $actorId;
        }
        $stmt2 = $this->db->prepare('SELECT id FROM pengurus WHERE id_user = ? LIMIT 1');
        $stmt2->execute([$actorId]);
        $row = $stmt2->fetch(\PDO::FETCH_ASSOC);

        return $row && !empty($row['id']) ? (int) $row['id'] : null;
    }

    /**
     * PWA + WA ke role dengan aksi notif draft (setelah response HTTP).
     */
    private function scheduleNotifOnDraftSaved(
        int $rencanaId,
        ?string $lembagaRaw,
        ?int $actorId,
        string $keterangan,
        bool $isUpdate
    ): void {
        $lem = $lembagaRaw !== null ? trim($lembagaRaw) : '';
        $actorPengurusId = $this->resolveActorPengurusId($actorId);
        $namaPenyimpan = $this->resolvePengurusNamaForPush($actorId);
        $rid = $rencanaId;
        $lemCopy = $lem;
        $ex = $actorPengurusId ?? 0;
        $ketCopy = $keterangan;
        $upd = $isUpdate;
        $namaCopy = $namaPenyimpan;
        $self = $this;
        DeferredHttpTask::runAfterResponse(function () use ($self, $rid, $lemCopy, $ex, $ketCopy, $upd, $namaCopy): void {
            $self->runDraftSavedNotifDelivery($rid, $lemCopy, $ex, $ketCopy, $upd, $namaCopy);
        });
    }

    private function runDraftSavedNotifDelivery(
        int $rencanaId,
        string $lembaga,
        int $excludePengurusId,
        string $keterangan,
        bool $isUpdate,
        string $namaPenyimpan
    ): void {
        $lemParam = $lembaga !== '' ? $lembaga : null;
        $recipients = PengeluaranWaNotifRecipientHelper::fetchEligiblePengurusWithWa($this->db, $lemParam, true);
        if ($excludePengurusId > 0) {
            $recipients = array_values(array_filter(
                $recipients,
                static fn (array $r): bool => (int) ($r['id'] ?? 0) !== $excludePengurusId
            ));
        }

        $ketLine = trim($keterangan) !== '' ? trim($keterangan) : '(tanpa keterangan)';
        if (strlen($ketLine) > 160) {
            $ketLine = substr($ketLine, 0, 157) . '...';
        }
        $totalDraft = $this->sumRencanaDetailNominalNonRejected($rencanaId);
        $idrDraft = RencanaPengeluaranWaHelper::formatIdr($totalDraft);
        $firstDraft = $isUpdate ? 'Memperbarui ' . $ketLine : 'Membuat ' . $ketLine;
        $body = $firstDraft . "\noleh : " . $namaPenyimpan . "\nnominal : " . $idrDraft;
        $title = $isUpdate ? 'Draft diperbarui' : 'Draft rencana';

        $excludeForPush = $excludePengurusId > 0 ? [$excludePengurusId] : [];
        $this->sendPengeluaranNotifPolicyPush(
            $lemParam,
            true,
            $excludeForPush,
            $title,
            $body,
            '/pengeluaran?tab=draft&rencana=' . $rencanaId,
            'pengeluaran-draft-' . $rencanaId . '-' . microtime(true),
            [
                'type' => 'pengeluaran_draft',
                'rencana_id' => $rencanaId,
            ],
            false,
            400
        );

        $lemLabel = $lembaga !== '' ? $lembaga : '-';
        $waMessage = RencanaPengeluaranWaHelper::buildDraftSavedMessage(
            $rencanaId,
            $keterangan,
            $lemLabel,
            $namaPenyimpan,
            $isUpdate
        );

        WhatsAppService::wakeWaServer(false);
        foreach ($recipients as $r) {
            if (!\is_array($r)) {
                continue;
            }
            $wa = trim((string) ($r['whatsapp'] ?? ''));
            if ($wa === '') {
                continue;
            }
            $idP = isset($r['id']) ? (int) $r['id'] : 0;
            $logContext = [
                'id_santri' => null,
                'id_pengurus' => $idP > 0 ? $idP : null,
                'tujuan' => 'pengurus',
                'id_pengurus_pengirim' => $excludePengurusId > 0 ? $excludePengurusId : null,
                'kategori' => 'pengeluaran_draft_notif',
                'sumber' => 'uwaba',
            ];
            WhatsAppService::sendMessage($wa, $waMessage, null, $logContext);
        }
    }

    /**
     * Web Push ke pengurus yang sama dengan daftar penerima WA (setelah filter akses fitur).
     * Kegagalan push tidak mengubah hasil pengiriman WA.
     *
     * @param list<array<string, mixed>> $filteredWaRecipients
     * @return array{success:int, failed:int}
     */
    private function sendPengeluaranWaCompanionPush(
        array $filteredWaRecipients,
        string $title,
        string $fullMessage,
        string $relativeUrl,
        string $tag,
        array $dataPayload,
        ?int $excludePengurusId,
        ?string $explicitPushBody = null
    ): array {
        $pushIds = [];
        foreach ($filteredWaRecipients as $r) {
            if (!\is_array($r)) {
                continue;
            }
            $id = isset($r['id']) ? (int) $r['id'] : 0;
            if ($id > 0) {
                $pushIds[] = $id;
            }
        }
        $pushIds = array_values(array_unique($pushIds));
        if ($excludePengurusId !== null && $excludePengurusId > 0) {
            $pushIds = array_values(array_filter(
                $pushIds,
                static fn (int $pid): bool => $pid !== $excludePengurusId
            ));
        }
        if ($pushIds === []) {
            return ['success' => 0, 'failed' => 0];
        }

        if ($explicitPushBody !== null && trim($explicitPushBody) !== '') {
            $lines = preg_split('/\r\n|\r|\n/', trim($explicitPushBody));
            $lines = array_map(
                static fn (string $l): string => preg_replace('/[ \t]+/u', ' ', trim($l)),
                $lines
            );
            $body = implode("\n", array_values(array_filter($lines, static fn (string $l): bool => $l !== '')));
            if (strlen($body) > 320) {
                $body = substr($body, 0, 317) . '...';
            }
        } else {
            $body = preg_replace('/\s+/u', ' ', trim(str_replace(["\r\n", "\r", "\n"], ' ', $fullMessage)));
            if ($body === '') {
                $body = $title;
            }
            if (strlen($body) > 180) {
                $body = substr($body, 0, 177) . '...';
            }
        }

        try {
            $push = new PushNotificationService();
            $result = $push->sendToPengurus($pushIds, $title, $body, [
                'url' => $relativeUrl,
                'icon' => '/gambar/icon/icon192.png',
                'badge' => '/gambar/icon/icon128.png',
                'tag' => $tag,
                'data' => $dataPayload,
                'requireInteraction' => false,
                'vibrate' => [200, 100, 200],
            ]);

            return [
                'success' => (int) ($result['success'] ?? 0),
                'failed' => (int) ($result['failed'] ?? 0),
            ];
        } catch (\Throwable $e) {
            error_log('Pengeluaran WA companion PWA push error: ' . $e->getMessage());

            return ['success' => 0, 'failed' => 0];
        }
    }

    /**
     * Web Push ke semua pengurus yang memenuhi kebijakan aksi notif WA untuk lembaga/konteks draft.
     * Dipakai untuk komentar & “rencana dibuka”; tidak mensyaratkan nomor WA. Pengiriman memakai
     * baris pengurus___subscription — tidak bergantung pada JWT/session penerima (push dikirim server-side).
     *
     * @param list<int> $excludePengurusIds
     * @param bool $skipUrlOnClick true = klik tidak membuka URL (jarang dipakai)
     */
    private function sendPengeluaranNotifPolicyPush(
        ?string $lembagaId,
        bool $draftWaPolicy,
        array $excludePengurusIds,
        string $title,
        string $body,
        string $relativeUrl,
        string $tag,
        array $dataPayload,
        bool $skipUrlOnClick = false,
        int $bodyMaxLen = 180
    ): void {
        $lem = $lembagaId !== null ? trim($lembagaId) : '';
        $pushIds = PengeluaranWaNotifRecipientHelper::fetchEligiblePengurusIdsForPush(
            $this->db,
            $lem !== '' ? $lem : null,
            $draftWaPolicy
        );
        $exclude = [];
        foreach ($excludePengurusIds as $x) {
            $ix = (int) $x;
            if ($ix > 0) {
                $exclude[$ix] = true;
            }
        }
        if ($exclude !== []) {
            $pushIds = array_values(array_filter(
                $pushIds,
                static fn (int $pid): bool => !isset($exclude[$pid])
            ));
        }
        if ($pushIds === []) {
            return;
        }
        $bodyOut = $body;
        $maxLen = max(80, min(2000, $bodyMaxLen));
        if (strlen($bodyOut) > $maxLen) {
            $bodyOut = substr($bodyOut, 0, $maxLen - 3) . '...';
        }
        try {
            $push = new PushNotificationService();
            $pushOpts = [
                'icon' => '/gambar/icon/icon192.png',
                'badge' => '/gambar/icon/icon128.png',
                'tag' => $tag,
                'data' => $dataPayload,
                'requireInteraction' => false,
                'vibrate' => [200, 100, 200],
            ];
            if ($skipUrlOnClick) {
                $pushOpts['skip_navigation'] = true;
                $pushOpts['url'] = '';
            } else {
                $pushOpts['url'] = $relativeUrl;
            }
            $push->sendToPengurus($pushIds, $title, $bodyOut, $pushOpts);
        } catch (\Throwable $e) {
            error_log('sendPengeluaranNotifPolicyPush: ' . $e->getMessage());
        }
    }

    /**
     * PWA ke semua pengurus berhak (notif semua lembaga + notif lembaga sesuai role), setelah approve/tolak rencana.
     */
    private function scheduleRencanaApproveRejectPolicyPwa(int $rencanaId, ?int $actorTokenUserId, bool $isReject): void
    {
        $rid = $rencanaId;
        $act = $actorTokenUserId;
        $rej = $isReject;
        $self = $this;
        DeferredHttpTask::runAfterResponse(static function () use ($self, $rid, $act, $rej): void {
            $self->runRencanaApproveRejectPolicyPwaSync($rid, $act, $rej);
        });
    }

    private function runRencanaApproveRejectPolicyPwaSync(int $rencanaId, ?int $actorTokenUserId, bool $isReject): void
    {
        $stmt = $this->db->prepare(
            'SELECT r.keterangan, r.lembaga, r.id_admin, p_pembuat.nama AS nama_pembuat
             FROM pengeluaran___rencana r
             LEFT JOIN pengurus p_pembuat ON p_pembuat.id = r.id_admin
             WHERE r.id = ? LIMIT 1'
        );
        $stmt->execute([$rencanaId]);
        $row = $stmt->fetch(\PDO::FETCH_ASSOC);
        if (!$row) {
            return;
        }

        $ket = trim((string) ($row['keterangan'] ?? ''));
        if ($ket === '') {
            $ket = '(tanpa keterangan)';
        }
        if (strlen($ket) > 160) {
            $ket = substr($ket, 0, 157) . '...';
        }

        $namaPembuat = trim((string) ($row['nama_pembuat'] ?? ''));
        if ($namaPembuat === '') {
            $namaPembuat = '—';
        }

        $namaActor = $this->resolvePengurusNamaForPush($actorTokenUserId);
        $lemRaw = isset($row['lembaga']) ? trim((string) $row['lembaga']) : '';
        $lemParam = $lemRaw !== '' ? $lemRaw : null;

        $title = $isReject ? 'Rencana ditolak' : 'Rencana diapprove';
        $first = $isReject
            ? '✗ Ditolak ' . $ket
            : '✓ Diapprove ' . $ket;
        $body = $first . "\noleh : " . $namaActor . "\ndiajukan : " . $namaPembuat;

        $actorPid = $this->resolveActorPengurusId($actorTokenUserId);
        $exclude = $actorPid !== null && $actorPid > 0 ? [$actorPid] : [];

        $relUrl = '/pengeluaran?tab=rencana&rencana=' . $rencanaId;
        $this->sendPengeluaranNotifPolicyPush(
            $lemParam,
            false,
            $exclude,
            $title,
            $body,
            $relUrl,
            'pengeluaran-rencana-' . ($isReject ? 'tolak-' : 'approve-') . $rencanaId . '-' . microtime(true),
            [
                'type' => $isReject ? 'pengeluaran_rencana_tolak' : 'pengeluaran_rencana_approve',
                'rencana_id' => $rencanaId,
            ],
            false,
            400
        );
    }

    /**
     * Isi PWA rencana (tanpa URL di teks); klik memakai URL di payload push.
     */
    private function buildRencanaPwaBodyMembuatAjuan(int $rencanaId): string
    {
        $stmt = $this->db->prepare(
            'SELECT r.keterangan, p.nama AS nama_pembuat
             FROM pengeluaran___rencana r
             LEFT JOIN pengurus p ON p.id = r.id_admin
             WHERE r.id = ? LIMIT 1'
        );
        $stmt->execute([$rencanaId]);
        $row = $stmt->fetch(\PDO::FETCH_ASSOC) ?: [];
        $ket = trim((string) ($row['keterangan'] ?? ''));
        if ($ket === '') {
            $ket = '(tanpa keterangan)';
        }
        if (strlen($ket) > 160) {
            $ket = substr($ket, 0, 157) . '...';
        }
        $nama = trim((string) ($row['nama_pembuat'] ?? ''));
        if ($nama === '') {
            $nama = '—';
        }
        $total = $this->sumRencanaDetailNominalNonRejected($rencanaId);
        $idr = RencanaPengeluaranWaHelper::formatIdr($total);

        return 'Membuat ' . $ket . "\noleh : " . $nama . "\nnominal : " . $idr;
    }

    /**
     * Kirim WA + push + log untuk POST notif-wa rencana (setelah response terkirim).
     *
     * @param list<array<string, mixed>> $recipients
     */
    private function runRencanaNotifWaDelivery(array $recipients, string $message, int $rencanaId, ?int $idPengurusPengirim): void
    {
        $pushTitleWa = 'Rencana pengeluaran';

        WhatsAppService::wakeWaServer(false);
        $successCount = 0;
        $failCount = 0;
        $recipientIds = [];
        foreach ($recipients as $r) {
            $idPengurus = isset($r['id']) ? (int) $r['id'] : 0;
            $whatsapp = isset($r['whatsapp']) ? trim((string) $r['whatsapp']) : '';
            if ($whatsapp === '') {
                $failCount++;
                continue;
            }
            $recipientIds[] = $idPengurus;
            $logContext = [
                'id_santri' => null,
                'id_pengurus' => $idPengurus > 0 ? $idPengurus : null,
                'tujuan' => 'pengurus',
                'id_pengurus_pengirim' => $idPengurusPengirim,
                'kategori' => 'pengeluaran_rencana_notif',
                'sumber' => 'uwaba',
            ];
            $result = WhatsAppService::sendMessage($whatsapp, $message, null, $logContext);
            $actuallySent = !empty($result['success']) && !WhatsAppService::deliveryWasNotActuallySent($result);
            if ($actuallySent) {
                $successCount++;
            } else {
                $failCount++;
            }
        }

        $pushBodyClean = $this->buildRencanaPwaBodyMembuatAjuan($rencanaId);
        $pushStats = $this->sendPengeluaranWaCompanionPush(
            $recipients,
            $pushTitleWa,
            $message,
            '/pengeluaran?tab=rencana&rencana=' . $rencanaId,
            'pengeluaran-rencana-notif-wa-' . $rencanaId,
            [
                'type' => 'pengeluaran_rencana_wa',
                'rencana_id' => $rencanaId,
            ],
            $idPengurusPengirim,
            $pushBodyClean
        );

        UserAktivitasLogger::log(
            null,
            $idPengurusPengirim,
            UserAktivitasLogger::ACTION_UPDATE,
            'pengeluaran___rencana',
            $rencanaId,
            null,
            [
                'notif_wa' => true,
                'notif_push' => true,
                'success_count' => $successCount,
                'fail_count' => $failCount,
                'push_success' => $pushStats['success'],
                'push_failed' => $pushStats['failed'],
                'recipient_ids' => $recipientIds,
            ],
            null
        );
    }

    /**
     * Kirim WA + push + log untuk POST notif-wa baris pengeluaran (setelah response terkirim).
     *
     * @param list<array<string, mixed>> $recipients
     */
    private function runPengeluaranNotifWaDelivery(array $recipients, string $message, int $pengeluaranId, ?int $idPengurusPengirim): void
    {
        $stmtJ = $this->db->prepare('SELECT keterangan FROM pengeluaran WHERE id = ? LIMIT 1');
        $stmtJ->execute([$pengeluaranId]);
        $ketPush = trim((string) ($stmtJ->fetchColumn() ?: ''));
        if ($ketPush === '') {
            $ketPush = 'Pengeluaran';
        }
        if (strlen($ketPush) > 44) {
            $ketPush = substr($ketPush, 0, 41) . '...';
        }
        $pushTitleP = 'Notifikasi - ' . $ketPush;

        WhatsAppService::wakeWaServer(false);
        $successCount = 0;
        $failCount = 0;
        $recipientIds = [];
        foreach ($recipients as $r) {
            $idPengurus = isset($r['id']) ? (int) $r['id'] : 0;
            $whatsapp = isset($r['whatsapp']) ? trim((string) $r['whatsapp']) : '';
            if ($whatsapp === '') {
                $failCount++;
                continue;
            }
            $recipientIds[] = $idPengurus;
            $logContext = [
                'id_santri' => null,
                'id_pengurus' => $idPengurus > 0 ? $idPengurus : null,
                'tujuan' => 'pengurus',
                'id_pengurus_pengirim' => $idPengurusPengirim,
                'kategori' => 'pengeluaran_notif',
                'sumber' => 'uwaba',
            ];
            $result = WhatsAppService::sendMessage($whatsapp, $message, null, $logContext);
            $actuallySent = !empty($result['success']) && !WhatsAppService::deliveryWasNotActuallySent($result);
            if ($actuallySent) {
                $successCount++;
            } else {
                $failCount++;
            }
        }

        $pushStats = $this->sendPengeluaranWaCompanionPush(
            $recipients,
            $pushTitleP,
            $message,
            '/pengeluaran?tab=pengeluaran&pengeluaran=' . $pengeluaranId,
            'pengeluaran-notif-wa-' . $pengeluaranId,
            [
                'type' => 'pengeluaran_wa',
                'pengeluaran_id' => $pengeluaranId,
            ],
            $idPengurusPengirim,
            null
        );

        UserAktivitasLogger::log(
            null,
            $idPengurusPengirim,
            UserAktivitasLogger::ACTION_UPDATE,
            'pengeluaran',
            $pengeluaranId,
            null,
            [
                'notif_wa' => true,
                'notif_push' => true,
                'success_count' => $successCount,
                'fail_count' => $failCount,
                'push_success' => $pushStats['success'],
                'push_failed' => $pushStats['failed'],
                'recipient_ids' => $recipientIds,
            ],
            null
        );
    }

    /**
     * Kirim WA rencana (approve/reject): filter dulu; pengiriman setelah response HTTP.
     *
     * @param list<array<string, mixed>> $recipients
     * @return array<string, mixed>
     */
    private function deliverRencanaWaRecipients(
        string $message,
        array $recipients,
        ?int $idPengurusPengirim,
        int $rencanaId,
        bool $isReject = false
    ): array {
        $stmtL = $this->db->prepare('SELECT lembaga, ket FROM pengeluaran___rencana WHERE id = ? LIMIT 1');
        $stmtL->execute([$rencanaId]);
        $rowL = $stmtL->fetch(\PDO::FETCH_ASSOC) ?: [];
        $lem = trim((string) ($rowL['lembaga'] ?? ''));
        $isDraftWa = (($rowL['ket'] ?? '') === 'draft');
        $recipients = PengeluaranWaNotifRecipientHelper::filterRecipients(
            $this->db,
            $lem !== '' ? $lem : null,
            $recipients,
            $isDraftWa
        );

        if ($recipients === []) {
            return [
                'success_count' => 0,
                'fail_count' => 0,
                'push' => ['success' => 0, 'failed' => 0],
            ];
        }

        $messageCopy = $message;
        $recipientsCopy = $recipients;
        $idSender = $idPengurusPengirim;
        $rid = $rencanaId;
        $rejectFlag = $isReject;
        $self = $this;
        DeferredHttpTask::runAfterResponse(function () use ($self, $messageCopy, $recipientsCopy, $idSender, $rid, $rejectFlag): void {
            $self->deliverRencanaWaRecipientsSync($messageCopy, $recipientsCopy, $idSender, $rid, $rejectFlag);
        });

        return [
            'queued' => true,
            'async' => true,
        ];
    }

    /**
     * @param list<array<string, mixed>> $recipients Sudah difilter policy.
     */
    private function deliverRencanaWaRecipientsSync(
        string $message,
        array $recipients,
        ?int $idPengurusPengirim,
        int $rencanaId,
        bool $isReject
    ): void {
        WhatsAppService::wakeWaServer(false);
        $successCount = 0;
        $failCount = 0;
        $recipientIds = [];
        foreach ($recipients as $r) {
            if (!is_array($r)) {
                continue;
            }
            $idPengurus = isset($r['id']) ? (int) $r['id'] : 0;
            $whatsapp = isset($r['whatsapp']) ? trim((string) $r['whatsapp']) : '';
            if ($whatsapp === '') {
                $failCount++;
                continue;
            }
            $recipientIds[] = $idPengurus;
            $logContext = [
                'id_santri' => null,
                'id_pengurus' => $idPengurus > 0 ? $idPengurus : null,
                'tujuan' => 'pengurus',
                'id_pengurus_pengirim' => $idPengurusPengirim,
                'kategori' => 'pengeluaran_rencana_notif',
                'sumber' => 'uwaba',
            ];
            $result = WhatsAppService::sendMessage($whatsapp, $message, null, $logContext);
            $actuallySent = !empty($result['success']) && !WhatsAppService::deliveryWasNotActuallySent($result);
            if ($actuallySent) {
                $successCount++;
            } else {
                $failCount++;
            }
        }

        if ($successCount + $failCount > 0) {
            UserAktivitasLogger::log(
                null,
                $idPengurusPengirim,
                UserAktivitasLogger::ACTION_UPDATE,
                'pengeluaran___rencana',
                $rencanaId,
                null,
                [
                    'notif_wa' => true,
                    'notif_push' => false,
                    'success_count' => $successCount,
                    'fail_count' => $failCount,
                    'push_success' => 0,
                    'push_failed' => 0,
                    'recipient_ids' => $recipientIds,
                    'via' => 'rencana_approve_reject_wa',
                    'reject_flow' => $isReject,
                ],
                null
            );
        }
    }

    /**
     * GET /api/pengeluaran/rencana/wa-wake — bangunkan server WA (Node) seperti di pendaftaran, sebelum kirim notif.
     * Akses: grup keuangan (sama route /api/pengeluaran).
     */
    public function getRencanaWaWake(Request $request, Response $response): Response
    {
        $result = WhatsAppService::wakeWaServer();

        return $this->jsonResponse($response, [
            'success' => $result['success'],
            'message' => $result['message'],
        ], 200);
    }

    /**
     * POST /api/pengeluaran/rencana/{id}/approve - Approve rencana (admin lain, bukan yang membuat)
     * Body opsional: { "recipients": [ { "id": pengurus_id, "whatsapp": "08..." } ] } — kirim WA dari backend (template + wake).
     */
    public function approveRencana(Request $request, Response $response, array $args): Response
    {
        try {
            $idRencana = $args['id'] ?? null;
            $user = $request->getAttribute('user');
            
            $idAdminApprove = $user['user_id'] ?? $user['id'] ?? null;
            $input = $this->parseRequestJsonBody($request);
            $waRecipients = isset($input['recipients']) && is_array($input['recipients']) ? $input['recipients'] : [];

            if (!$idRencana) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'ID rencana tidak valid'
                ], 400);
            }

            $denyA = $this->pengeluaranDenyUnlessAction($request, $response, 'action.pengeluaran.rencana.approve');
            if ($denyA !== null) {
                return $denyA;
            }

            // Cek rencana
            $sqlRencana = "SELECT id_admin, ket, lembaga FROM pengeluaran___rencana WHERE id = ?";
            $stmtRencana = $this->db->prepare($sqlRencana);
            $stmtRencana->execute([$idRencana]);
            $rencana = $stmtRencana->fetch(\PDO::FETCH_ASSOC);

            if (!$rencana) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Rencana tidak ditemukan'
                ], 404);
            }

            $denyLb = $this->assertRencanaLembagaRow($request, $response, isset($rencana['lembaga']) ? (string) $rencana['lembaga'] : null, 'rencana');
            if ($denyLb !== null) {
                return $denyLb;
            }

            // Validasi: admin yang membuat tidak bisa approve sendiri
            if ($rencana['id_admin'] == $idAdminApprove) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Admin yang membuat rencana tidak dapat meng-approve sendiri'
                ], 403);
            }

            // Validasi status
            if ($rencana['ket'] === 'di approve') {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Rencana sudah di-approve sebelumnya'
                ], 400);
            }

            if ($rencana['ket'] === 'ditolak') {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Rencana yang sudah ditolak tidak dapat di-approve'
                ], 400);
            }

            $this->db->beginTransaction();

            try {
                // Update status rencana
                $sqlUpdate = "UPDATE pengeluaran___rencana SET ket = 'di approve' WHERE id = ?";
                $stmtUpdate = $this->db->prepare($sqlUpdate);
                $stmtUpdate->execute([$idRencana]);

                // Get detail items (versi terbaru, hanya yang tidak ditolak)
                $sqlDetail = "SELECT d.* FROM pengeluaran___rencana_detail d
                             WHERE d.id_pengeluaran_rencana = ?
                             AND COALESCE(d.rejected, 0) = 0
                             AND d.versi = (
                                 SELECT MAX(versi) FROM pengeluaran___rencana_detail 
                                 WHERE id_pengeluaran_rencana = d.id_pengeluaran_rencana 
                                 AND item = d.item
                             )";
                $stmtDetail = $this->db->prepare($sqlDetail);
                $stmtDetail->execute([$idRencana]);
                $details = $stmtDetail->fetchAll(\PDO::FETCH_ASSOC);

                // Hitung total nominal dari detail yang tidak ditolak
                $totalNominalApproved = 0;
                foreach ($details as $detail) {
                    $totalNominalApproved += floatval($detail['nominal'] ?? 0);
                }

                // Insert ke tabel pengeluaran (yang sudah di-approve) dengan total yang benar
                $sqlPengeluaran = "INSERT INTO pengeluaran (keterangan, kategori, lembaga, sumber_uang, id_admin, nominal, hijriyah, tahun_ajaran, id_admin_approve, id_rencana) 
                                  SELECT keterangan, kategori, lembaga, sumber_uang, id_admin, ?, hijriyah, tahun_ajaran, ?, id 
                                  FROM pengeluaran___rencana 
                                  WHERE id = ?";
                $stmtPengeluaran = $this->db->prepare($sqlPengeluaran);
                $stmtPengeluaran->execute([$totalNominalApproved, $idAdminApprove, $idRencana]);
                $idPengeluaran = $this->db->lastInsertId();

                // Insert detail items ke tabel pengeluaran___detail
                $sqlInsertDetail = "INSERT INTO pengeluaran___detail 
                                   (id_pengeluaran, item, harga, jumlah, nominal, id_admin) 
                                   VALUES (?, ?, ?, ?, ?, ?)";
                $stmtInsertDetail = $this->db->prepare($sqlInsertDetail);

                foreach ($details as $detail) {
                    $stmtInsertDetail->execute([
                        $idPengeluaran,
                        $detail['item'],
                        $detail['harga'],
                        $detail['jumlah'],
                        $detail['nominal'],
                        $detail['id_admin']
                    ]);
                }

                $this->db->commit();

                $this->scheduleRencanaApproveRejectPolicyPwa(
                    (int) $idRencana,
                    $idAdminApprove !== null ? (int) $idAdminApprove : null,
                    false
                );

                $data = ['id_pengeluaran' => $idPengeluaran];
                if (!empty($waRecipients)) {
                    $rowWa = $this->fetchRencanaRowForWaAfterApprove((int) $idRencana);
                    if ($rowWa !== null) {
                        $msg = RencanaPengeluaranWaHelper::buildApproveMessage($rowWa, $totalNominalApproved);
                        $idPengirim = $idAdminApprove !== null ? (int) $idAdminApprove : null;
                        $data['wa_notif'] = $this->deliverRencanaWaRecipients($msg, $waRecipients, $idPengirim, (int) $idRencana);
                    }
                }

                return $this->jsonResponse($response, [
                    'success' => true,
                    'message' => 'Rencana berhasil di-approve dan dipindahkan ke pengeluaran',
                    'data' => $data,
                ], 200);

            } catch (\Exception $e) {
                $this->db->rollBack();
                throw $e;
            }

        } catch (\Exception $e) {
            error_log("Approve rencana error: " . $e->getMessage());
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Gagal meng-approve rencana: ' . $e->getMessage()
            ], 500);
        }
    }

    /**
     * POST /api/pengeluaran/rencana/{id}/reject - Reject rencana
     * Body opsional: { "recipients": [ { "id": pengurus_id, "whatsapp": "08..." } ] } — kirim WA dari backend (template + wake).
     */
    public function rejectRencana(Request $request, Response $response, array $args): Response
    {
        try {
            $idRencana = $args['id'] ?? null;
            $user = $request->getAttribute('user');
            $idAdminReject = $user['user_id'] ?? $user['id'] ?? null;
            $input = $this->parseRequestJsonBody($request);
            $waRecipients = isset($input['recipients']) && is_array($input['recipients']) ? $input['recipients'] : [];

            if (!$idRencana) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'ID rencana tidak valid'
                ], 400);
            }

            $denyA = $this->pengeluaranDenyUnlessAction($request, $response, 'action.pengeluaran.rencana.tolak');
            if ($denyA !== null) {
                return $denyA;
            }

            $sqlCheck = "SELECT r.*, p.nama as admin_nama FROM pengeluaran___rencana r
                         LEFT JOIN pengurus p ON r.id_admin = p.id WHERE r.id = ?";
            $stmtCheck = $this->db->prepare($sqlCheck);
            $stmtCheck->execute([$idRencana]);
            $rencana = $stmtCheck->fetch(\PDO::FETCH_ASSOC);

            if (!$rencana) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Rencana tidak ditemukan'
                ], 404);
            }

            $denyLb = $this->assertRencanaLembagaRow($request, $response, isset($rencana['lembaga']) ? (string) $rencana['lembaga'] : null, 'rencana');
            if ($denyLb !== null) {
                return $denyLb;
            }

            if ($rencana['ket'] === 'di approve') {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Rencana yang sudah di-approve tidak dapat ditolak'
                ], 400);
            }

            $totalNom = $this->sumRencanaDetailNominalNonRejected((int) $idRencana);
            $namaReject = '';
            if ($idAdminReject) {
                $stmtN = $this->db->prepare('SELECT nama FROM pengurus WHERE id = ? LIMIT 1');
                $stmtN->execute([(int) $idAdminReject]);
                $namaReject = (string) ($stmtN->fetchColumn() ?: '');
            }

            $sqlUpdate = "UPDATE pengeluaran___rencana SET ket = 'ditolak' WHERE id = ?";
            $stmtUpdate = $this->db->prepare($sqlUpdate);
            $stmtUpdate->execute([$idRencana]);

            $this->scheduleRencanaApproveRejectPolicyPwa(
                (int) $idRencana,
                $idAdminReject !== null ? (int) $idAdminReject : null,
                true
            );

            $payload = [];
            if (!empty($waRecipients)) {
                $msg = RencanaPengeluaranWaHelper::buildRejectMessage($rencana, $totalNom, $namaReject);
                $idPengirim = $idAdminReject !== null ? (int) $idAdminReject : null;
                $payload['wa_notif'] = $this->deliverRencanaWaRecipients($msg, $waRecipients, $idPengirim, (int) $idRencana, true);
            }

            return $this->jsonResponse($response, [
                'success' => true,
                'message' => 'Rencana berhasil ditolak',
                'data' => $payload,
            ], 200);

        } catch (\Exception $e) {
            error_log("Reject rencana error: " . $e->getMessage());
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Gagal menolak rencana: ' . $e->getMessage()
            ], 500);
        }
    }

    /**
     * GET /api/pengeluaran - List pengeluaran yang sudah di-approve
     */
    public function getPengeluaranList(Request $request, Response $response): Response
    {
        try {
            $queryParams = $request->getQueryParams();
            $kategori = $queryParams['kategori'] ?? null;
            $lembaga = $queryParams['lembaga'] ?? null;
            $tanggalDari = $queryParams['tanggal_dari'] ?? null;
            $tanggalSampai = $queryParams['tanggal_sampai'] ?? null;
            $page = isset($queryParams['page']) ? (int)$queryParams['page'] : 1;
            $limit = isset($queryParams['limit']) ? (int)$queryParams['limit'] : 20;
            $offset = ($page - 1) * $limit;

            $whereClause = '';
            $params = [];
            $conditions = [];

            if ($kategori) {
                $conditions[] = "p.kategori = ?";
                $params[] = $kategori;
            }
            
            if ($lembaga) {
                $conditions[] = "p.lembaga = ?";
                $params[] = $lembaga;
            }

            if ($tanggalDari) {
                $conditions[] = "DATE(p.tanggal_dibuat) >= ?";
                $params[] = $tanggalDari;
            }

            if ($tanggalSampai) {
                $conditions[] = "DATE(p.tanggal_dibuat) <= ?";
                $params[] = $tanggalSampai;
            }

            $this->appendPengeluaranLembagaScope($request, $conditions, $params);

            if (!empty($conditions)) {
                $whereClause = "WHERE " . implode(" AND ", $conditions);
            }

            // Get total
            $sqlCount = "SELECT COUNT(*) as total FROM pengeluaran p {$whereClause}";
            $stmtCount = $this->db->prepare($sqlCount);
            $stmtCount->execute($params);
            $total = $stmtCount->fetch(\PDO::FETCH_ASSOC)['total'];

            // Get list dengan nama penerima lengkap (termasuk gelar)
            $sql = "SELECT p.*, 
                    peng.nama as admin_nama, 
                    CONCAT(
                        IFNULL(CONCAT(penerima.gelar_awal, ' '), ''),
                        IFNULL(penerima.nama, ''),
                        IFNULL(CONCAT(' ', penerima.gelar_akhir), '')
                    ) as penerima_nama
                    FROM pengeluaran p 
                    LEFT JOIN pengurus peng ON p.id_admin = peng.id 
                    LEFT JOIN pengurus penerima ON p.id_penerima = penerima.id
                    {$whereClause}
                    ORDER BY p.tanggal_dibuat DESC 
                    LIMIT ? OFFSET ?";
            $params[] = $limit;
            $params[] = $offset;
            $stmt = $this->db->prepare($sql);
            $stmt->execute($params);
            $pengeluaran = $stmt->fetchAll(\PDO::FETCH_ASSOC);
            
            // Bersihkan nama penerima dari spasi berlebih
            foreach ($pengeluaran as &$item) {
                if (!empty($item['penerima_nama'])) {
                    $item['penerima_nama'] = trim($item['penerima_nama']);
                    // Hapus spasi ganda
                    $item['penerima_nama'] = preg_replace('/\s+/', ' ', $item['penerima_nama']);
                }
            }
            unset($item);

            return $this->jsonResponse($response, [
                'success' => true,
                'data' => [
                    'pengeluaran' => $pengeluaran,
                    'pagination' => [
                        'page' => $page,
                        'limit' => $limit,
                        'total' => (int)$total,
                        'total_pages' => ceil($total / $limit)
                    ]
                ]
            ], 200);

        } catch (\Exception $e) {
            error_log("Get pengeluaran list error: " . $e->getMessage());
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Gagal mengambil daftar pengeluaran: ' . $e->getMessage()
            ], 500);
        }
    }

    /**
     * GET /api/pengeluaran/{id} - Detail pengeluaran dengan items
     */
    public function getPengeluaranDetail(Request $request, Response $response, array $args): Response
    {
        try {
            $idPengeluaran = $args['id'] ?? null;

            if (!$idPengeluaran) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'ID pengeluaran tidak valid'
                ], 400);
            }

            // Get pengeluaran dengan info admin yang membuat, approve, dan penerima
            $sqlPengeluaran = "SELECT p.*, 
                              peng.nama as admin_nama,
                              peng_approve.nama as admin_approve_nama,
                              penerima.nama as penerima_nama
                              FROM pengeluaran p 
                              LEFT JOIN pengurus peng ON p.id_admin = peng.id 
                              LEFT JOIN pengurus peng_approve ON p.id_admin_approve = peng_approve.id 
                              LEFT JOIN pengurus penerima ON p.id_penerima = penerima.id
                              WHERE p.id = ?";
            $stmtPengeluaran = $this->db->prepare($sqlPengeluaran);
            $stmtPengeluaran->execute([$idPengeluaran]);
            $pengeluaran = $stmtPengeluaran->fetch(\PDO::FETCH_ASSOC);

            if (!$pengeluaran) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Pengeluaran tidak ditemukan'
                ], 404);
            }

            $denyPl = $this->assertPengeluaranLembagaRow($request, $response, isset($pengeluaran['lembaga']) ? (string) $pengeluaran['lembaga'] : null);
            if ($denyPl !== null) {
                return $denyPl;
            }

            // Get detail items - ambil dari rencana detail untuk mendapatkan versi dan rejected
            // Jika ada id_rencana, ambil dari rencana_detail, jika tidak ambil dari pengeluaran_detail
            if (!empty($pengeluaran['id_rencana'])) {
                $sqlDetail = "SELECT d.*, p.nama as admin_nama,
                             COALESCE(d.rejected, 0) as rejected,
                             d.alasan_penolakan
                             FROM pengeluaran___rencana_detail d
                             LEFT JOIN pengurus p ON d.id_admin = p.id
                             WHERE d.id_pengeluaran_rencana = ?
                             AND d.versi = (
                                 SELECT MAX(versi) FROM pengeluaran___rencana_detail d2
                                 WHERE d2.id_pengeluaran_rencana = d.id_pengeluaran_rencana
                                 AND d2.item = d.item
                             )
                             ORDER BY d.item";
                $stmtDetail = $this->db->prepare($sqlDetail);
                $stmtDetail->execute([$pengeluaran['id_rencana']]);
            } else {
                // Fallback jika tidak ada id_rencana (seharusnya tidak terjadi)
                $sqlDetail = "SELECT d.*, p.nama as admin_nama,
                             0 as rejected,
                             NULL as alasan_penolakan,
                             1 as versi
                             FROM pengeluaran___detail d
                             LEFT JOIN pengurus p ON d.id_admin = p.id
                             WHERE d.id_pengeluaran = ?
                             ORDER BY d.item";
                $stmtDetail = $this->db->prepare($sqlDetail);
                $stmtDetail->execute([$idPengeluaran]);
            }
            $details = $stmtDetail->fetchAll(\PDO::FETCH_ASSOC);

            $pengeluaran['details'] = $details;

            // Get history edit dan rejected details dari rencana jika ada
            $editHistory = [];
            $rejectedDetails = [];
            if (!empty($pengeluaran['id_rencana'])) {
                // Ambil semua versi detail dari rencana untuk tracking edit
                // Setiap versi menyimpan id_admin yang mengedit
                $sqlHistory = "SELECT rd.*, 
                              p.nama as admin_nama,
                              p.id as admin_id,
                              rd.versi,
                              rd.id_admin,
                              COALESCE(rd.rejected, 0) as rejected,
                              (SELECT COUNT(*) FROM pengeluaran___rencana_detail 
                               WHERE id_pengeluaran_rencana = rd.id_pengeluaran_rencana 
                               AND item = rd.item) as total_versi
                              FROM pengeluaran___rencana_detail rd
                              LEFT JOIN pengurus p ON rd.id_admin = p.id
                              WHERE rd.id_pengeluaran_rencana = ?
                              ORDER BY rd.item, rd.versi ASC";
                $stmtHistory = $this->db->prepare($sqlHistory);
                $stmtHistory->execute([$pengeluaran['id_rencana']]);
                $historyDetails = $stmtHistory->fetchAll(\PDO::FETCH_ASSOC);
                
                // Group by item untuk melihat history edit per item
                $historyByItem = [];
                foreach ($historyDetails as $hist) {
                    $item = $hist['item'];
                    if (!isset($historyByItem[$item])) {
                        $historyByItem[$item] = [];
                    }
                    $historyByItem[$item][] = $hist;
                }
                $editHistory = $historyByItem;
                
                // Ambil detail yang ditolak (versi terbaru yang ditolak)
                $sqlRejected = "SELECT rd.*, 
                               p.nama as admin_nama,
                               rd.alasan_penolakan
                               FROM pengeluaran___rencana_detail rd
                               LEFT JOIN pengurus p ON rd.id_admin = p.id
                               WHERE rd.id_pengeluaran_rencana = ?
                               AND COALESCE(rd.rejected, 0) = 1
                               AND rd.versi = (
                                   SELECT MAX(versi) FROM pengeluaran___rencana_detail d2
                                   WHERE d2.id_pengeluaran_rencana = rd.id_pengeluaran_rencana
                                   AND d2.item = rd.item
                               )
                               ORDER BY rd.item";
                $stmtRejected = $this->db->prepare($sqlRejected);
                $stmtRejected->execute([$pengeluaran['id_rencana']]);
                $rejectedDetails = $stmtRejected->fetchAll(\PDO::FETCH_ASSOC);
            }

            $pengeluaran['edit_history'] = $editHistory;
            $pengeluaran['rejected_details'] = $rejectedDetails;

            // Get id_rencana dari pengeluaran untuk mengambil komentar dan viewer
            $idRencana = $pengeluaran['id_rencana'] ?? null;
            
            if ($idRencana) {
                // Track viewer (id_rencana); PWA ke audiens notif WA pada kunjungan pertama per admin per rencana
                $user = $request->getAttribute('user');
                $idAdmin = $user['user_id'] ?? $user['id'] ?? null;
                if ($idAdmin) {
                    try {
                        $stmtHad = $this->db->prepare('SELECT 1 FROM pengeluaran___viewer WHERE id_rencana = ? AND id_admin = ? LIMIT 1');
                        $stmtHad->execute([$idRencana, $idAdmin]);
                        $alreadyViewed = $stmtHad->fetch() !== false;

                        $waktuIndonesia = (new \DateTime('now', new \DateTimeZone('Asia/Jakarta')))->format('Y-m-d H:i:s');
                        $sqlViewer = "INSERT INTO pengeluaran___viewer (id_rencana, id_admin, jumlah_view)
                                      VALUES (?, ?, 1)
                                      ON DUPLICATE KEY UPDATE 
                                        tanggal_update = ?,
                                        jumlah_view = jumlah_view + 1";
                        $stmtViewer = $this->db->prepare($sqlViewer);
                        $stmtViewer->execute([$idRencana, $idAdmin, $waktuIndonesia]);

                        if (!$alreadyViewed) {
                            $stmtKet = $this->db->prepare('SELECT ket FROM pengeluaran___rencana WHERE id = ? LIMIT 1');
                            $stmtKet->execute([$idRencana]);
                            $renKet = (string) ($stmtKet->fetchColumn() ?: '');

                            $stmtVn = $this->db->prepare('SELECT nama FROM pengurus WHERE id = ? LIMIT 1');
                            $stmtVn->execute([(int) $idAdmin]);
                            $viewerNama = trim((string) ($stmtVn->fetchColumn() ?: ''));
                            $ketLabel = (string) ($pengeluaran['keterangan'] ?? 'Pengeluaran');
                            if (strlen($ketLabel) > 80) {
                                $ketLabel = substr($ketLabel, 0, 77) . '...';
                            }
                            $who = $viewerNama !== '' ? $viewerNama : 'Seorang admin';
                            $lembagaPush = isset($pengeluaran['lembaga']) ? trim((string) $pengeluaran['lembaga']) : '';
                            $isDraftPush = ($renKet === 'draft');
                            $idAdminInt = (int) $idAdmin;
                            $idRencanaInt = (int) $idRencana;
                            $idPengeluaranInt = (int) $idPengeluaran;
                            $self = $this;
                            $titleBukaP = 'Pengeluaran dibuka - ' . $ketLabel;
                            $bodyBukaP = $who . ' melihat detail pengeluaran';
                            DeferredHttpTask::runAfterResponse(function () use (
                                $self,
                                $lembagaPush,
                                $isDraftPush,
                                $idAdminInt,
                                $titleBukaP,
                                $bodyBukaP,
                                $idRencanaInt,
                                $idPengeluaranInt
                            ): void {
                                $self->sendPengeluaranNotifPolicyPush(
                                    $lembagaPush !== '' ? $lembagaPush : null,
                                    $isDraftPush,
                                    [$idAdminInt],
                                    $titleBukaP,
                                    $bodyBukaP,
                                    '/pengeluaran?tab=pengeluaran&pengeluaran=' . $idPengeluaranInt,
                                    'pengeluaran-dilihat-' . $idRencanaInt . '-' . $idAdminInt . '-' . microtime(true),
                                    [
                                        'type' => 'pengeluaran_dilihat',
                                        'rencana_id' => $idRencanaInt,
                                        'pengeluaran_id' => $idPengeluaranInt,
                                    ]
                                );
                            });
                        }
                    } catch (\Exception $e) {
                        // Log error tapi jangan gagalkan response
                        error_log("Track viewer error: " . $e->getMessage());
                    }
                }

                // Get komentar (berdasarkan id_rencana)
                $sqlKomentar = "SELECT k.*, p.nama as admin_nama,
                               (SELECT r.`key` FROM pengurus___role pr INNER JOIN role r ON pr.role_id = r.id WHERE pr.pengurus_id = p.id ORDER BY CASE r.`key` WHEN 'super_admin' THEN 1 WHEN 'admin_uwaba' THEN 2 WHEN 'admin_lembaga' THEN 3 ELSE 4 END LIMIT 1) AS level
                               FROM pengeluaran___komentar k
                               LEFT JOIN pengurus p ON k.id_admin = p.id
                               WHERE k.id_rencana = ?
                               ORDER BY k.tanggal_dibuat DESC";
                $stmtKomentar = $this->db->prepare($sqlKomentar);
                $stmtKomentar->execute([$idRencana]);
                $komentar = $stmtKomentar->fetchAll(\PDO::FETCH_ASSOC);
                
                // Ambil semua role untuk setiap admin dan gabungkan
                foreach ($komentar as &$k) {
                    $sqlRole = "SELECT r.label, r.`key`
                               FROM pengurus___role pr
                               INNER JOIN role r ON pr.role_id = r.id
                               WHERE pr.pengurus_id = ?
                               ORDER BY CASE r.`key`
                                   WHEN 'super_admin' THEN 1
                                   WHEN 'admin_uwaba' THEN 2
                                   WHEN 'admin_lembaga' THEN 3
                                   ELSE 4
                               END";
                    $stmtRole = $this->db->prepare($sqlRole);
                    $stmtRole->execute([$k['id_admin']]);
                    $roles = $stmtRole->fetchAll(\PDO::FETCH_ASSOC);
                    
                    if (!empty($roles)) {
                        // Gabungkan semua role dengan pemisah " - "
                        $roleLabels = array_map(function($r) {
                            return $r['label'];
                        }, $roles);
                        $k['admin_role'] = implode(' - ', $roleLabels);
                    } else {
                        // Fallback ke level jika tidak ada role
                        $k['admin_role'] = $k['level'] ?? 'User';
                    }
                }
                unset($k);
                
                $pengeluaran['komentar'] = $komentar;

                // Get viewer list (berdasarkan id_rencana)
                $sqlViewerList = "SELECT v.*, p.nama as admin_nama
                                 FROM pengeluaran___viewer v
                                 LEFT JOIN pengurus p ON v.id_admin = p.id
                                 WHERE v.id_rencana = ?
                                 ORDER BY v.tanggal_dilihat DESC";
                $stmtViewerList = $this->db->prepare($sqlViewerList);
                $stmtViewerList->execute([$idRencana]);
                $viewers = $stmtViewerList->fetchAll(\PDO::FETCH_ASSOC);
                $pengeluaran['viewers'] = $viewers;
            } else {
                $pengeluaran['komentar'] = [];
                $pengeluaran['viewers'] = [];
            }

            return $this->jsonResponse($response, [
                'success' => true,
                'data' => $pengeluaran
            ], 200);

        } catch (\Exception $e) {
            error_log("Get pengeluaran detail error: " . $e->getMessage());
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Gagal mengambil detail pengeluaran: ' . $e->getMessage()
            ], 500);
        }
    }

    /**
     * POST /api/pengeluaran/rencana/{id}/komentar - Tambah komentar pada rencana pengeluaran
     */
    public function createKomentar(Request $request, Response $response, array $args): Response
    {
        try {
            $idRencana = $args['id'] ?? null;
            $data = $request->getParsedBody();
            $data = is_array($data) ? TextSanitizer::sanitizeStringValues($data, []) : [];
            $user = $request->getAttribute('user');
            
            $idAdmin = $user['user_id'] ?? $user['id'] ?? null;
            $komentar = trim($data['komentar'] ?? '');

            if (!$idRencana) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'ID rencana tidak valid'
                ], 400);
            }

            if (empty($komentar)) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Komentar tidak boleh kosong'
                ], 400);
            }

            // Cek apakah rencana ada
            $sqlCheck = 'SELECT id, ket, keterangan, lembaga FROM pengeluaran___rencana WHERE id = ?';
            $stmtCheck = $this->db->prepare($sqlCheck);
            $stmtCheck->execute([$idRencana]);
            $rencanaData = $stmtCheck->fetch(\PDO::FETCH_ASSOC);
            
            if (!$rencanaData) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Rencana tidak ditemukan'
                ], 404);
            }

            // Cek apakah rencana sudah di-approve (tidak bisa tambah komentar)
            if ($rencanaData['ket'] === 'di approve') {
                // Cek apakah sudah jadi pengeluaran
                $sqlCheckPengeluaran = "SELECT id FROM pengeluaran WHERE id_rencana = ?";
                $stmtCheckPengeluaran = $this->db->prepare($sqlCheckPengeluaran);
                $stmtCheckPengeluaran->execute([$idRencana]);
                if ($stmtCheckPengeluaran->fetch()) {
                    return $this->jsonResponse($response, [
                        'success' => false,
                        'message' => 'Pengeluaran yang sudah di-approve tidak dapat ditambahkan komentar'
                    ], 403);
                }
            }

            // Insert komentar
            $sql = "INSERT INTO pengeluaran___komentar (id_rencana, id_admin, komentar)
                    VALUES (?, ?, ?)";
            $stmt = $this->db->prepare($sql);
            $stmt->execute([$idRencana, $idAdmin, $komentar]);
            $komentarId = $this->db->lastInsertId();

            // Get komentar yang baru dibuat dengan info admin
            $sqlGet = "SELECT k.*, p.nama as admin_nama,
                      (SELECT r.`key` FROM pengurus___role pr INNER JOIN role r ON pr.role_id = r.id WHERE pr.pengurus_id = p.id ORDER BY CASE r.`key` WHEN 'super_admin' THEN 1 WHEN 'admin_uwaba' THEN 2 WHEN 'admin_lembaga' THEN 3 ELSE 4 END LIMIT 1) AS level
                      FROM pengeluaran___komentar k
                      LEFT JOIN pengurus p ON k.id_admin = p.id
                      WHERE k.id = ?";
            $stmtGet = $this->db->prepare($sqlGet);
            $stmtGet->execute([$komentarId]);
            $komentarData = $stmtGet->fetch(\PDO::FETCH_ASSOC);
            
            // Ambil semua role untuk admin dan gabungkan
            if ($komentarData) {
                $sqlRole = "SELECT r.label, r.`key`
                           FROM pengurus___role pr
                           INNER JOIN role r ON pr.role_id = r.id
                           WHERE pr.pengurus_id = ?
                           ORDER BY CASE r.`key`
                               WHEN 'super_admin' THEN 1
                               WHEN 'admin_uwaba' THEN 2
                               WHEN 'admin_lembaga' THEN 3
                               ELSE 4
                           END";
                $stmtRole = $this->db->prepare($sqlRole);
                $stmtRole->execute([$komentarData['id_admin']]);
                $roles = $stmtRole->fetchAll(\PDO::FETCH_ASSOC);
                
                if (!empty($roles)) {
                    // Gabungkan semua role dengan pemisah " - "
                    $roleLabels = array_map(function($r) {
                        return $r['label'];
                    }, $roles);
                    $komentarData['admin_role'] = implode(' - ', $roleLabels);
                } else {
                    // Fallback ke level jika tidak ada role
                    $komentarData['admin_role'] = $komentarData['level'] ?? 'User';
                }
            }

            // PWA: setelah response — agar POST komentar tidak menunggu push
            try {
                $sqlAdmin = 'SELECT nama FROM pengurus WHERE id = ?';
                $stmtAdmin = $this->db->prepare($sqlAdmin);
                $stmtAdmin->execute([$idAdmin]);
                $adminNama = (string) (($stmtAdmin->fetch(\PDO::FETCH_ASSOC) ?: [])['nama'] ?? 'Admin');
                $judulRencana = trim((string) ($rencanaData['keterangan'] ?? 'Rencana'));
                if (strlen($judulRencana) > 56) {
                    $judulRencana = substr($judulRencana, 0, 53) . '...';
                }
                $title = 'Komentar Baru - ' . $judulRencana;
                $body = $adminNama . ' - ' . $komentar;
                $lemPush = isset($rencanaData['lembaga']) ? trim((string) $rencanaData['lembaga']) : '';
                $isDraftRencana = (($rencanaData['ket'] ?? '') === 'draft');
                $idAdminInt = $idAdmin !== null ? (int) $idAdmin : 0;
                $idRencanaInt = (int) $idRencana;
                $komentarIdInt = (int) $komentarId;
                $self = $this;
                DeferredHttpTask::runAfterResponse(function () use (
                    $self,
                    $lemPush,
                    $isDraftRencana,
                    $idAdminInt,
                    $title,
                    $body,
                    $idRencanaInt,
                    $komentarIdInt
                ): void {
                    try {
                        $self->sendPengeluaranNotifPolicyPush(
                            $lemPush !== '' ? $lemPush : null,
                            $isDraftRencana,
                            $idAdminInt > 0 ? [$idAdminInt] : [],
                            $title,
                            $body,
                            '/pengeluaran?tab=rencana&rencana=' . $idRencanaInt,
                            'komentar-rencana-' . $idRencanaInt . '-' . $komentarIdInt,
                            [
                                'type' => 'komentar_rencana',
                                'rencana_id' => $idRencanaInt,
                                'komentar_id' => $komentarIdInt,
                            ]
                        );
                    } catch (\Throwable $e) {
                        error_log('Push komentar rencana: ' . $e->getMessage());
                    }
                });
            } catch (\Exception $e) {
                error_log('Push komentar rencana (jadwal): ' . $e->getMessage());
            }

            return $this->jsonResponse($response, [
                'success' => true,
                'message' => 'Komentar berhasil ditambahkan',
                'data' => $komentarData
            ], 201);

        } catch (\Exception $e) {
            error_log("Create komentar error: " . $e->getMessage());
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Gagal menambahkan komentar: ' . $e->getMessage()
            ], 500);
        }
    }

    /**
     * GET /api/pengeluaran/rencana/{id}/komentar - Ambil semua komentar rencana
     */
    public function getKomentar(Request $request, Response $response, array $args): Response
    {
        try {
            $idRencana = $args['id'] ?? null;

            if (!$idRencana) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'ID rencana tidak valid'
                ], 400);
            }

            $sql = "SELECT k.*, p.nama as admin_nama,
                   (SELECT r.`key` FROM pengurus___role pr INNER JOIN role r ON pr.role_id = r.id WHERE pr.pengurus_id = p.id ORDER BY CASE r.`key` WHEN 'super_admin' THEN 1 WHEN 'admin_uwaba' THEN 2 WHEN 'admin_lembaga' THEN 3 ELSE 4 END LIMIT 1) AS level
                   FROM pengeluaran___komentar k
                   LEFT JOIN pengurus p ON k.id_admin = p.id
                   WHERE k.id_rencana = ?
                   ORDER BY k.tanggal_dibuat DESC";
            $stmt = $this->db->prepare($sql);
            $stmt->execute([$idRencana]);
            $komentar = $stmt->fetchAll(\PDO::FETCH_ASSOC);
            
            // Ambil semua role untuk setiap admin dan gabungkan
            foreach ($komentar as &$k) {
                $sqlRole = "SELECT r.label, r.`key`
                           FROM pengurus___role pr
                           INNER JOIN role r ON pr.role_id = r.id
                           WHERE pr.pengurus_id = ?
                           ORDER BY CASE r.`key`
                               WHEN 'super_admin' THEN 1
                               WHEN 'admin_uwaba' THEN 2
                               WHEN 'admin_lembaga' THEN 3
                               ELSE 4
                           END";
                $stmtRole = $this->db->prepare($sqlRole);
                $stmtRole->execute([$k['id_admin']]);
                $roles = $stmtRole->fetchAll(\PDO::FETCH_ASSOC);
                
                if (!empty($roles)) {
                    // Gabungkan semua role dengan pemisah " - "
                    $roleLabels = array_map(function($r) {
                        return $r['label'];
                    }, $roles);
                    $k['admin_role'] = implode(' - ', $roleLabels);
                } else {
                    // Fallback ke level jika tidak ada role
                    $k['admin_role'] = $k['level'] ?? 'User';
                }
            }
            unset($k);

            return $this->jsonResponse($response, [
                'success' => true,
                'data' => $komentar
            ], 200);

        } catch (\Exception $e) {
            error_log("Get komentar error: " . $e->getMessage());
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Gagal mengambil komentar: ' . $e->getMessage()
            ], 500);
        }
    }

    /**
     * DELETE /api/pengeluaran/rencana/{id}/komentar/{komentarId} - Hapus komentar
     */
    public function deleteKomentar(Request $request, Response $response, array $args): Response
    {
        try {
            $idRencana = $args['id'] ?? null;
            $komentarId = $args['komentarId'] ?? null;
            $user = $this->userFromRequest($request);
            $idAdmin = $user['user_id'] ?? $user['id'] ?? null;

            if (!$idRencana || !$komentarId) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'ID tidak valid'
                ], 400);
            }

            // Cek apakah komentar ada (izin: pemilik atau aksi rencana.hapus_komentar)
            $sqlCheck = "SELECT k.id_admin,
                        (SELECT r.`key` FROM pengurus___role pr INNER JOIN role r ON pr.role_id = r.id WHERE pr.pengurus_id = p.id ORDER BY CASE r.`key` WHEN 'super_admin' THEN 1 WHEN 'admin_uwaba' THEN 2 WHEN 'admin_lembaga' THEN 3 ELSE 4 END LIMIT 1) AS level
                        FROM pengeluaran___komentar k
                        LEFT JOIN pengurus p ON k.id_admin = p.id
                        WHERE k.id = ? AND k.id_rencana = ?";
            $stmtCheck = $this->db->prepare($sqlCheck);
            $stmtCheck->execute([$komentarId, $idRencana]);
            $komentarData = $stmtCheck->fetch(\PDO::FETCH_ASSOC);

            if (!$komentarData) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Komentar tidak ditemukan'
                ], 404);
            }

            $isOwner = isset($komentarData['id_admin'], $idAdmin) && (int) $komentarData['id_admin'] === (int) $idAdmin;
            $canModerate = RoleHelper::tokenPengeluaranActionAllowed(
                $this->db,
                $user,
                'action.pengeluaran.rencana.hapus_komentar'
            );

            // Pemilik komentar selalu boleh hapus sendiri; komentar orang lain hanya dengan aksi rencana.hapus_komentar
            if (!$isOwner && !$canModerate) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Anda tidak memiliki izin untuk menghapus komentar ini'
                ], 403);
            }

            // Delete komentar
            $sql = "DELETE FROM pengeluaran___komentar WHERE id = ? AND id_rencana = ?";
            $stmt = $this->db->prepare($sql);
            $stmt->execute([$komentarId, $idRencana]);

            return $this->jsonResponse($response, [
                'success' => true,
                'message' => 'Komentar berhasil dihapus'
            ], 200);

        } catch (\Exception $e) {
            error_log("Delete komentar error: " . $e->getMessage());
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Gagal menghapus komentar: ' . $e->getMessage()
            ], 500);
        }
    }

    /**
     * GET /api/pengeluaran/rencana/{id}/viewer - Ambil daftar viewer rencana
     */
    public function getViewer(Request $request, Response $response, array $args): Response
    {
        try {
            $idRencana = $args['id'] ?? null;

            if (!$idRencana) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'ID rencana tidak valid'
                ], 400);
            }

            $sql = "SELECT v.*, p.nama as admin_nama
                   FROM pengeluaran___viewer v
                   LEFT JOIN pengurus p ON v.id_admin = p.id
                   WHERE v.id_rencana = ?
                   ORDER BY v.tanggal_dilihat DESC";
            $stmt = $this->db->prepare($sql);
            $stmt->execute([$idRencana]);
            $viewers = $stmt->fetchAll(\PDO::FETCH_ASSOC);

            return $this->jsonResponse($response, [
                'success' => true,
                'data' => $viewers
            ], 200);

        } catch (\Exception $e) {
            error_log("Get viewer error: " . $e->getMessage());
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Gagal mengambil daftar viewer: ' . $e->getMessage()
            ], 500);
        }
    }

    /**
     * POST /api/pengeluaran/rencana/{id}/file - Upload file untuk rencana pengeluaran
     */
    public function uploadFile(Request $request, Response $response, array $args): Response
    {
        try {
            $idRencana = $args['id'] ?? null;
            $user = $request->getAttribute('user');
            $idAdmin = $user['user_id'] ?? $user['id'] ?? null;

            if (!$idRencana) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'ID rencana tidak valid'
                ], 400);
            }

            // Cek apakah rencana ada
            $checkSql = "SELECT id FROM pengeluaran___rencana WHERE id = ?";
            $checkStmt = $this->db->prepare($checkSql);
            $checkStmt->execute([$idRencana]);
            if ($checkStmt->rowCount() === 0) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Rencana pengeluaran tidak ditemukan'
                ], 404);
            }

            // Cek apakah ada file yang di-upload
            $uploadedFiles = $request->getUploadedFiles();
            if (empty($uploadedFiles) || !isset($uploadedFiles['file'])) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'File tidak ditemukan'
                ], 400);
            }

            $file = $uploadedFiles['file'];
            
            // Validasi error upload
            if ($file->getError() !== UPLOAD_ERR_OK) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Error saat upload file: ' . $this->getUploadErrorMessage($file->getError())
                ], 400);
            }

            // Validasi tipe file (foto, PDF, Word, Excel)
            $allowedTypes = [
                'image/jpeg', 
                'image/jpg', 
                'image/png', 
                'image/gif', 
                'image/webp', 
                'application/pdf',
                // Word
                'application/msword', // .doc
                'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // .docx
                // Excel
                'application/vnd.ms-excel', // .xls
                'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' // .xlsx
            ];
            
            // Validasi berdasarkan MIME type
            $fileType = $file->getClientMediaType();
            
            // Validasi juga berdasarkan ekstensi file sebagai fallback
            $originalName = $file->getClientFilename();
            $extension = strtolower(pathinfo($originalName, PATHINFO_EXTENSION));
            $allowedExtensions = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'pdf', 'doc', 'docx', 'xls', 'xlsx'];
            
            if (!in_array($fileType, $allowedTypes) && !in_array($extension, $allowedExtensions)) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Tipe file tidak diizinkan. Hanya foto (JPEG, PNG, GIF, WEBP), PDF, Word (.doc, .docx), dan Excel (.xls, .xlsx) yang diizinkan'
                ], 400);
            }

            // Validasi ukuran file (max 10MB)
            $maxSize = 10 * 1024 * 1024; // 10MB
            if ($file->getSize() > $maxSize) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Ukuran file terlalu besar. Maksimal 10MB'
                ], 400);
            }

            // Generate nama file unik
            $originalName = $file->getClientFilename();
            $extension = pathinfo($originalName, PATHINFO_EXTENSION);
            $fileName = uniqid('rencana_' . $idRencana . '_', true) . '.' . $extension;
            
            // Buat folder jika belum ada (dari config UPLOADS_BASE_PATH)
            $uploadDir = $this->uploadsPath . '/rencana-pengeluaran/' . $idRencana;
            if (!is_dir($uploadDir)) {
                mkdir($uploadDir, 0755, true);
            }

            $filePath = $uploadDir . '/' . $fileName;
            $relativePath = 'rencana-pengeluaran/' . $idRencana . '/' . $fileName;

            // Pindahkan file
            $file->moveTo($filePath);
            
            // Kompres PDF jika lebih dari 500 KB
            $finalFileSize = $file->getSize();
            if (($fileType === 'application/pdf' || $extension === 'pdf') && $finalFileSize > 512 * 1024) {
                try {
                    $compressedPath = $this->compressPdf($filePath);
                    if ($compressedPath && file_exists($compressedPath)) {
                        $compressedSize = filesize($compressedPath);
                        // Jika kompresi berhasil dan lebih kecil, gunakan file yang dikompresi
                        if ($compressedSize < $finalFileSize && $compressedSize > 0) {
                            // Hapus file asli dan rename file yang dikompresi
                            if (file_exists($filePath)) {
                                unlink($filePath);
                            }
                            if (rename($compressedPath, $filePath)) {
                                $finalFileSize = $compressedSize;
                                error_log("PDF compressed successfully: " . round($file->getSize() / 1024, 2) . " KB -> " . round($finalFileSize / 1024, 2) . " KB");
                            } else {
                                // Jika rename gagal, hapus file yang dikompresi
                                if (file_exists($compressedPath)) {
                                    unlink($compressedPath);
                                }
                            }
                        } else {
                            // Jika kompresi tidak efektif, hapus file yang dikompresi
                            if (file_exists($compressedPath)) {
                                unlink($compressedPath);
                            }
                        }
                    }
                } catch (\Exception $e) {
                    error_log("Error during PDF compression: " . $e->getMessage());
                    // Continue dengan file asli jika kompresi gagal
                }
            }

            // Simpan ke database
            $sql = "INSERT INTO pengeluaran___rencana_file 
                    (id_pengeluaran_rencana, nama_file, nama_file_simpan, path_file, tipe_file, ukuran_file, id_admin) 
                    VALUES (?, ?, ?, ?, ?, ?, ?)";
            $stmt = $this->db->prepare($sql);
            $stmt->execute([
                $idRencana,
                $originalName,
                $fileName,
                $relativePath,
                $fileType,
                $finalFileSize,
                $idAdmin
            ]);

            $fileId = $this->db->lastInsertId();

            return $this->jsonResponse($response, [
                'success' => true,
                'message' => 'File berhasil di-upload',
                    'data' => [
                    'id' => $fileId,
                    'nama_file' => $originalName,
                    'nama_file_simpan' => $fileName,
                    'tipe_file' => $fileType,
                    'ukuran_file' => $finalFileSize
                ]
            ], 201);

        } catch (\Exception $e) {
            error_log("Upload file error: " . $e->getMessage());
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Gagal meng-upload file: ' . $e->getMessage()
            ], 500);
        }
    }

    /**
     * GET /api/pengeluaran/rencana/{id}/file - Ambil daftar file rencana pengeluaran
     */
    public function getFiles(Request $request, Response $response, array $args): Response
    {
        try {
            $idRencana = $args['id'] ?? null;

            if (!$idRencana) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'ID rencana tidak valid'
                ], 400);
            }

            $sql = "SELECT f.*, p.nama as admin_nama
                    FROM pengeluaran___rencana_file f
                    LEFT JOIN pengurus p ON f.id_admin = p.id
                    WHERE f.id_pengeluaran_rencana = ?
                    ORDER BY f.tanggal_dibuat DESC";
            $stmt = $this->db->prepare($sql);
            $stmt->execute([$idRencana]);
            $files = $stmt->fetchAll();

            return $this->jsonResponse($response, [
                'success' => true,
                'data' => $files
            ], 200);

        } catch (\Exception $e) {
            error_log("Get files error: " . $e->getMessage());
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Gagal mengambil daftar file: ' . $e->getMessage()
            ], 500);
        }
    }

    /**
     * GET /api/pengeluaran/rencana/file/{fileId}/download - Download file
     */
    public function downloadFile(Request $request, Response $response, array $args): Response
    {
        try {
            $fileId = $args['fileId'] ?? null;

            if (!$fileId) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'ID file tidak valid'
                ], 400);
            }

            // Ambil data file dari database
            $sql = "SELECT * FROM pengeluaran___rencana_file WHERE id = ?";
            $stmt = $this->db->prepare($sql);
            $stmt->execute([$fileId]);
            $file = $stmt->fetch();

            if (!$file) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'File tidak ditemukan'
                ], 404);
            }

            $filePath = $this->resolveUploadPath($file['path_file']);

            if (!file_exists($filePath)) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'File tidak ditemukan di server'
                ], 404);
            }

            // Set headers untuk download
            $response = $response->withHeader('Content-Type', $file['tipe_file']);
            $response = $response->withHeader('Content-Disposition', 'inline; filename="' . $file['nama_file'] . '"');
            $response = $response->withHeader('Content-Length', (string)filesize($filePath));

            // Baca dan kirim file
            $fileContent = file_get_contents($filePath);
            $response->getBody()->write($fileContent);

            return $response;

        } catch (\Exception $e) {
            error_log("Download file error: " . $e->getMessage());
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Gagal mengunduh file: ' . $e->getMessage()
            ], 500);
        }
    }

    /**
     * DELETE /api/pengeluaran/rencana/file/{fileId} - Hapus file
     */
    public function deleteFile(Request $request, Response $response, array $args): Response
    {
        try {
            $fileId = $args['fileId'] ?? null;
            $user = $request->getAttribute('user');
            $idAdmin = $user['user_id'] ?? $user['id'] ?? null;

            if (!$fileId) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'ID file tidak valid'
                ], 400);
            }

            // Ambil data file dari database
            $sql = "SELECT * FROM pengeluaran___rencana_file WHERE id = ?";
            $stmt = $this->db->prepare($sql);
            $stmt->execute([$fileId]);
            $file = $stmt->fetch();

            if (!$file) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'File tidak ditemukan'
                ], 404);
            }

            // Cek apakah user adalah pemilik file atau super admin (multi-role aman)
            $isOwner = ($file['id_admin'] == $idAdmin);
            $idAdminInt = (int) ($idAdmin ?? 0);
            $isSuperAdmin = $idAdminInt > 0 && RoleHelper::pengurusHasSuperAdminRole($idAdminInt);

            if (!$isOwner && !$isSuperAdmin) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Anda tidak memiliki izin untuk menghapus file ini'
                ], 403);
            }

            // Hapus file dari server
            $filePath = $this->resolveUploadPath($file['path_file']);
            if (file_exists($filePath)) {
                unlink($filePath);
            }

            // Hapus dari database
            $deleteSql = "DELETE FROM pengeluaran___rencana_file WHERE id = ?";
            $deleteStmt = $this->db->prepare($deleteSql);
            $deleteStmt->execute([$fileId]);

            return $this->jsonResponse($response, [
                'success' => true,
                'message' => 'File berhasil dihapus'
            ], 200);

        } catch (\Exception $e) {
            error_log("Delete file error: " . $e->getMessage());
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Gagal menghapus file: ' . $e->getMessage()
            ], 500);
        }
    }

    /**
     * Kompresi PDF menggunakan Ghostscript atau alternatif
     * @param string $filePath Path ke file PDF
     * @return string|null Path ke file yang dikompresi, atau null jika gagal
     */
    private function compressPdf(string $filePath): ?string
    {
        try {
            // Target ukuran maksimal: 500 KB
            $maxSizeBytes = 512 * 1024;
            
            // Jika file sudah kecil, tidak perlu kompresi
            if (filesize($filePath) <= $maxSizeBytes) {
                return null;
            }
            
            // Cek apakah Ghostscript tersedia
            $gsPath = $this->findGhostscript();
            
            if ($gsPath) {
                // Gunakan Ghostscript untuk kompresi
                return $this->compressPdfWithGhostscript($filePath, $gsPath, $maxSizeBytes);
            } else {
                // Fallback: coba kompresi menggunakan metode PHP native (basic optimization)
                error_log("Ghostscript tidak tersedia, mencoba kompresi PDF dengan metode alternatif");
                return $this->compressPdfWithPhp($filePath, $maxSizeBytes);
            }
        } catch (\Exception $e) {
            error_log("Error compressing PDF: " . $e->getMessage());
            return null;
        }
    }
    
    /**
     * Cari path Ghostscript
     * @return string|null Path ke Ghostscript atau null jika tidak ditemukan
     */
    private function findGhostscript(): ?string
    {
        // Common paths untuk Ghostscript
        $possiblePaths = [
            'gs', // Jika ada di PATH
            '/usr/bin/gs',
            '/usr/local/bin/gs',
            'C:\\Program Files\\gs\\gs*\\bin\\gswin64c.exe',
            'C:\\Program Files (x86)\\gs\\gs*\\bin\\gswin32c.exe',
        ];
        
        // Cek apakah 'gs' ada di PATH (string tetap, bukan input user)
        $output = [];
        $returnVar = 0;
        @exec('gs --version 2>&1', $output, $returnVar);
        if ($returnVar === 0) {
            return 'gs';
        }
        
        // Cek path Windows
        if (strtoupper(substr(PHP_OS, 0, 3)) === 'WIN') {
            // Cari di Program Files
            $programFiles = getenv('ProgramFiles') ?: 'C:\\Program Files';
            $programFilesX86 = getenv('ProgramFiles(x86)') ?: 'C:\\Program Files (x86)';
            
            $gsDirs = glob($programFiles . '\\gs\\*');
            if (empty($gsDirs)) {
                $gsDirs = glob($programFilesX86 . '\\gs\\*');
            }
            
            foreach ($gsDirs as $gsDir) {
                $gsExe = $gsDir . '\\bin\\gswin64c.exe';
                if (file_exists($gsExe)) {
                    return $gsExe;
                }
                $gsExe = $gsDir . '\\bin\\gswin32c.exe';
                if (file_exists($gsExe)) {
                    return $gsExe;
                }
            }
        }
        
        return null;
    }
    
    /**
     * Pastikan path berada di dalam folder upload (cegah path traversal / exec dengan path arbitrer).
     */
    private function isPathInsideUploads(string $path): bool
    {
        $real = realpath($path);
        if ($real === false || !is_file($real)) {
            return false;
        }
        $base = realpath($this->uploadsPath);
        if ($base === false) {
            return false;
        }
        $base = rtrim($base, DIRECTORY_SEPARATOR) . DIRECTORY_SEPARATOR;
        return strpos($real, $base) === 0;
    }

    /**
     * Validasi gsPath hanya dari findGhostscript: literal 'gs' atau path ke gswin64c/gswin32c.
     */
    private function isGhostscriptPathAllowed(string $gsPath): bool
    {
        if ($gsPath === 'gs') {
            return true;
        }
        $normalized = str_replace('/', DIRECTORY_SEPARATOR, $gsPath);
        return (str_ends_with($normalized, 'gswin64c.exe') || str_ends_with($normalized, 'gswin32c.exe'));
    }

    /**
     * Kompresi PDF menggunakan Ghostscript
     * @param string $filePath Path ke file PDF asli (harus di dalam uploads)
     * @param string $gsPath Path ke Ghostscript executable (hanya dari findGhostscript)
     * @param int $maxSizeBytes Ukuran maksimal target (bytes)
     * @return string|null Path ke file yang dikompresi
     */
    private function compressPdfWithGhostscript(string $filePath, string $gsPath, int $maxSizeBytes): ?string
    {
        try {
            if (!$this->isPathInsideUploads($filePath)) {
                error_log("compressPdfWithGhostscript: path di luar uploads");
                return null;
            }
            if (!$this->isGhostscriptPathAllowed($gsPath)) {
                error_log("compressPdfWithGhostscript: gsPath tidak diizinkan");
                return null;
            }
            $outputPath = $filePath . '.compressed.pdf';
            
            // Quality settings untuk kompresi
            // /screen = 72 dpi (lowest, smallest)
            // /ebook = 150 dpi (medium)
            // /printer = 300 dpi (high)
            // /prepress = 300 dpi (highest)
            
            // Coba dengan setting /ebook dulu (balance antara kualitas dan ukuran)
            $quality = '/ebook';
            
            // Build command
            $command = escapeshellarg($gsPath) . 
                ' -sDEVICE=pdfwrite' .
                ' -dCompatibilityLevel=1.4' .
                ' -dPDFSETTINGS=' . $quality .
                ' -dNOPAUSE' .
                ' -dQUIET' .
                ' -dBATCH' .
                ' -dDetectDuplicateImages=true' .
                ' -dCompressFonts=true' .
                ' -r150' . // Resolution
                ' -sOutputFile=' . escapeshellarg($outputPath) .
                ' ' . escapeshellarg($filePath) . ' 2>&1';
            
            $output = [];
            $returnVar = 0;
            exec($command, $output, $returnVar);
            
            if ($returnVar !== 0) {
                error_log("Ghostscript error: " . implode("\n", $output));
                if (file_exists($outputPath)) {
                    @unlink($outputPath);
                }
                return null;
            }
            
            // Cek apakah file berhasil dibuat dan lebih kecil
            if (file_exists($outputPath)) {
                $compressedSize = filesize($outputPath);
                $originalSize = filesize($filePath);
                
                // Jika kompresi berhasil dan lebih kecil, return path
                if ($compressedSize < $originalSize) {
                    // Jika masih lebih besar dari target, coba dengan quality lebih rendah
                    if ($compressedSize > $maxSizeBytes && $quality === '/ebook') {
                        @unlink($outputPath);
                        // Coba dengan /screen (kualitas lebih rendah, ukuran lebih kecil)
                        $quality = '/screen';
                        $command = escapeshellarg($gsPath) . 
                            ' -sDEVICE=pdfwrite' .
                            ' -dCompatibilityLevel=1.4' .
                            ' -dPDFSETTINGS=' . $quality .
                            ' -dNOPAUSE' .
                            ' -dQUIET' .
                            ' -dBATCH' .
                            ' -dDetectDuplicateImages=true' .
                            ' -dCompressFonts=true' .
                            ' -r72' . // Lower resolution
                            ' -sOutputFile=' . escapeshellarg($outputPath) .
                            ' ' . escapeshellarg($filePath) . ' 2>&1';
                        
                        exec($command, $output, $returnVar);
                        
                        if ($returnVar === 0 && file_exists($outputPath)) {
                            $compressedSize = filesize($outputPath);
                            if ($compressedSize < $originalSize) {
                                return $outputPath;
                            }
                        }
                    } else {
                        return $outputPath;
                    }
                }
                
                // Jika tidak lebih kecil, hapus file yang dikompresi
                @unlink($outputPath);
            }
            
            return null;
        } catch (\Exception $e) {
            error_log("Error in compressPdfWithGhostscript: " . $e->getMessage());
            return null;
        }
    }

    /**
     * Kompresi PDF menggunakan metode PHP native (basic optimization)
     * Metode ini lebih terbatas dibanding Ghostscript, tapi bisa bekerja tanpa dependency eksternal
     * @param string $filePath Path ke file PDF
     * @param int $maxSizeBytes Ukuran maksimal target
     * @return string|null Path ke file yang dikompresi
     */
    private function compressPdfWithPhp(string $filePath, int $maxSizeBytes): ?string
    {
        try {
            // Baca konten PDF
            $pdfContent = file_get_contents($filePath);
            if (!$pdfContent) {
                return null;
            }
            
            // Basic optimization: hapus whitespace dan komentar yang tidak perlu
            // Ini adalah optimisasi sederhana yang bisa mengurangi ukuran sedikit
            $optimized = preg_replace('/\s+/', ' ', $pdfContent);
            $optimized = preg_replace('/%\s*[^\r\n]*[\r\n]/', '', $optimized); // Hapus komentar
            
            // Hapus objek yang tidak digunakan (basic cleanup)
            $optimized = preg_replace('/\/Type\s*\/XObject[\s\S]*?endobj/', '', $optimized);
            
            // Jika hasil optimisasi lebih kecil, simpan
            if (strlen($optimized) < strlen($pdfContent) && strlen($optimized) > 0) {
                $outputPath = $filePath . '.compressed.pdf';
                if (file_put_contents($outputPath, $optimized)) {
                    // Cek apakah hasilnya lebih kecil dari asli
                    if (filesize($outputPath) < filesize($filePath)) {
                        return $outputPath;
                    } else {
                        @unlink($outputPath);
                    }
                }
            }
            
            // Jika optimisasi sederhana tidak cukup, return null
            // User bisa install Ghostscript untuk kompresi yang lebih baik
            return null;
        } catch (\Exception $e) {
            error_log("Error in compressPdfWithPhp: " . $e->getMessage());
            return null;
        }
    }

    /**
     * Helper function untuk mendapatkan pesan error upload
     */
    private function getUploadErrorMessage(int $errorCode): string
    {
        switch ($errorCode) {
            case UPLOAD_ERR_INI_SIZE:
            case UPLOAD_ERR_FORM_SIZE:
                return 'Ukuran file terlalu besar';
            case UPLOAD_ERR_PARTIAL:
                return 'File hanya ter-upload sebagian';
            case UPLOAD_ERR_NO_FILE:
                return 'Tidak ada file yang di-upload';
            case UPLOAD_ERR_NO_TMP_DIR:
                return 'Folder temporary tidak ditemukan';
            case UPLOAD_ERR_CANT_WRITE:
                return 'Gagal menulis file ke disk';
            case UPLOAD_ERR_EXTENSION:
                return 'Upload dihentikan oleh extension';
            default:
                return 'Error tidak diketahui';
        }
    }

    /**
     * PUT /api/pengeluaran/{id} - Update pengeluaran (terutama id_penerima)
     */
    public function updatePengeluaran(Request $request, Response $response, array $args): Response
    {
        try {
            $idPengeluaran = $args['id'] ?? null;
            $data = $request->getParsedBody();
            $data = is_array($data) ? TextSanitizer::sanitizeStringValues($data, []) : [];
            $user = $request->getAttribute('user');

            if (!$idPengeluaran) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'ID pengeluaran tidak valid'
                ], 400);
            }

            $denyAc = $this->pengeluaranDenyUnlessAction($request, $response, 'action.pengeluaran.item.edit');
            if ($denyAc !== null) {
                return $denyAc;
            }

            // Cek apakah pengeluaran ada
            $sqlCheck = "SELECT id, lembaga FROM pengeluaran WHERE id = ?";
            $stmtCheck = $this->db->prepare($sqlCheck);
            $stmtCheck->execute([$idPengeluaran]);
            $pengeluaran = $stmtCheck->fetch(\PDO::FETCH_ASSOC);

            if (!$pengeluaran) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Pengeluaran tidak ditemukan'
                ], 404);
            }

            $denyLb0 = $this->assertPengeluaranLembagaRow($request, $response, isset($pengeluaran['lembaga']) ? (string) $pengeluaran['lembaga'] : null);
            if ($denyLb0 !== null) {
                return $denyLb0;
            }

            // Prepare update fields
            $updateFields = [];
            $updateParams = [];

            // Update kategori
            if (isset($data['kategori'])) {
                $kategori = $data['kategori'] ? $data['kategori'] : null;
                $validKategori = ['Bisyaroh', 'Acara', 'Pengadaan', 'Perbaikan', 'ATK', 'lainnya', 'Listrik', 'Wifi', 'Langganan'];
                if ($kategori !== null && !in_array($kategori, $validKategori)) {
                    return $this->jsonResponse($response, [
                        'success' => false,
                        'message' => 'Kategori tidak valid'
                    ], 400);
                }
                $updateFields[] = "kategori = ?";
                $updateParams[] = $kategori;
            }

            // Update lembaga
            if (isset($data['lembaga'])) {
                $lembaga = $data['lembaga'] ? $data['lembaga'] : null;
                if ($lembaga !== null && $lembaga !== '') {
                    $denyLb1 = $this->assertPengeluaranLembagaRow($request, $response, (string) $lembaga);
                    if ($denyLb1 !== null) {
                        return $denyLb1;
                    }
                }
                $updateFields[] = "lembaga = ?";
                $updateParams[] = $lembaga;
            }

            // Update sumber_uang
            if (isset($data['sumber_uang'])) {
                $sumberUang = $data['sumber_uang'] ? $data['sumber_uang'] : 'Cash';
                $validSumberUang = ['Cash', 'TF'];
                if (!in_array($sumberUang, $validSumberUang)) {
                    return $this->jsonResponse($response, [
                        'success' => false,
                        'message' => 'Sumber uang tidak valid'
                    ], 400);
                }
                $updateFields[] = "sumber_uang = ?";
                $updateParams[] = $sumberUang;
            }

            // Update id_penerima (FK ke pengurus.id; client bisa kirim id atau NIP)
            if (isset($data['id_penerima'])) {
                $denyKelolaPenerima = $this->pengeluaranDenyUnlessMoneyRecipientKelola($request, $response);
                if ($denyKelolaPenerima !== null) {
                    return $denyKelolaPenerima;
                }
                $idPenerimaRaw = $data['id_penerima'];
                $idPenerima = null;
                if ($idPenerimaRaw !== null && $idPenerimaRaw !== '') {
                    $idPenerima = is_numeric($idPenerimaRaw) ? PengurusHelper::resolveIdByNip($this->db, $idPenerimaRaw) : null;
                }
                if ($idPenerima === null && $idPenerimaRaw !== null && $idPenerimaRaw !== '') {
                    return $this->jsonResponse($response, [
                        'success' => false,
                        'message' => 'Penerima (pengurus) tidak ditemukan'
                    ], 400);
                }
                $updateFields[] = "id_penerima = ?";
                $updateParams[] = $idPenerima;
            }

            // Jika tidak ada field yang diupdate
            if (empty($updateFields)) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Tidak ada data yang diupdate'
                ], 400);
            }

            $stmtOldP = $this->db->prepare("SELECT * FROM pengeluaran WHERE id = ?");
            $stmtOldP->execute([$idPengeluaran]);
            $oldPengeluaran = $stmtOldP->fetch(\PDO::FETCH_ASSOC);

            // Update fields
            $updateParams[] = $idPengeluaran;
            $sqlUpdate = "UPDATE pengeluaran SET " . implode(", ", $updateFields) . " WHERE id = ?";
            $stmtUpdate = $this->db->prepare($sqlUpdate);
            $stmtUpdate->execute($updateParams);

            $stmtNewP = $this->db->prepare("SELECT * FROM pengeluaran WHERE id = ?");
            $stmtNewP->execute([$idPengeluaran]);
            $newPengeluaran = $stmtNewP->fetch(\PDO::FETCH_ASSOC);
            if ($oldPengeluaran && $newPengeluaran) {
                $idAdmin = $user['user_id'] ?? $user['id'] ?? null;
                UserAktivitasLogger::log(null, $idAdmin, UserAktivitasLogger::ACTION_UPDATE, 'pengeluaran', $idPengeluaran, $oldPengeluaran, $newPengeluaran, $request);
            }

            return $this->jsonResponse($response, [
                'success' => true,
                'message' => 'Pengeluaran berhasil diupdate'
            ], 200);

        } catch (\Exception $e) {
            error_log("Update pengeluaran error: " . $e->getMessage());
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Gagal mengupdate pengeluaran: ' . $e->getMessage()
            ], 500);
        }
    }

    /**
     * GET /api/pengeluaran/{id}/pengurus - Ambil daftar pengurus berdasarkan lembaga dari pengeluaran
     */
    public function getPengurusByLembaga(Request $request, Response $response, array $args): Response
    {
        try {
            $idPengeluaran = $args['id'] ?? null;

            if (!$idPengeluaran) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'ID pengeluaran tidak valid'
                ], 400);
            }

            // Ambil lembaga dari pengeluaran
            $sqlPengeluaran = "SELECT lembaga FROM pengeluaran WHERE id = ?";
            $stmtPengeluaran = $this->db->prepare($sqlPengeluaran);
            $stmtPengeluaran->execute([$idPengeluaran]);
            $pengeluaran = $stmtPengeluaran->fetch(\PDO::FETCH_ASSOC);

            if (!$pengeluaran) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Pengeluaran tidak ditemukan'
                ], 404);
            }

            $denyPl = $this->assertPengeluaranLembagaRow($request, $response, isset($pengeluaran['lembaga']) ? (string) $pengeluaran['lembaga'] : null);
            if ($denyPl !== null) {
                return $denyPl;
            }

            $denyKelolaPenerima = $this->pengeluaranDenyUnlessMoneyRecipientKelola($request, $response);
            if ($denyKelolaPenerima !== null) {
                return $denyKelolaPenerima;
            }

            $lembaga = $pengeluaran['lembaga'];

            if (empty($lembaga)) {
                return $this->jsonResponse($response, [
                    'success' => true,
                    'data' => [],
                    'message' => 'Lembaga tidak ditemukan pada pengeluaran'
                ], 200);
            }

            // Ambil pengurus yang punya jabatan di lembaga ini (aktif), termasuk no_wa untuk notifikasi
            $sqlPengurus = "SELECT DISTINCT p.id, p.nama, p.gelar_awal, p.gelar_akhir,
                           COALESCE(u.no_wa, '') AS whatsapp,
                           GROUP_CONCAT(DISTINCT j.nama ORDER BY j.nama SEPARATOR ', ') as roles
                           FROM pengurus p
                           LEFT JOIN users u ON u.id = p.id_user
                           INNER JOIN pengurus___jabatan pj ON p.id = pj.pengurus_id
                           INNER JOIN jabatan j ON pj.jabatan_id = j.id
                           WHERE pj.lembaga_id = ?
                           AND pj.status = 'aktif'
                           GROUP BY p.id, p.nama, p.gelar_awal, p.gelar_akhir, u.no_wa
                           ORDER BY p.nama ASC";
            $stmtPengurus = $this->db->prepare($sqlPengurus);
            $stmtPengurus->execute([$lembaga]);
            $pengurusList = $stmtPengurus->fetchAll(\PDO::FETCH_ASSOC);

            // Format nama dengan gelar
            foreach ($pengurusList as &$pengurus) {
                $namaLengkap = trim(($pengurus['gelar_awal'] ?? '') . ' ' . $pengurus['nama'] . ' ' . ($pengurus['gelar_akhir'] ?? ''));
                $pengurus['nama_lengkap'] = $namaLengkap;
            }
            unset($pengurus);

            return $this->jsonResponse($response, [
                'success' => true,
                'data' => $pengurusList
            ], 200);

        } catch (\Exception $e) {
            error_log("Get pengurus by lembaga error: " . $e->getMessage());
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Gagal mengambil daftar pengurus: ' . $e->getMessage()
            ], 500);
        }
    }

    /**
     * DELETE /api/pengeluaran/rencana/{id} - Hapus rencana berstatus draft saja
     */
    public function deleteRencana(Request $request, Response $response, array $args): Response
    {
        try {
            $idRencana = $args['id'] ?? null;
            if (!$idRencana) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'ID rencana tidak valid',
                ], 400);
            }

            $denyAc = $this->pengeluaranDenyUnlessAction($request, $response, 'action.pengeluaran.draft.hapus');
            if ($denyAc !== null) {
                return $denyAc;
            }

            $stmt = $this->db->prepare('SELECT id, ket, lembaga FROM pengeluaran___rencana WHERE id = ?');
            $stmt->execute([$idRencana]);
            $row = $stmt->fetch(\PDO::FETCH_ASSOC);
            if (!$row) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Rencana tidak ditemukan',
                ], 404);
            }
            if (($row['ket'] ?? '') !== 'draft') {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Hanya rencana berstatus draft yang dapat dihapus lewat endpoint ini',
                ], 400);
            }

            $denyLb = $this->assertRencanaLembagaRow($request, $response, isset($row['lembaga']) ? (string) $row['lembaga'] : null, 'draft');
            if ($denyLb !== null) {
                return $denyLb;
            }

            $this->db->beginTransaction();
            try {
                $sqlFiles = 'SELECT path_file FROM pengeluaran___rencana_file WHERE id_pengeluaran_rencana = ?';
                $stmtFiles = $this->db->prepare($sqlFiles);
                $stmtFiles->execute([$idRencana]);
                $files = $stmtFiles->fetchAll(\PDO::FETCH_ASSOC);
                foreach ($files as $file) {
                    $filePath = $this->resolveUploadPath($file['path_file']);
                    if (file_exists($filePath)) {
                        unlink($filePath);
                    }
                }
                $this->db->prepare('DELETE FROM pengeluaran___rencana_file WHERE id_pengeluaran_rencana = ?')->execute([$idRencana]);
                $this->db->prepare('DELETE FROM pengeluaran___rencana_detail WHERE id_pengeluaran_rencana = ?')->execute([$idRencana]);
                $this->db->prepare('DELETE FROM pengeluaran___komentar WHERE id_rencana = ?')->execute([$idRencana]);
                $this->db->prepare('DELETE FROM pengeluaran___viewer WHERE id_rencana = ?')->execute([$idRencana]);
                $this->db->prepare('DELETE FROM pengeluaran___rencana WHERE id = ? AND ket = ?')->execute([$idRencana, 'draft']);
                $this->db->commit();
            } catch (\Exception $e) {
                $this->db->rollBack();
                throw $e;
            }

            return $this->jsonResponse($response, [
                'success' => true,
                'message' => 'Draft rencana berhasil dihapus',
            ], 200);
        } catch (\Exception $e) {
            error_log('Delete rencana draft error: ' . $e->getMessage());

            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Gagal menghapus draft: ' . $e->getMessage(),
            ], 500);
        }
    }

    /**
     * DELETE /api/pengeluaran/{id} - Hapus pengeluaran
     * Body: { "delete_rencana": boolean }
     */
    public function deletePengeluaran(Request $request, Response $response, array $args): Response
    {
        try {
            $id = $args['id'] ?? null;
            $data = $request->getParsedBody();
            $data = is_array($data) ? TextSanitizer::sanitizeStringValues($data, []) : [];
            $deleteRencana = $data['delete_rencana'] ?? false;
            $user = $request->getAttribute('user');

            if (!$id) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'ID pengeluaran tidak valid'
                ], 400);
            }

            $denyAc = $this->pengeluaranDenyUnlessAction($request, $response, 'action.pengeluaran.item.hapus');
            if ($denyAc !== null) {
                return $denyAc;
            }

            // Mulai transaksi
            $this->db->beginTransaction();

            // Ambil data pengeluaran sebelum dihapus untuk cek id_rencana dan audit
            $sqlCheck = "SELECT * FROM pengeluaran WHERE id = ?";
            $stmtCheck = $this->db->prepare($sqlCheck);
            $stmtCheck->execute([$id]);
            $pengeluaran = $stmtCheck->fetch(\PDO::FETCH_ASSOC);

            if (!$pengeluaran) {
                $this->db->rollBack();
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Pengeluaran tidak ditemukan'
                ], 404);
            }

            $denyLb = $this->assertPengeluaranLembagaRow($request, $response, isset($pengeluaran['lembaga']) ? (string) $pengeluaran['lembaga'] : null);
            if ($denyLb !== null) {
                $this->db->rollBack();
                return $denyLb;
            }

            $idRencana = $pengeluaran['id_rencana'] ?? null;
            $idAdmin = $user['user_id'] ?? $user['id'] ?? null;

            // 1. Hapus detail pengeluaran (selalu hapus)
            $sqlDeleteDetail = "DELETE FROM pengeluaran___detail WHERE id_pengeluaran = ?";
            $stmtDeleteDetail = $this->db->prepare($sqlDeleteDetail);
            $stmtDeleteDetail->execute([$id]);

            // 2. Hapus pengeluaran itu sendiri
            $sqlDeletePengeluaran = "DELETE FROM pengeluaran WHERE id = ?";
            $stmtDeletePengeluaran = $this->db->prepare($sqlDeletePengeluaran);
            $stmtDeletePengeluaran->execute([$id]);

            // 3. Jika opsi delete_rencana dipilih dan ada id_rencana
            if ($deleteRencana && $idRencana) {
                // Hapus file fisik dan database file
                $sqlFiles = "SELECT path_file FROM pengeluaran___rencana_file WHERE id_pengeluaran_rencana = ?";
                $stmtFiles = $this->db->prepare($sqlFiles);
                $stmtFiles->execute([$idRencana]);
                $files = $stmtFiles->fetchAll(\PDO::FETCH_ASSOC);

                foreach ($files as $file) {
                    $filePath = $this->resolveUploadPath($file['path_file']);
                    if (file_exists($filePath)) {
                        unlink($filePath);
                    }
                }
                
                // Hapus folder rencana jika kosong (opsional, tapi good practice)
                $rencanaDir = $this->uploadsPath . '/rencana-pengeluaran/' . $idRencana;
                if (is_dir($rencanaDir)) {
                     // Cek apakah kosong
                     $filesInDir = array_diff(scandir($rencanaDir), array('.', '..'));
                     if (empty($filesInDir)) {
                         rmdir($rencanaDir);
                     }
                }

                // Hapus record file
                $sqlDeleteFiles = "DELETE FROM pengeluaran___rencana_file WHERE id_pengeluaran_rencana = ?";
                $stmtDeleteFiles = $this->db->prepare($sqlDeleteFiles);
                $stmtDeleteFiles->execute([$idRencana]);

                // Hapus detail rencana
                $sqlDeleteRencanaDetail = "DELETE FROM pengeluaran___rencana_detail WHERE id_pengeluaran_rencana = ?";
                $stmtDeleteRencanaDetail = $this->db->prepare($sqlDeleteRencanaDetail);
                $stmtDeleteRencanaDetail->execute([$idRencana]);

                // Hapus komentar
                $sqlDeleteKomentar = "DELETE FROM pengeluaran___komentar WHERE id_rencana = ?";
                $stmtDeleteKomentar = $this->db->prepare($sqlDeleteKomentar);
                $stmtDeleteKomentar->execute([$idRencana]);

                // Hapus viewer
                $sqlDeleteViewer = "DELETE FROM pengeluaran___viewer WHERE id_rencana = ?";
                $stmtDeleteViewer = $this->db->prepare($sqlDeleteViewer);
                $stmtDeleteViewer->execute([$idRencana]);

                // Akhirnya, hapus rencana itu sendiri
                $sqlDeleteRencana = "DELETE FROM pengeluaran___rencana WHERE id = ?";
                $stmtDeleteRencana = $this->db->prepare($sqlDeleteRencana);
                $stmtDeleteRencana->execute([$idRencana]);
            }

            $this->db->commit();

            UserAktivitasLogger::log(null, $idAdmin, UserAktivitasLogger::ACTION_DELETE, 'pengeluaran', $id, $pengeluaran, null, $request);

            return $this->jsonResponse($response, [
                'success' => true,
                'message' => 'Pengeluaran berhasil dihapus' . ($deleteRencana && $idRencana ? ' beserta rencana terkait' : '')
            ], 200);

        } catch (\Exception $e) {
            $this->db->rollBack();
            error_log("Delete pengeluaran error: " . $e->getMessage());
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Gagal menghapus pengeluaran: ' . $e->getMessage()
            ], 500);
        }
    }
}


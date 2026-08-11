<?php

namespace App\Controllers;

use App\Database;
use App\Helpers\PengurusHelper;
use App\Helpers\UserAktivitasLogger;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;

/**
 * Endpoint daftar aktivitas (audit log) dan rollback.
 * Hanya super_admin.
 */
class UserAktivitasController
{
    /** Entity type yang boleh di-rollback (nama tabel). */
    private const ROLLBACK_ALLOWED_ENTITIES = [
        'pengeluaran',
        'pengeluaran___rencana',
        'pemasukan',
        'santri',
        'psb___registrasi',
        'uwaba___bayar',
        'uwaba___tunggakan',
        'uwaba___khusus',
        'santri___boyong',
        'santri___ijin',
        'santri___juara',
        'madrasah',
        'jabatan',
        'lembaga',
    ];

    private $db;

    public function __construct()
    {
        $this->db = Database::getInstance()->getConnection();
    }

    private function jsonResponse(Response $response, array $data, int $statusCode): Response
    {
        $response->getBody()->write(json_encode($data, JSON_UNESCAPED_UNICODE));
        return $response
            ->withStatus($statusCode)
            ->withHeader('Content-Type', 'application/json; charset=utf-8');
    }

    /**
     * GET /api/v2/profil/aktivitas - Daftar aktivitas user yang sedang login (untuk halaman profil).
     * Hanya menampilkan baris dimana pengurus_id = user dari token. Query: entity_type, date_from, date_to, limit, offset.
     */
    public function getMyList(Request $request, Response $response): Response
    {
        try {
            $user = $request->getAttribute('user');
            $pengurusId = isset($user['user_id']) && $user['user_id'] !== '' ? (int) $user['user_id'] : null;
            if ($pengurusId === null && !empty($user['id'])) {
                $pengurusId = (int) $user['id'];
            }
            if ($pengurusId === null || $pengurusId <= 0) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'User tidak teridentifikasi',
                ], 401);
            }

            $params = $request->getQueryParams();
            $entityType = isset($params['entity_type']) && $params['entity_type'] !== '' ? trim($params['entity_type']) : null;
            $dateFrom = isset($params['date_from']) && $params['date_from'] !== '' ? trim($params['date_from']) : null;
            $dateTo = isset($params['date_to']) && $params['date_to'] !== '' ? trim($params['date_to']) : null;
            $limit = isset($params['limit']) && (int) $params['limit'] > 0 ? min((int) $params['limit'], 100) : 50;
            $offset = isset($params['offset']) && (int) $params['offset'] >= 0 ? (int) $params['offset'] : 0;

            $where = ['(a.pengurus_id = ? OR a.user_id = (SELECT id_user FROM pengurus WHERE id = ? LIMIT 1))'];
            $bind = [$pengurusId, $pengurusId];
            if ($entityType !== null) {
                $where[] = 'a.entity_type = ?';
                $bind[] = $entityType;
            }
            if ($dateFrom !== null) {
                $where[] = 'DATE(a.created_at) >= ?';
                $bind[] = $dateFrom;
            }
            if ($dateTo !== null) {
                $where[] = 'DATE(a.created_at) <= ?';
                $bind[] = $dateTo;
            }

            $whereSql = 'WHERE ' . implode(' AND ', $where);

            $countSql = "SELECT COUNT(*) FROM user___aktivitas a $whereSql";
            $stmtCount = $this->db->prepare($countSql);
            $stmtCount->execute($bind);
            $total = (int) $stmtCount->fetchColumn();

            $sql = "SELECT a.id, a.action, a.entity_type, a.entity_id, a.santri_id, a.actor_entity_type, a.actor_entity_id, a.ref_aktivitas_id, a.created_at
                    FROM user___aktivitas a
                    $whereSql
                    ORDER BY a.created_at DESC
                    LIMIT " . (int) $limit . " OFFSET " . (int) $offset;
            $stmt = $this->db->prepare($sql);
            $stmt->execute($bind);
            $rows = $stmt->fetchAll(\PDO::FETCH_ASSOC);

            return $this->jsonResponse($response, [
                'success' => true,
                'data' => $rows,
                'total' => $total,
                'limit' => $limit,
                'offset' => $offset,
            ], 200);
        } catch (\Throwable $e) {
            error_log('UserAktivitasController::getMyList ' . $e->getMessage());
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Gagal mengambil aktivitas',
                'error' => null,
            ], 500);
        }
    }

    /**
     * GET /api/user-aktivitas - Daftar aktivitas dengan filter (super_admin only).
     * Query: user_id, pengurus_id, santri_id, actor_entity_type, actor_entity_id, entity_type, date_from, date_to, limit, offset.
     */
    public function getList(Request $request, Response $response): Response
    {
        try {
            $params = $request->getQueryParams();
            $userId = isset($params['user_id']) && $params['user_id'] !== '' ? (int) $params['user_id'] : null;
            $pengurusIdRaw = isset($params['pengurus_id']) && $params['pengurus_id'] !== '' ? trim((string) $params['pengurus_id']) : null;
            $pengurusId = null;
            if ($pengurusIdRaw !== null && is_numeric($pengurusIdRaw)) {
                $pengurusId = PengurusHelper::resolveIdByNip($this->db, $pengurusIdRaw);
            }
            $santriId = isset($params['santri_id']) && $params['santri_id'] !== '' ? (int) $params['santri_id'] : null;
            $actorEntityType = isset($params['actor_entity_type']) && $params['actor_entity_type'] !== '' ? trim($params['actor_entity_type']) : null;
            $actorEntityId = isset($params['actor_entity_id']) && $params['actor_entity_id'] !== '' ? (int) $params['actor_entity_id'] : null;
            $entityType = isset($params['entity_type']) && $params['entity_type'] !== '' ? trim($params['entity_type']) : null;
            $action = isset($params['action']) && $params['action'] !== '' ? trim((string) $params['action']) : null;
            $dateFrom = isset($params['date_from']) && $params['date_from'] !== '' ? trim($params['date_from']) : null;
            $dateTo = isset($params['date_to']) && $params['date_to'] !== '' ? trim($params['date_to']) : null;
            $limit = isset($params['limit']) && (int) $params['limit'] > 0 ? min((int) $params['limit'], 500) : 100;
            $offset = isset($params['offset']) && (int) $params['offset'] >= 0 ? (int) $params['offset'] : 0;

            $where = [];
            $bind = [];
            if ($userId !== null) {
                $where[] = 'a.user_id = ?';
                $bind[] = $userId;
            }
            if ($pengurusId !== null) {
                $where[] = 'a.pengurus_id = ?';
                $bind[] = $pengurusId;
            }
            if ($santriId !== null) {
                $where[] = 'a.santri_id = ?';
                $bind[] = $santriId;
            }
            if ($actorEntityType !== null) {
                $where[] = 'a.actor_entity_type = ?';
                $bind[] = $actorEntityType;
            }
            if ($actorEntityId !== null) {
                $where[] = 'a.actor_entity_id = ?';
                $bind[] = $actorEntityId;
            }
            if ($entityType !== null) {
                $where[] = 'a.entity_type = ?';
                $bind[] = $entityType;
            }
            if ($action !== null) {
                $where[] = 'a.action = ?';
                $bind[] = $action;
            }
            if ($dateFrom !== null) {
                $where[] = 'DATE(a.created_at) >= ?';
                $bind[] = $dateFrom;
            }
            if ($dateTo !== null) {
                $where[] = 'DATE(a.created_at) <= ?';
                $bind[] = $dateTo;
            }

            $whereSql = count($where) > 0 ? 'WHERE ' . implode(' AND ', $where) : '';

            $countSql = "SELECT COUNT(*) FROM user___aktivitas a $whereSql";
            $stmtCount = $this->db->prepare($countSql);
            $stmtCount->execute($bind);
            $total = (int) $stmtCount->fetchColumn();

            $sql = "SELECT a.id, a.user_id, a.pengurus_id, a.santri_id, a.actor_entity_type, a.actor_entity_id,
                    a.action, a.entity_type, a.entity_id,
                    a.old_data, a.new_data, a.ref_aktivitas_id, a.ip_address, a.user_agent, a.created_at,
                    p.nama AS pengurus_nama,
                    s.nama AS santri_nama, s.nis AS santri_nis,
                    m.nama AS madrasah_nama
                    FROM user___aktivitas a
                    LEFT JOIN pengurus p ON p.id = a.pengurus_id
                    LEFT JOIN santri s ON s.id = a.santri_id
                    LEFT JOIN madrasah m ON m.id = a.actor_entity_id AND a.actor_entity_type = 'madrasah'
                    $whereSql
                    ORDER BY a.created_at DESC
                    LIMIT " . (int) $limit . " OFFSET " . (int) $offset;
            $stmt = $this->db->prepare($sql);
            $stmt->execute($bind);
            $rows = $stmt->fetchAll(\PDO::FETCH_ASSOC);

            foreach ($rows as &$row) {
                if (isset($row['old_data']) && $row['old_data'] !== null) {
                    $row['old_data'] = is_string($row['old_data']) ? json_decode($row['old_data'], true) : $row['old_data'];
                }
                if (isset($row['new_data']) && $row['new_data'] !== null) {
                    $row['new_data'] = is_string($row['new_data']) ? json_decode($row['new_data'], true) : $row['new_data'];
                }
            }
            unset($row);

            return $this->jsonResponse($response, [
                'success' => true,
                'data' => $rows,
                'total' => $total,
                'limit' => $limit,
                'offset' => $offset,
            ], 200);
        } catch (\Throwable $e) {
            error_log('UserAktivitasController::getList ' . $e->getMessage());
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Gagal mengambil daftar aktivitas',
                'error' => null,
            ], 500);
        }
    }

    /**
     * POST /api/user-aktivitas/rollback - Rollback satu aktivitas (terapkan old_data), super_admin only.
     * Body: { "aktivitas_id": 123 }
     * - create → rollback = hapus baris (DELETE)
     * - update → rollback = UPDATE dengan old_data
     * - delete → rollback = INSERT dengan old_data
     * Lalu insert aktivitas rollback dengan ref_aktivitas_id.
     */
    public function rollback(Request $request, Response $response): Response
    {
        try {
            $input = $request->getParsedBody();
            if (is_array($input) && !empty($input['aktivitas_id'])) {
                $aktivitasId = (int) $input['aktivitas_id'];
            } else {
                $body = $request->getBody()->getContents();
                $input = json_decode($body, true);
                $aktivitasId = isset($input['aktivitas_id']) ? (int) $input['aktivitas_id'] : 0;
            }

            if ($aktivitasId <= 0) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'aktivitas_id wajib dan harus positif',
                ], 400);
            }

            $stmt = $this->db->prepare("SELECT id, action, entity_type, entity_id, old_data, new_data FROM user___aktivitas WHERE id = ? LIMIT 1");
            $stmt->execute([$aktivitasId]);
            $aktivitas = $stmt->fetch(\PDO::FETCH_ASSOC);

            if (!$aktivitas) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Aktivitas tidak ditemukan',
                ], 404);
            }

            $action = $aktivitas['action'] ?? '';
            $entityType = $aktivitas['entity_type'] ?? '';
            $entityId = $aktivitas['entity_id'] ?? '';

            if (!in_array($action, ['create', 'update', 'delete'], true)) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Rollback hanya untuk aktivitas create, update, atau delete',
                ], 400);
            }

            if (!in_array($entityType, self::ROLLBACK_ALLOWED_ENTITIES, true)) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Entity type tidak diizinkan untuk rollback: ' . $entityType,
                ], 400);
            }

            $table = $entityType;
            $oldData = $aktivitas['old_data'];
            if (is_string($oldData)) {
                $oldData = json_decode($oldData, true);
            }

            $user = $request->getAttribute('user');
            $idAdmin = $user['user_id'] ?? $user['id'] ?? null;

            $this->db->beginTransaction();
            try {
                if ($action === 'create') {
                    // Rollback create = hapus baris yang dulu di-insert
                    if (empty($entityId)) {
                        throw new \Exception('entity_id kosong untuk rollback create');
                    }
                    $stmtCur = $this->db->prepare("SELECT * FROM `" . $this->escapeIdentifier($table) . "` WHERE id = ? LIMIT 1");
                    $stmtCur->execute([$entityId]);
                    $currentBeforeRollback = $stmtCur->fetch(\PDO::FETCH_ASSOC);
                    if (!$currentBeforeRollback) {
                        throw new \Exception('Baris tidak ditemukan, tidak bisa rollback create');
                    }
                    $stmtDel = $this->db->prepare("DELETE FROM `" . $this->escapeIdentifier($table) . "` WHERE id = ?");
                    $stmtDel->execute([$entityId]);
                    $restoredRow = null;
                } elseif ($action === 'update') {
                    if (empty($oldData) || !is_array($oldData)) {
                        throw new \Exception('old_data tidak ada untuk rollback update');
                    }
                    $stmtCur = $this->db->prepare("SELECT * FROM `" . $this->escapeIdentifier($table) . "` WHERE id = ? LIMIT 1");
                    $stmtCur->execute([$entityId]);
                    $currentBeforeRollback = $stmtCur->fetch(\PDO::FETCH_ASSOC);
                    if (!$currentBeforeRollback) {
                        throw new \Exception('Baris tidak ditemukan di tabel, tidak bisa rollback');
                    }
                    $setParts = [];
                    $bindUpdate = [];
                    foreach ($oldData as $col => $val) {
                        if ($col === 'id') {
                            continue;
                        }
                        $setParts[] = "`" . $this->escapeIdentifier($col) . "` = ?";
                        $bindUpdate[] = $val;
                    }
                    if (count($setParts) === 0) {
                        throw new \Exception('Tidak ada kolom yang bisa di-restore');
                    }
                    $bindUpdate[] = $entityId;
                    $sqlUpdate = "UPDATE `" . $this->escapeIdentifier($table) . "` SET " . implode(', ', $setParts) . " WHERE id = ?";
                    $this->db->prepare($sqlUpdate)->execute($bindUpdate);
                    $stmtAfter = $this->db->prepare("SELECT * FROM `" . $this->escapeIdentifier($table) . "` WHERE id = ? LIMIT 1");
                    $stmtAfter->execute([$entityId]);
                    $restoredRow = $stmtAfter->fetch(\PDO::FETCH_ASSOC);
                } else {
                    // action === 'delete' → rollback = insert baris dari old_data
                    if (empty($oldData) || !is_array($oldData)) {
                        throw new \Exception('old_data tidak ada untuk rollback delete');
                    }
                    $currentBeforeRollback = null;
                    $cols = array_keys($oldData);
                    $placeholders = array_fill(0, count($cols), '?');
                    $colsEsc = array_map(function ($c) {
                        return '`' . $this->escapeIdentifier($c) . '`';
                    }, $cols);
                    $sqlInsert = "INSERT INTO `" . $this->escapeIdentifier($table) . "` (" . implode(', ', $colsEsc) . ") VALUES (" . implode(', ', $placeholders) . ")";
                    $this->db->prepare($sqlInsert)->execute(array_values($oldData));
                    $restoredId = isset($oldData['id']) ? $oldData['id'] : $this->db->lastInsertId();
                    $stmtAfter = $this->db->prepare("SELECT * FROM `" . $this->escapeIdentifier($table) . "` WHERE id = ? LIMIT 1");
                    $stmtAfter->execute([$restoredId]);
                    $restoredRow = $stmtAfter->fetch(\PDO::FETCH_ASSOC);
                }

                UserAktivitasLogger::log(
                    null,
                    $idAdmin,
                    UserAktivitasLogger::ACTION_ROLLBACK,
                    $entityType,
                    $entityId,
                    $currentBeforeRollback,
                    $restoredRow,
                    $request,
                    $aktivitasId
                );

                $this->db->commit();
                return $this->jsonResponse($response, [
                    'success' => true,
                    'message' => 'Rollback berhasil diterapkan',
                    'data' => [
                        'aktivitas_id' => $aktivitasId,
                        'entity_type' => $entityType,
                        'entity_id' => $entityId,
                    ],
                ], 200);
            } catch (\Throwable $e) {
                $this->db->rollBack();
                error_log('UserAktivitasController::rollback ' . $e->getMessage());
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Gagal rollback',
                ], 500);
            }
        } catch (\Throwable $e) {
            error_log('UserAktivitasController::rollback ' . $e->getMessage());
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Gagal rollback',
            ], 500);
        }
    }

    /**
     * Hanya mengizinkan karakter yang aman untuk nama tabel/kolom (a-z, 0-9, _).
     * Tabel seperti psb___registrasi dan pengeluaran___rencana tetap valid.
     */
    private function escapeIdentifier(string $name): string
    {
        return preg_replace('/[^a-zA-Z0-9_]/', '', $name);
    }

    private function accessLogTableExists(): bool
    {
        try {
            $stmt = $this->db->query("SHOW TABLES LIKE 'api___access_log'");
            return $stmt && $stmt->fetch() !== false;
        } catch (\Throwable $e) {
            return false;
        }
    }

    /**
     * GET /api/user-aktivitas/overview — ringkasan: top GET, top path, top user, mutasi, suspicious.
     * Query: days= (default 7, max 90)
     */
    public function getOverview(Request $request, Response $response): Response
    {
        try {
            $params = $request->getQueryParams();
            $days = isset($params['days']) ? (int) $params['days'] : 7;
            $days = max(1, min(90, $days));

            $hasAccess = $this->accessLogTableExists();

            $topGet = [];
            $topRoutes = [];
            $topUsers = [];
            $methodCounts = [];
            $statusCounts = [];
            $accessTotal = 0;

            if ($hasAccess) {
                $stmt = $this->db->prepare(
                    "SELECT route_key, COUNT(*) AS cnt
                     FROM api___access_log
                     WHERE method = 'GET' AND created_at >= (NOW() - INTERVAL ? DAY)
                     GROUP BY route_key
                     ORDER BY cnt DESC
                     LIMIT 20"
                );
                $stmt->execute([$days]);
                $topGet = $stmt->fetchAll(\PDO::FETCH_ASSOC);

                $stmt = $this->db->prepare(
                    "SELECT route_key, method, COUNT(*) AS cnt
                     FROM api___access_log
                     WHERE created_at >= (NOW() - INTERVAL ? DAY)
                     GROUP BY route_key, method
                     ORDER BY cnt DESC
                     LIMIT 30"
                );
                $stmt->execute([$days]);
                $topRoutes = $stmt->fetchAll(\PDO::FETCH_ASSOC);

                $stmt = $this->db->prepare(
                    "SELECT l.user_id, l.pengurus_id, p.nama AS pengurus_nama, u.username,
                            COUNT(*) AS cnt,
                            SUM(CASE WHEN l.method = 'GET' THEN 1 ELSE 0 END) AS get_cnt,
                            SUM(CASE WHEN l.method IN ('POST','PUT','PATCH','DELETE') THEN 1 ELSE 0 END) AS write_cnt
                     FROM api___access_log l
                     LEFT JOIN pengurus p ON p.id = l.pengurus_id
                     LEFT JOIN users u ON u.id = l.user_id
                     WHERE l.created_at >= (NOW() - INTERVAL ? DAY)
                       AND (l.user_id IS NOT NULL OR l.pengurus_id IS NOT NULL)
                     GROUP BY l.user_id, l.pengurus_id, p.nama, u.username
                     ORDER BY cnt DESC
                     LIMIT 20"
                );
                $stmt->execute([$days]);
                $topUsers = $stmt->fetchAll(\PDO::FETCH_ASSOC);

                $stmt = $this->db->prepare(
                    "SELECT method, COUNT(*) AS cnt
                     FROM api___access_log
                     WHERE created_at >= (NOW() - INTERVAL ? DAY)
                     GROUP BY method
                     ORDER BY cnt DESC"
                );
                $stmt->execute([$days]);
                $methodCounts = $stmt->fetchAll(\PDO::FETCH_ASSOC);

                $stmt = $this->db->prepare(
                    "SELECT
                        SUM(CASE WHEN status_code BETWEEN 200 AND 299 THEN 1 ELSE 0 END) AS ok_2xx,
                        SUM(CASE WHEN status_code BETWEEN 400 AND 499 THEN 1 ELSE 0 END) AS err_4xx,
                        SUM(CASE WHEN status_code >= 500 THEN 1 ELSE 0 END) AS err_5xx,
                        COUNT(*) AS total
                     FROM api___access_log
                     WHERE created_at >= (NOW() - INTERVAL ? DAY)"
                );
                $stmt->execute([$days]);
                $statusCounts = $stmt->fetch(\PDO::FETCH_ASSOC) ?: [];
                $accessTotal = (int) ($statusCounts['total'] ?? 0);
            }

            // Mutasi dari user___aktivitas
            $stmt = $this->db->prepare(
                "SELECT action, COUNT(*) AS cnt
                 FROM user___aktivitas
                 WHERE created_at >= (NOW() - INTERVAL ? DAY)
                 GROUP BY action
                 ORDER BY cnt DESC"
            );
            $stmt->execute([$days]);
            $mutationCounts = $stmt->fetchAll(\PDO::FETCH_ASSOC);

            $stmt = $this->db->prepare(
                "SELECT entity_type, action, COUNT(*) AS cnt
                 FROM user___aktivitas
                 WHERE created_at >= (NOW() - INTERVAL ? DAY)
                 GROUP BY entity_type, action
                 ORDER BY cnt DESC
                 LIMIT 25"
            );
            $stmt->execute([$days]);
            $topEntities = $stmt->fetchAll(\PDO::FETCH_ASSOC);

            $suspicious = $this->buildSuspiciousSignals($days, $hasAccess);

            return $this->jsonResponse($response, [
                'success' => true,
                'data' => [
                    'days' => $days,
                    'access_log_enabled' => $hasAccess,
                    'access_total' => $accessTotal,
                    'top_get' => $topGet,
                    'top_routes' => $topRoutes,
                    'top_users' => $topUsers,
                    'method_counts' => $methodCounts,
                    'status_counts' => $statusCounts,
                    'mutation_counts' => $mutationCounts,
                    'top_entities' => $topEntities,
                    'suspicious' => $suspicious,
                ],
            ], 200);
        } catch (\Throwable $e) {
            error_log('UserAktivitasController::getOverview ' . $e->getMessage());
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Gagal memuat ringkasan aktivitas',
            ], 500);
        }
    }

    /**
     * @return list<array{type: string, severity: string, title: string, detail: string, count: int, sample?: mixed}>
     */
    private function buildSuspiciousSignals(int $days, bool $hasAccess): array
    {
        $out = [];

        // Banyak DELETE / update dalam 1 jam per user (mutasi)
        $stmt = $this->db->prepare(
            "SELECT a.pengurus_id, p.nama AS pengurus_nama, a.user_id,
                    SUM(CASE WHEN a.action = 'delete' THEN 1 ELSE 0 END) AS del_cnt,
                    SUM(CASE WHEN a.action = 'update' THEN 1 ELSE 0 END) AS upd_cnt,
                    COUNT(*) AS cnt
             FROM user___aktivitas a
             LEFT JOIN pengurus p ON p.id = a.pengurus_id
             WHERE a.created_at >= (NOW() - INTERVAL ? DAY)
               AND a.action IN ('delete', 'update')
             GROUP BY a.pengurus_id, p.nama, a.user_id
             HAVING del_cnt >= 10 OR upd_cnt >= 40
             ORDER BY del_cnt DESC, upd_cnt DESC
             LIMIT 15"
        );
        $stmt->execute([$days]);
        foreach ($stmt->fetchAll(\PDO::FETCH_ASSOC) as $row) {
            $name = $row['pengurus_nama'] ?: ('user#' . ($row['user_id'] ?? '?'));
            $out[] = [
                'type' => 'mass_mutation',
                'severity' => ((int) $row['del_cnt'] >= 20) ? 'high' : 'medium',
                'title' => 'Mutasi massal: ' . $name,
                'detail' => 'delete=' . (int) $row['del_cnt'] . ', update=' . (int) $row['upd_cnt'] . ' dalam ' . $days . ' hari',
                'count' => (int) $row['cnt'],
                'sample' => $row,
            ];
        }

        if ($hasAccess) {
            // Banyak 401/403
            $stmt = $this->db->prepare(
                "SELECT COALESCE(l.user_id, 0) AS user_id, COALESCE(l.pengurus_id, 0) AS pengurus_id,
                        p.nama AS pengurus_nama, u.username,
                        COUNT(*) AS cnt
                 FROM api___access_log l
                 LEFT JOIN pengurus p ON p.id = l.pengurus_id
                 LEFT JOIN users u ON u.id = l.user_id
                 WHERE l.created_at >= (NOW() - INTERVAL ? DAY)
                   AND l.status_code IN (401, 403)
                 GROUP BY l.user_id, l.pengurus_id, p.nama, u.username
                 HAVING cnt >= 20
                 ORDER BY cnt DESC
                 LIMIT 15"
            );
            $stmt->execute([$days]);
            foreach ($stmt->fetchAll(\PDO::FETCH_ASSOC) as $row) {
                $name = $row['pengurus_nama'] ?: ($row['username'] ?: ('anon/ip'));
                $out[] = [
                    'type' => 'auth_failures',
                    'severity' => ((int) $row['cnt'] >= 50) ? 'high' : 'medium',
                    'title' => 'Gagal otorisasi berulang: ' . $name,
                    'detail' => (int) $row['cnt'] . ' respons 401/403 dalam ' . $days . ' hari',
                    'count' => (int) $row['cnt'],
                    'sample' => $row,
                ];
            }

            // Akses malam hari (00:00–04:59 WIB) + write methods
            $stmt = $this->db->prepare(
                "SELECT COALESCE(l.pengurus_id, 0) AS pengurus_id, p.nama AS pengurus_nama, l.user_id,
                        COUNT(*) AS cnt
                 FROM api___access_log l
                 LEFT JOIN pengurus p ON p.id = l.pengurus_id
                 WHERE l.created_at >= (NOW() - INTERVAL ? DAY)
                   AND HOUR(l.created_at) < 5
                   AND l.method IN ('POST', 'PUT', 'PATCH', 'DELETE')
                   AND (l.user_id IS NOT NULL OR l.pengurus_id IS NOT NULL)
                 GROUP BY l.pengurus_id, p.nama, l.user_id
                 HAVING cnt >= 5
                 ORDER BY cnt DESC
                 LIMIT 10"
            );
            $stmt->execute([$days]);
            foreach ($stmt->fetchAll(\PDO::FETCH_ASSOC) as $row) {
                $name = $row['pengurus_nama'] ?: ('user#' . ($row['user_id'] ?? '?'));
                $out[] = [
                    'type' => 'night_writes',
                    'severity' => 'medium',
                    'title' => 'Tulis malam hari: ' . $name,
                    'detail' => (int) $row['cnt'] . ' POST/PUT/PATCH/DELETE antara jam 00–05 WIB',
                    'count' => (int) $row['cnt'],
                    'sample' => $row,
                ];
            }

            // Burst: >80 request / 10 menit per user (hari terakhir saja)
            $stmt = $this->db->query(
                "SELECT l.pengurus_id, p.nama AS pengurus_nama, l.user_id,
                        DATE_FORMAT(l.created_at, '%Y-%m-%d %H:%i') AS bucket_min,
                        COUNT(*) AS cnt
                 FROM api___access_log l
                 LEFT JOIN pengurus p ON p.id = l.pengurus_id
                 WHERE l.created_at >= (NOW() - INTERVAL 1 DAY)
                   AND (l.user_id IS NOT NULL OR l.pengurus_id IS NOT NULL)
                 GROUP BY l.pengurus_id, p.nama, l.user_id, bucket_min
                 HAVING cnt >= 80
                 ORDER BY cnt DESC
                 LIMIT 10"
            );
            if ($stmt) {
                foreach ($stmt->fetchAll(\PDO::FETCH_ASSOC) as $row) {
                    $name = $row['pengurus_nama'] ?: ('user#' . ($row['user_id'] ?? '?'));
                    $out[] = [
                        'type' => 'request_burst',
                        'severity' => 'high',
                        'title' => 'Burst request: ' . $name,
                        'detail' => (int) $row['cnt'] . ' hit pada menit ' . ($row['bucket_min'] ?? ''),
                        'count' => (int) $row['cnt'],
                        'sample' => $row,
                    ];
                }
            }
        }

        return $out;
    }

    /**
     * GET /api/user-aktivitas/access-log — daftar log HTTP.
     * Query: method, user_id, pengurus_id, route_key, status_min, status_max, date_from, date_to, limit, offset
     */
    public function getAccessLog(Request $request, Response $response): Response
    {
        try {
            if (!$this->accessLogTableExists()) {
                return $this->jsonResponse($response, [
                    'success' => true,
                    'data' => [],
                    'total' => 0,
                    'message' => 'Tabel api___access_log belum ada. Jalankan migrasi.',
                ], 200);
            }

            $params = $request->getQueryParams();
            $method = isset($params['method']) && $params['method'] !== '' ? strtoupper(trim((string) $params['method'])) : null;
            $userId = isset($params['user_id']) && $params['user_id'] !== '' ? (int) $params['user_id'] : null;
            $pengurusId = isset($params['pengurus_id']) && $params['pengurus_id'] !== '' ? (int) $params['pengurus_id'] : null;
            $routeKey = isset($params['route_key']) && $params['route_key'] !== '' ? trim((string) $params['route_key']) : null;
            $search = isset($params['search']) && $params['search'] !== '' ? trim((string) $params['search']) : null;
            $dateFrom = isset($params['date_from']) && $params['date_from'] !== '' ? trim((string) $params['date_from']) : null;
            $dateTo = isset($params['date_to']) && $params['date_to'] !== '' ? trim((string) $params['date_to']) : null;
            $limit = isset($params['limit']) && (int) $params['limit'] > 0 ? min((int) $params['limit'], 500) : 100;
            $offset = isset($params['offset']) && (int) $params['offset'] >= 0 ? (int) $params['offset'] : 0;

            $where = [];
            $bind = [];
            if ($method !== null) {
                $where[] = 'l.method = ?';
                $bind[] = $method;
            }
            if ($userId !== null) {
                $where[] = 'l.user_id = ?';
                $bind[] = $userId;
            }
            if ($pengurusId !== null) {
                $where[] = 'l.pengurus_id = ?';
                $bind[] = $pengurusId;
            }
            if ($routeKey !== null) {
                $where[] = 'l.route_key LIKE ?';
                $bind[] = '%' . $routeKey . '%';
            }
            if ($search !== null) {
                $where[] = '(l.path LIKE ? OR l.route_key LIKE ? OR p.nama LIKE ? OR u.username LIKE ?)';
                $q = '%' . $search . '%';
                $bind[] = $q;
                $bind[] = $q;
                $bind[] = $q;
                $bind[] = $q;
            }
            if ($dateFrom !== null) {
                $where[] = 'DATE(l.created_at) >= ?';
                $bind[] = $dateFrom;
            }
            if ($dateTo !== null) {
                $where[] = 'DATE(l.created_at) <= ?';
                $bind[] = $dateTo;
            }

            $whereSql = count($where) > 0 ? 'WHERE ' . implode(' AND ', $where) : '';

            $countSql = "SELECT COUNT(*) FROM api___access_log l
                LEFT JOIN pengurus p ON p.id = l.pengurus_id
                LEFT JOIN users u ON u.id = l.user_id
                $whereSql";
            $stmtCount = $this->db->prepare($countSql);
            $stmtCount->execute($bind);
            $total = (int) $stmtCount->fetchColumn();

            $sql = "SELECT l.id, l.user_id, l.pengurus_id, l.method, l.path, l.route_key, l.status_code,
                           l.duration_ms, l.ip_address, l.user_agent, l.created_at,
                           p.nama AS pengurus_nama, u.username
                    FROM api___access_log l
                    LEFT JOIN pengurus p ON p.id = l.pengurus_id
                    LEFT JOIN users u ON u.id = l.user_id
                    $whereSql
                    ORDER BY l.created_at DESC
                    LIMIT " . (int) $limit . ' OFFSET ' . (int) $offset;
            $stmt = $this->db->prepare($sql);
            $stmt->execute($bind);
            $rows = $stmt->fetchAll(\PDO::FETCH_ASSOC);

            return $this->jsonResponse($response, [
                'success' => true,
                'data' => $rows,
                'total' => $total,
                'limit' => $limit,
                'offset' => $offset,
            ], 200);
        } catch (\Throwable $e) {
            error_log('UserAktivitasController::getAccessLog ' . $e->getMessage());
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Gagal mengambil access log',
            ], 500);
        }
    }
}

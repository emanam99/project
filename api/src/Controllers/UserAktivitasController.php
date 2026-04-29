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
}

<?php

namespace App\Controllers;

use App\Database;
use App\Helpers\TextSanitizer;
use App\Helpers\UserAktivitasLogger;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;

class DaerahController
{
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
     * GET /api/daerah - List daerah (filter: kategori, status)
     */
    public function getAll(Request $request, Response $response): Response
    {
        try {
            $params = $request->getQueryParams();
            $kategori = $params['kategori'] ?? null;
            $status = $params['status'] ?? null;

            $sql = "SELECT * FROM daerah WHERE 1=1";
            $bind = [];
            if ($kategori !== null && $kategori !== '') {
                $sql .= " AND kategori = ?";
                $bind[] = $kategori;
            }
            if ($status !== null && $status !== '') {
                $sql .= " AND status = ?";
                $bind[] = $status;
            }
            $sql .= " ORDER BY kategori, daerah";

            $stmt = $this->db->prepare($sql);
            $stmt->execute($bind);
            $rows = $stmt->fetchAll(\PDO::FETCH_ASSOC);

            return $this->jsonResponse($response, [
                'success' => true,
                'data' => $rows
            ], 200);
        } catch (\Exception $e) {
            error_log("DaerahController getAll: " . $e->getMessage());
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Gagal mengambil data daerah',
                'error' => $e->getMessage()
            ], 500);
        }
    }

    /**
     * GET /api/daerah/{id}
     */
    public function getById(Request $request, Response $response, array $args): Response
    {
        try {
            $id = (int) ($args['id'] ?? 0);
            if (!$id) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'ID daerah tidak valid'
                ], 400);
            }

            $stmt = $this->db->prepare("SELECT * FROM daerah WHERE id = ?");
            $stmt->execute([$id]);
            $row = $stmt->fetch(\PDO::FETCH_ASSOC);
            if (!$row) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Daerah tidak ditemukan'
                ], 404);
            }

            return $this->jsonResponse($response, [
                'success' => true,
                'data' => $row
            ], 200);
        } catch (\Exception $e) {
            error_log("DaerahController getById: " . $e->getMessage());
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Gagal mengambil data daerah',
                'error' => $e->getMessage()
            ], 500);
        }
    }

    /**
     * POST /api/daerah - Create
     */
    public function create(Request $request, Response $response): Response
    {
        try {
            $data = $request->getParsedBody();
            if (empty(trim($data['kategori'] ?? ''))) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Kategori wajib diisi'
                ], 400);
            }
            if (empty(trim($data['daerah'] ?? ''))) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Daerah wajib diisi'
                ], 400);
            }

            $kategori = TextSanitizer::cleanText($data['kategori'] ?? '');
            $daerah = TextSanitizer::cleanText($data['daerah'] ?? '');
            $keterangan = TextSanitizer::cleanTextOrNull($data['keterangan'] ?? null);
            $status = isset($data['status']) && in_array($data['status'], ['aktif', 'nonaktif'], true)
                ? $data['status'] : 'aktif';

            $waktu = (new \DateTime('now', new \DateTimeZone('Asia/Jakarta')))->format('Y-m-d H:i:s');
            $stmt = $this->db->prepare("
                INSERT INTO daerah (kategori, daerah, keterangan, status, tanggal_dibuat)
                VALUES (?, ?, ?, ?, ?)
            ");
            $stmt->execute([$kategori, $daerah, $keterangan, $status, $waktu]);
            $newId = (int) $this->db->lastInsertId();

            $newRow = [
                'id' => $newId,
                'kategori' => $kategori,
                'daerah' => $daerah,
                'keterangan' => $keterangan,
                'status' => $status,
                'tanggal_dibuat' => $waktu
            ];
            $user = $request->getAttribute('user');
            $pengurusId = isset($user['user_id']) ? (int) $user['user_id'] : (isset($user['id']) ? (int) $user['id'] : null);
            if ($pengurusId !== null) {
                UserAktivitasLogger::log(null, $pengurusId, UserAktivitasLogger::ACTION_CREATE, 'daerah', (string) $newId, null, $newRow, $request);
            }

            return $this->jsonResponse($response, [
                'success' => true,
                'message' => 'Daerah berhasil ditambahkan',
                'data' => $newRow
            ], 201);
        } catch (\Exception $e) {
            error_log("DaerahController create: " . $e->getMessage());
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Gagal menambahkan daerah',
                'error' => $e->getMessage()
            ], 500);
        }
    }

    /**
     * PUT /api/daerah/{id} - Update
     */
    public function update(Request $request, Response $response, array $args): Response
    {
        try {
            $id = (int) ($args['id'] ?? 0);
            if (!$id) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'ID daerah tidak valid'
                ], 400);
            }

            $stmt = $this->db->prepare("SELECT * FROM daerah WHERE id = ?");
            $stmt->execute([$id]);
            $old = $stmt->fetch(\PDO::FETCH_ASSOC);
            if (!$old) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Daerah tidak ditemukan'
                ], 404);
            }

            $data = $request->getParsedBody();
            $kategori = isset($data['kategori']) ? TextSanitizer::cleanText($data['kategori']) : $old['kategori'];
            $daerah = isset($data['daerah']) ? TextSanitizer::cleanText($data['daerah']) : $old['daerah'];
            $keterangan = array_key_exists('keterangan', $data) ? TextSanitizer::cleanTextOrNull($data['keterangan']) : $old['keterangan'];
            $status = isset($data['status']) && in_array($data['status'], ['aktif', 'nonaktif'], true)
                ? $data['status'] : $old['status'];

            $stmt = $this->db->prepare("
                UPDATE daerah SET kategori = ?, daerah = ?, keterangan = ?, status = ? WHERE id = ?
            ");
            $stmt->execute([$kategori, $daerah, $keterangan, $status, $id]);

            $stmtNew = $this->db->prepare("SELECT * FROM daerah WHERE id = ?");
            $stmtNew->execute([$id]);
            $new = $stmtNew->fetch(\PDO::FETCH_ASSOC);
            $user = $request->getAttribute('user');
            $pengurusId = isset($user['user_id']) ? (int) $user['user_id'] : (isset($user['id']) ? (int) $user['id'] : null);
            if ($pengurusId !== null) {
                UserAktivitasLogger::log(null, $pengurusId, UserAktivitasLogger::ACTION_UPDATE, 'daerah', (string) $id, $old, $new, $request);
            }

            return $this->jsonResponse($response, [
                'success' => true,
                'message' => 'Daerah berhasil diupdate',
                'data' => $new
            ], 200);
        } catch (\Exception $e) {
            error_log("DaerahController update: " . $e->getMessage());
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Gagal mengupdate daerah',
                'error' => $e->getMessage()
            ], 500);
        }
    }

    /**
     * PATCH /api/daerah/{id}/status - Set status (aktif / nonaktif)
     */
    public function setStatus(Request $request, Response $response, array $args): Response
    {
        try {
            $id = (int) ($args['id'] ?? 0);
            if (!$id) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'ID daerah tidak valid'
                ], 400);
            }

            $data = $request->getParsedBody();
            $status = isset($data['status']) && in_array($data['status'], ['aktif', 'nonaktif'], true)
                ? $data['status'] : null;
            if ($status === null) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Status harus aktif atau nonaktif'
                ], 400);
            }

            $stmt = $this->db->prepare("SELECT * FROM daerah WHERE id = ?");
            $stmt->execute([$id]);
            $old = $stmt->fetch(\PDO::FETCH_ASSOC);
            if (!$old) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Daerah tidak ditemukan'
                ], 404);
            }

            $stmt = $this->db->prepare("UPDATE daerah SET status = ? WHERE id = ?");
            $stmt->execute([$status, $id]);
            $stmtNew = $this->db->prepare("SELECT * FROM daerah WHERE id = ?");
            $stmtNew->execute([$id]);
            $new = $stmtNew->fetch(\PDO::FETCH_ASSOC);

            $user = $request->getAttribute('user');
            $pengurusId = isset($user['user_id']) ? (int) $user['user_id'] : (isset($user['id']) ? (int) $user['id'] : null);
            if ($new && $pengurusId !== null) {
                UserAktivitasLogger::log(null, $pengurusId, UserAktivitasLogger::ACTION_UPDATE, 'daerah', (string) $id, $old, $new, $request);
            }

            return $this->jsonResponse($response, [
                'success' => true,
                'message' => $status === 'aktif' ? 'Daerah diaktifkan' : 'Daerah dinonaktifkan',
                'data' => $new
            ], 200);
        } catch (\Exception $e) {
            error_log("DaerahController setStatus: " . $e->getMessage());
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Gagal mengubah status daerah',
                'error' => $e->getMessage()
            ], 500);
        }
    }
}

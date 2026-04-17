<?php

namespace App\Controllers;

use App\Database;
use App\Helpers\LiveDomisiliCacheNotifier;
use App\Helpers\TextSanitizer;
use App\Helpers\UserAktivitasLogger;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;

class DaerahKamarController
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
     * GET /api/daerah-kamar - List (filter: id_daerah, status). JOIN daerah untuk nama daerah.
     */
    public function getAll(Request $request, Response $response): Response
    {
        try {
            $params = $request->getQueryParams();
            $idDaerah = isset($params['id_daerah']) ? (int) $params['id_daerah'] : null;
            $status = $params['status'] ?? null;

            $sql = "SELECT dk.*, d.kategori AS daerah_kategori, d.daerah AS daerah_nama,
                           ka.ketua_aktif_nama, ka.ketua_aktif_nis
                    FROM daerah___kamar dk
                    LEFT JOIN daerah d ON d.id = dk.id_daerah
                    LEFT JOIN (
                        SELECT dkk.id_daerah_kamar, s.nama AS ketua_aktif_nama, s.nis AS ketua_aktif_nis
                        FROM daerah___ketua_kamar dkk
                        INNER JOIN santri s ON s.id = dkk.id_ketua_kamar
                        INNER JOIN (
                            SELECT id_daerah_kamar, MAX(id) AS mx
                            FROM daerah___ketua_kamar
                            WHERE status = 'aktif'
                            GROUP BY id_daerah_kamar
                        ) z ON z.mx = dkk.id
                    ) ka ON ka.id_daerah_kamar = dk.id
                    WHERE 1=1";
            $bind = [];
            if ($idDaerah !== null && $idDaerah > 0) {
                $sql .= " AND dk.id_daerah = ?";
                $bind[] = $idDaerah;
            }
            if ($status !== null && $status !== '') {
                $sql .= " AND dk.status = ?";
                $bind[] = $status;
            }
            $sql .= " ORDER BY dk.id_daerah, dk.kamar";

            $stmt = $this->db->prepare($sql);
            $stmt->execute($bind);
            $rows = $stmt->fetchAll(\PDO::FETCH_ASSOC);

            return $this->jsonResponse($response, [
                'success' => true,
                'data' => $rows
            ], 200);
        } catch (\Exception $e) {
            error_log("DaerahKamarController getAll: " . $e->getMessage());
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Gagal mengambil data kamar',
                'error' => $e->getMessage()
            ], 500);
        }
    }

    /**
     * GET /api/daerah-kamar/{id}
     */
    public function getById(Request $request, Response $response, array $args): Response
    {
        try {
            $id = (int) ($args['id'] ?? 0);
            if (!$id) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'ID kamar tidak valid'
                ], 400);
            }

            $stmt = $this->db->prepare("
                SELECT dk.*, d.kategori AS daerah_kategori, d.daerah AS daerah_nama,
                       ka.ketua_aktif_nama, ka.ketua_aktif_nis
                FROM daerah___kamar dk
                LEFT JOIN daerah d ON d.id = dk.id_daerah
                LEFT JOIN (
                    SELECT dkk.id_daerah_kamar, s.nama AS ketua_aktif_nama, s.nis AS ketua_aktif_nis
                    FROM daerah___ketua_kamar dkk
                    INNER JOIN santri s ON s.id = dkk.id_ketua_kamar
                    INNER JOIN (
                        SELECT id_daerah_kamar, MAX(id) AS mx
                        FROM daerah___ketua_kamar
                        WHERE status = 'aktif'
                        GROUP BY id_daerah_kamar
                    ) z ON z.mx = dkk.id
                ) ka ON ka.id_daerah_kamar = dk.id
                WHERE dk.id = ?
            ");
            $stmt->execute([$id]);
            $row = $stmt->fetch(\PDO::FETCH_ASSOC);
            if (!$row) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Kamar tidak ditemukan'
                ], 404);
            }

            return $this->jsonResponse($response, [
                'success' => true,
                'data' => $row
            ], 200);
        } catch (\Exception $e) {
            error_log("DaerahKamarController getById: " . $e->getMessage());
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Gagal mengambil data kamar',
                'error' => $e->getMessage()
            ], 500);
        }
    }

    /**
     * POST /api/daerah-kamar - Create
     */
    public function create(Request $request, Response $response): Response
    {
        try {
            $data = $request->getParsedBody();
            if (empty($data['id_daerah'])) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'ID daerah wajib diisi'
                ], 400);
            }
            if (empty(trim($data['kamar'] ?? ''))) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Nama kamar wajib diisi'
                ], 400);
            }

            $idDaerah = (int) $data['id_daerah'];
            $kamar = TextSanitizer::cleanText($data['kamar'] ?? '');
            $status = isset($data['status']) && in_array($data['status'], ['aktif', 'nonaktif'], true)
                ? $data['status'] : 'aktif';
            $keterangan = TextSanitizer::cleanTextOrNull($data['keterangan'] ?? null);

            $waktu = (new \DateTime('now', new \DateTimeZone('Asia/Jakarta')))->format('Y-m-d H:i:s');
            $stmt = $this->db->prepare("
                INSERT INTO daerah___kamar (id_daerah, kamar, status, keterangan, tanggal_dibuat)
                VALUES (?, ?, ?, ?, ?)
            ");
            $stmt->execute([$idDaerah, $kamar, $status, $keterangan, $waktu]);
            $newId = (int) $this->db->lastInsertId();

            $newRow = [
                'id' => $newId,
                'id_daerah' => $idDaerah,
                'kamar' => $kamar,
                'status' => $status,
                'keterangan' => $keterangan,
                'tanggal_dibuat' => $waktu
            ];
            $user = $request->getAttribute('user');
            $pengurusId = isset($user['user_id']) ? (int) $user['user_id'] : (isset($user['id']) ? (int) $user['id'] : null);
            if ($pengurusId !== null) {
                UserAktivitasLogger::log(null, $pengurusId, UserAktivitasLogger::ACTION_CREATE, 'daerah___kamar', (string) $newId, null, $newRow, $request);
            }

            LiveDomisiliCacheNotifier::ping();

            return $this->jsonResponse($response, [
                'success' => true,
                'message' => 'Kamar berhasil ditambahkan',
                'data' => $newRow
            ], 201);
        } catch (\Exception $e) {
            error_log("DaerahKamarController create: " . $e->getMessage());
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Gagal menambahkan kamar',
                'error' => $e->getMessage()
            ], 500);
        }
    }

    /**
     * PUT /api/daerah-kamar/{id} - Update
     */
    public function update(Request $request, Response $response, array $args): Response
    {
        try {
            $id = (int) ($args['id'] ?? 0);
            if (!$id) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'ID kamar tidak valid'
                ], 400);
            }

            $stmt = $this->db->prepare("SELECT * FROM daerah___kamar WHERE id = ?");
            $stmt->execute([$id]);
            $old = $stmt->fetch(\PDO::FETCH_ASSOC);
            if (!$old) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Kamar tidak ditemukan'
                ], 404);
            }

            $data = $request->getParsedBody();
            $idDaerah = isset($data['id_daerah']) ? (int) $data['id_daerah'] : (int) $old['id_daerah'];
            $kamar = isset($data['kamar']) ? TextSanitizer::cleanText($data['kamar']) : $old['kamar'];
            $status = isset($data['status']) && in_array($data['status'], ['aktif', 'nonaktif'], true)
                ? $data['status'] : $old['status'];
            $keterangan = array_key_exists('keterangan', $data) ? TextSanitizer::cleanTextOrNull($data['keterangan']) : $old['keterangan'];

            $stmt = $this->db->prepare("
                UPDATE daerah___kamar SET id_daerah = ?, kamar = ?, status = ?, keterangan = ? WHERE id = ?
            ");
            $stmt->execute([$idDaerah, $kamar, $status, $keterangan, $id]);

            $stmtNew = $this->db->prepare("SELECT * FROM daerah___kamar WHERE id = ?");
            $stmtNew->execute([$id]);
            $new = $stmtNew->fetch(\PDO::FETCH_ASSOC);
            $user = $request->getAttribute('user');
            $pengurusId = isset($user['user_id']) ? (int) $user['user_id'] : (isset($user['id']) ? (int) $user['id'] : null);
            if ($pengurusId !== null) {
                UserAktivitasLogger::log(null, $pengurusId, UserAktivitasLogger::ACTION_UPDATE, 'daerah___kamar', (string) $id, $old, $new, $request);
            }

            LiveDomisiliCacheNotifier::ping();

            return $this->jsonResponse($response, [
                'success' => true,
                'message' => 'Kamar berhasil diupdate',
                'data' => $new
            ], 200);
        } catch (\Exception $e) {
            error_log("DaerahKamarController update: " . $e->getMessage());
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Gagal mengupdate kamar',
                'error' => $e->getMessage()
            ], 500);
        }
    }

    /**
     * PATCH /api/daerah-kamar/{id}/status - Set status
     */
    public function setStatus(Request $request, Response $response, array $args): Response
    {
        try {
            $id = (int) ($args['id'] ?? 0);
            if (!$id) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'ID kamar tidak valid'
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

            $stmt = $this->db->prepare("SELECT * FROM daerah___kamar WHERE id = ?");
            $stmt->execute([$id]);
            $old = $stmt->fetch(\PDO::FETCH_ASSOC);
            if (!$old) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Kamar tidak ditemukan'
                ], 404);
            }

            $stmt = $this->db->prepare("UPDATE daerah___kamar SET status = ? WHERE id = ?");
            $stmt->execute([$status, $id]);
            $stmtNew = $this->db->prepare("SELECT * FROM daerah___kamar WHERE id = ?");
            $stmtNew->execute([$id]);
            $new = $stmtNew->fetch(\PDO::FETCH_ASSOC);

            $user = $request->getAttribute('user');
            $pengurusId = isset($user['user_id']) ? (int) $user['user_id'] : (isset($user['id']) ? (int) $user['id'] : null);
            if ($new && $pengurusId !== null) {
                UserAktivitasLogger::log(null, $pengurusId, UserAktivitasLogger::ACTION_UPDATE, 'daerah___kamar', (string) $id, $old, $new, $request);
            }

            LiveDomisiliCacheNotifier::ping();

            return $this->jsonResponse($response, [
                'success' => true,
                'message' => $status === 'aktif' ? 'Kamar diaktifkan' : 'Kamar dinonaktifkan',
                'data' => $new
            ], 200);
        } catch (\Exception $e) {
            error_log("DaerahKamarController setStatus: " . $e->getMessage());
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Gagal mengubah status kamar',
                'error' => $e->getMessage()
            ], 500);
        }
    }
}

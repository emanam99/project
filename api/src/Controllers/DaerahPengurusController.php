<?php

namespace App\Controllers;

use App\Database;
use App\Helpers\LiveDomisiliCacheNotifier;
use App\Helpers\TextSanitizer;
use App\Helpers\UserAktivitasLogger;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;

class DaerahPengurusController
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
     * GET /api/daerah-pengurus - List (filter: id_daerah, status)
     */
    public function getAll(Request $request, Response $response): Response
    {
        try {
            $params = $request->getQueryParams();
            $idDaerah = isset($params['id_daerah']) ? (int) $params['id_daerah'] : null;
            $status = $params['status'] ?? null;

            $sql = "SELECT dp.*, p.nama AS pengurus_nama, j.nama AS jabatan_nama
                    FROM daerah___pengurus dp
                    LEFT JOIN pengurus p ON p.id = dp.id_pengurus
                    LEFT JOIN jabatan j ON j.id = dp.id_jabatan
                    WHERE 1=1";
            $bind = [];
            if ($idDaerah !== null && $idDaerah > 0) {
                $sql .= " AND dp.id_daerah = ?";
                $bind[] = $idDaerah;
            }
            if ($status !== null && $status !== '') {
                $sql .= " AND dp.status = ?";
                $bind[] = $status;
            }
            $sql .= " ORDER BY dp.status DESC, dp.tahun_ajaran DESC, dp.tanggal_dibuat DESC";

            $stmt = $this->db->prepare($sql);
            $stmt->execute($bind);
            $rows = $stmt->fetchAll(\PDO::FETCH_ASSOC);

            return $this->jsonResponse($response, [
                'success' => true,
                'data' => $rows
            ], 200);
        } catch (\Exception $e) {
            error_log("DaerahPengurusController getAll: " . $e->getMessage());
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Gagal mengambil data pengurus daerah',
                'error' => $e->getMessage()
            ], 500);
        }
    }

    /**
     * GET /api/daerah-pengurus/{id}
     */
    public function getById(Request $request, Response $response, array $args): Response
    {
        try {
            $id = (int) ($args['id'] ?? 0);
            if (!$id) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'ID tidak valid'
                ], 400);
            }

            $stmt = $this->db->prepare("
                SELECT dp.*, p.nama AS pengurus_nama, j.nama AS jabatan_nama
                FROM daerah___pengurus dp
                LEFT JOIN pengurus p ON p.id = dp.id_pengurus
                LEFT JOIN jabatan j ON j.id = dp.id_jabatan
                WHERE dp.id = ?
            ");
            $stmt->execute([$id]);
            $row = $stmt->fetch(\PDO::FETCH_ASSOC);
            if (!$row) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Data tidak ditemukan'
                ], 404);
            }

            return $this->jsonResponse($response, [
                'success' => true,
                'data' => $row
            ], 200);
        } catch (\Exception $e) {
            error_log("DaerahPengurusController getById: " . $e->getMessage());
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Gagal mengambil data',
                'error' => $e->getMessage()
            ], 500);
        }
    }

    /**
     * POST /api/daerah-pengurus - Create
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

            $idDaerah = (int) $data['id_daerah'];
            $idPengurus = isset($data['id_pengurus']) && $data['id_pengurus'] !== '' ? (int) $data['id_pengurus'] : null;
            $idJabatan = isset($data['id_jabatan']) && $data['id_jabatan'] !== '' ? (int) $data['id_jabatan'] : null;
            $tahunAjaran = TextSanitizer::cleanTextOrNull($data['tahun_ajaran'] ?? null);
            $status = isset($data['status']) && in_array($data['status'], ['aktif', 'nonaktif'], true)
                ? $data['status'] : 'aktif';
            $keterangan = TextSanitizer::cleanTextOrNull($data['keterangan'] ?? null);

            $waktu = (new \DateTime('now', new \DateTimeZone('Asia/Jakarta')))->format('Y-m-d H:i:s');
            $stmt = $this->db->prepare("
                INSERT INTO daerah___pengurus (id_daerah, id_pengurus, id_jabatan, tahun_ajaran, status, keterangan, tanggal_dibuat)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            ");
            $stmt->execute([$idDaerah, $idPengurus, $idJabatan, $tahunAjaran, $status, $keterangan, $waktu]);
            $newId = (int) $this->db->lastInsertId();

            $newRow = [
                'id' => $newId,
                'id_daerah' => $idDaerah,
                'id_pengurus' => $idPengurus,
                'id_jabatan' => $idJabatan,
                'tahun_ajaran' => $tahunAjaran,
                'status' => $status,
                'keterangan' => $keterangan,
                'tanggal_dibuat' => $waktu
            ];
            $user = $request->getAttribute('user');
            $pengurusId = isset($user['user_id']) ? (int) $user['user_id'] : (isset($user['id']) ? (int) $user['id'] : null);
            if ($pengurusId !== null) {
                UserAktivitasLogger::log(null, $pengurusId, UserAktivitasLogger::ACTION_CREATE, 'daerah___pengurus', (string) $newId, null, $newRow, $request);
            }

            LiveDomisiliCacheNotifier::ping();

            return $this->jsonResponse($response, [
                'success' => true,
                'message' => 'Pengurus daerah berhasil ditambahkan',
                'data' => $newRow
            ], 201);
        } catch (\Exception $e) {
            error_log("DaerahPengurusController create: " . $e->getMessage());
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Gagal menambahkan pengurus daerah',
                'error' => $e->getMessage()
            ], 500);
        }
    }

    /**
     * PUT /api/daerah-pengurus/{id} - Update
     */
    public function update(Request $request, Response $response, array $args): Response
    {
        try {
            $id = (int) ($args['id'] ?? 0);
            if (!$id) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'ID tidak valid'
                ], 400);
            }

            $stmt = $this->db->prepare("SELECT * FROM daerah___pengurus WHERE id = ?");
            $stmt->execute([$id]);
            $old = $stmt->fetch(\PDO::FETCH_ASSOC);
            if (!$old) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Data tidak ditemukan'
                ], 404);
            }

            $data = $request->getParsedBody();
            $idDaerah = isset($data['id_daerah']) ? (int) $data['id_daerah'] : (int) $old['id_daerah'];
            $idPengurus = array_key_exists('id_pengurus', $data) && $data['id_pengurus'] !== '' ? (int) $data['id_pengurus'] : null;
            $idJabatan = array_key_exists('id_jabatan', $data) && $data['id_jabatan'] !== '' ? (int) $data['id_jabatan'] : null;
            $tahunAjaran = array_key_exists('tahun_ajaran', $data) ? TextSanitizer::cleanTextOrNull($data['tahun_ajaran']) : $old['tahun_ajaran'];
            $status = isset($data['status']) && in_array($data['status'], ['aktif', 'nonaktif'], true)
                ? $data['status'] : $old['status'];
            $keterangan = array_key_exists('keterangan', $data) ? TextSanitizer::cleanTextOrNull($data['keterangan']) : $old['keterangan'];

            $stmt = $this->db->prepare("
                UPDATE daerah___pengurus
                SET id_daerah = ?, id_pengurus = ?, id_jabatan = ?, tahun_ajaran = ?, status = ?, keterangan = ?
                WHERE id = ?
            ");
            $stmt->execute([$idDaerah, $idPengurus, $idJabatan, $tahunAjaran, $status, $keterangan, $id]);

            $stmtNew = $this->db->prepare("SELECT * FROM daerah___pengurus WHERE id = ?");
            $stmtNew->execute([$id]);
            $new = $stmtNew->fetch(\PDO::FETCH_ASSOC);
            $user = $request->getAttribute('user');
            $pengurusId = isset($user['user_id']) ? (int) $user['user_id'] : (isset($user['id']) ? (int) $user['id'] : null);
            if ($pengurusId !== null) {
                UserAktivitasLogger::log(null, $pengurusId, UserAktivitasLogger::ACTION_UPDATE, 'daerah___pengurus', (string) $id, $old, $new, $request);
            }

            LiveDomisiliCacheNotifier::ping();

            return $this->jsonResponse($response, [
                'success' => true,
                'message' => 'Pengurus daerah berhasil diupdate',
                'data' => $new
            ], 200);
        } catch (\Exception $e) {
            error_log("DaerahPengurusController update: " . $e->getMessage());
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Gagal mengupdate pengurus daerah',
                'error' => $e->getMessage()
            ], 500);
        }
    }

    /**
     * PATCH /api/daerah-pengurus/{id}/status - Set status
     */
    public function setStatus(Request $request, Response $response, array $args): Response
    {
        try {
            $id = (int) ($args['id'] ?? 0);
            if (!$id) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'ID tidak valid'
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

            $stmt = $this->db->prepare("SELECT * FROM daerah___pengurus WHERE id = ?");
            $stmt->execute([$id]);
            $old = $stmt->fetch(\PDO::FETCH_ASSOC);
            if (!$old) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Data tidak ditemukan'
                ], 404);
            }

            $stmt = $this->db->prepare("UPDATE daerah___pengurus SET status = ? WHERE id = ?");
            $stmt->execute([$status, $id]);
            $stmtNew = $this->db->prepare("SELECT * FROM daerah___pengurus WHERE id = ?");
            $stmtNew->execute([$id]);
            $new = $stmtNew->fetch(\PDO::FETCH_ASSOC);

            $user = $request->getAttribute('user');
            $pengurusId = isset($user['user_id']) ? (int) $user['user_id'] : (isset($user['id']) ? (int) $user['id'] : null);
            if ($new && $pengurusId !== null) {
                UserAktivitasLogger::log(null, $pengurusId, UserAktivitasLogger::ACTION_UPDATE, 'daerah___pengurus', (string) $id, $old, $new, $request);
            }

            LiveDomisiliCacheNotifier::ping();

            return $this->jsonResponse($response, [
                'success' => true,
                'message' => $status === 'aktif' ? 'Pengurus diaktifkan' : 'Pengurus dinonaktifkan',
                'data' => $new
            ], 200);
        } catch (\Exception $e) {
            error_log("DaerahPengurusController setStatus: " . $e->getMessage());
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Gagal mengubah status',
                'error' => $e->getMessage()
            ], 500);
        }
    }
}

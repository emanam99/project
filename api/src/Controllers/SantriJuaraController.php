<?php

namespace App\Controllers;

use App\Database;
use App\Helpers\SantriHelper;
use App\Helpers\TextSanitizer;
use App\Helpers\UserAktivitasLogger;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;

class SantriJuaraController
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
     * GET /api/public/juara - Get all santri juara (public, untuk display)
     */
    public function getPublicJuara(Request $request, Response $response): Response
    {
        try {
            $queryParams = $request->getQueryParams();
            $tahunAjaran = $queryParams['tahun_ajaran'] ?? null;
            
            $sql = "
                SELECT 
                    sj.*,
                    s.nis,
                    s.nama as nama_santri,
                    s.gender,
                    l.nama as nama_lembaga
                FROM santri___juara sj
                LEFT JOIN santri s ON sj.id_santri = s.id
                LEFT JOIN lembaga l ON sj.lembaga = l.id
                WHERE 1=1
            ";
            $params = [];
            
            if ($tahunAjaran) {
                $sql .= " AND sj.tahun_ajaran = ?";
                $params[] = $tahunAjaran;
            }
            
            $sql .= " ORDER BY sj.tanggal_dibuat DESC";
            
            if (empty($params)) {
                $stmt = $this->db->query($sql);
            } else {
                $stmt = $this->db->prepare($sql);
                $stmt->execute($params);
            }
            
            $data = $stmt->fetchAll(\PDO::FETCH_ASSOC);

            return $this->jsonResponse($response, [
                'success' => true,
                'data' => $data
            ], 200);
        } catch (\Exception $e) {
            error_log("Error getting public santri juara: " . $e->getMessage());
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Gagal mengambil data santri juara',
                'error' => $e->getMessage()
            ], 500);
        }
    }

    /**
     * GET /api/santri-juara - Get all santri juara
     */
    public function getAll(Request $request, Response $response): Response
    {
        try {
            $queryParams = $request->getQueryParams();
            $tahunAjaran = $queryParams['tahun_ajaran'] ?? null;
            
            $sql = "
                SELECT 
                    sj.*,
                    s.nis,
                    s.nama as nama_santri,
                    s.gender,
                    l.nama as nama_lembaga
                FROM santri___juara sj
                LEFT JOIN santri s ON sj.id_santri = s.id
                LEFT JOIN lembaga l ON sj.lembaga = l.id
                WHERE 1=1
            ";
            $params = [];
            
            if ($tahunAjaran) {
                $sql .= " AND sj.tahun_ajaran = ?";
                $params[] = $tahunAjaran;
            }
            
            $sql .= " ORDER BY sj.tanggal_dibuat DESC";
            
            if (empty($params)) {
                $stmt = $this->db->query($sql);
            } else {
                $stmt = $this->db->prepare($sql);
                $stmt->execute($params);
            }
            
            $data = $stmt->fetchAll(\PDO::FETCH_ASSOC);

            return $this->jsonResponse($response, [
                'success' => true,
                'data' => $data
            ], 200);
        } catch (\Exception $e) {
            error_log("Error getting santri juara: " . $e->getMessage());
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Gagal mengambil data santri juara',
                'error' => $e->getMessage()
            ], 500);
        }
    }

    /**
     * GET /api/santri-juara/{id} - Get santri juara by id
     */
    public function getById(Request $request, Response $response, array $args): Response
    {
        try {
            $id = $args['id'] ?? null;

            if (!$id) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'ID tidak ditemukan'
                ], 400);
            }

            $sql = "
                SELECT 
                    sj.*,
                    s.nis,
                    s.nama as nama_santri,
                    s.gender,
                    l.nama as nama_lembaga
                FROM santri___juara sj
                LEFT JOIN santri s ON sj.id_santri = s.id
                LEFT JOIN lembaga l ON sj.lembaga = l.id
                WHERE sj.id = ?
            ";
            $stmt = $this->db->prepare($sql);
            $stmt->execute([$id]);
            $data = $stmt->fetch(\PDO::FETCH_ASSOC);

            if (!$data) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Data tidak ditemukan'
                ], 404);
            }

            return $this->jsonResponse($response, [
                'success' => true,
                'data' => $data
            ], 200);
        } catch (\Exception $e) {
            error_log("Error getting santri juara by id: " . $e->getMessage());
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Gagal mengambil data santri juara',
                'error' => $e->getMessage()
            ], 500);
        }
    }

    /**
     * POST /api/santri-juara - Create new santri juara
     */
    public function create(Request $request, Response $response): Response
    {
        try {
            $data = $request->getParsedBody();
            $data = is_array($data) ? TextSanitizer::sanitizeStringValues($data, []) : [];

            // Validasi (id_santri bisa berisi id numerik atau NIS 7 digit)
            if (empty($data['id_santri'])) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'NIS/ID Santri wajib diisi'
                ], 400);
            }

            $idSantri = SantriHelper::resolveId($this->db, $data['id_santri']);
            if ($idSantri === null) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Santri tidak ditemukan untuk NIS/ID: ' . $data['id_santri']
                ], 404);
            }

            $tahunAjaran = $data['tahun_ajaran'] ?? null;
            $lembaga = $data['lembaga'] ?? null;
            $kelas = $data['kelas'] ?? null;
            $waliKelas = $data['wali_kelas'] ?? null;
            $nilai = isset($data['nilai']) ? (float)$data['nilai'] : null;
            $juara = $data['juara'] ?? null;
            $keterangan = $data['keterangan'] ?? null;

            // Insert
            $sql = "
                INSERT INTO santri___juara 
                (id_santri, tahun_ajaran, lembaga, kelas, wali_kelas, nilai, juara, keterangan)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            ";
            $stmt = $this->db->prepare($sql);
            $stmt->execute([
                $idSantri,
                $tahunAjaran,
                $lembaga,
                $kelas,
                $waliKelas,
                $nilai,
                $juara,
                $keterangan
            ]);

            $newId = $this->db->lastInsertId();
            $stmtNew = $this->db->prepare("SELECT * FROM santri___juara WHERE id = ?");
            $stmtNew->execute([$newId]);
            $newRow = $stmtNew->fetch(\PDO::FETCH_ASSOC);
            $user = $request->getAttribute('user');
            $idAdmin = $user['user_id'] ?? $user['id'] ?? null;
            if ($newRow && $idAdmin) {
                UserAktivitasLogger::log(null, $idAdmin, UserAktivitasLogger::ACTION_CREATE, 'santri___juara', $newId, null, $newRow, $request);
            }

            return $this->jsonResponse($response, [
                'success' => true,
                'message' => 'Data santri juara berhasil ditambahkan',
                'data' => [
                    'id' => $newId,
                    'id_santri' => $idSantri,
                    'tahun_ajaran' => $tahunAjaran,
                    'lembaga' => $lembaga,
                    'kelas' => $kelas,
                    'wali_kelas' => $waliKelas,
                    'nilai' => $nilai,
                    'juara' => $juara,
                    'keterangan' => $keterangan
                ]
            ], 201);
        } catch (\Exception $e) {
            error_log("Error creating santri juara: " . $e->getMessage());
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Gagal menambahkan data santri juara',
                'error' => $e->getMessage()
            ], 500);
        }
    }

    /**
     * PUT /api/santri-juara/{id} - Update santri juara
     */
    public function update(Request $request, Response $response, array $args): Response
    {
        try {
            $id = $args['id'] ?? null;

            if (!$id) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'ID tidak ditemukan'
                ], 400);
            }

            $data = $request->getParsedBody();
            $data = is_array($data) ? TextSanitizer::sanitizeStringValues($data, []) : [];
            $tahunAjaran = $data['tahun_ajaran'] ?? null;
            $lembaga = $data['lembaga'] ?? null;
            $kelas = $data['kelas'] ?? null;
            $waliKelas = $data['wali_kelas'] ?? null;
            $nilai = isset($data['nilai']) ? (float)$data['nilai'] : null;
            $juara = $data['juara'] ?? null;
            $keterangan = $data['keterangan'] ?? null;

            // Cek apakah data ada dan ambil old row untuk audit
            $stmtOld = $this->db->prepare("SELECT * FROM santri___juara WHERE id = ?");
            $stmtOld->execute([$id]);
            $oldRow = $stmtOld->fetch(\PDO::FETCH_ASSOC);
            if (!$oldRow) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Data tidak ditemukan'
                ], 404);
            }

            // Update
            $sql = "
                UPDATE santri___juara 
                SET tahun_ajaran = ?, lembaga = ?, kelas = ?, wali_kelas = ?, nilai = ?, juara = ?, keterangan = ?
                WHERE id = ?
            ";
            $stmt = $this->db->prepare($sql);
            $stmt->execute([
                $tahunAjaran,
                $lembaga,
                $kelas,
                $waliKelas,
                $nilai,
                $juara,
                $keterangan,
                $id
            ]);
            $user = $request->getAttribute('user');
            $idAdmin = $user['user_id'] ?? $user['id'] ?? null;
            if ($idAdmin) {
                $stmtNew = $this->db->prepare("SELECT * FROM santri___juara WHERE id = ?");
                $stmtNew->execute([$id]);
                $newRow = $stmtNew->fetch(\PDO::FETCH_ASSOC);
                if ($newRow) {
                    UserAktivitasLogger::log(null, $idAdmin, UserAktivitasLogger::ACTION_UPDATE, 'santri___juara', $id, $oldRow, $newRow, $request);
                }
            }

            return $this->jsonResponse($response, [
                'success' => true,
                'message' => 'Data santri juara berhasil diupdate'
            ], 200);
        } catch (\Exception $e) {
            error_log("Error updating santri juara: " . $e->getMessage());
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Gagal mengupdate data santri juara',
                'error' => $e->getMessage()
            ], 500);
        }
    }

    /**
     * DELETE /api/santri-juara/{id} - Delete santri juara
     */
    public function delete(Request $request, Response $response, array $args): Response
    {
        try {
            $id = $args['id'] ?? null;

            if (!$id) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'ID tidak ditemukan'
                ], 400);
            }

            // Cek apakah data ada dan ambil old row untuk audit
            $stmtOld = $this->db->prepare("SELECT * FROM santri___juara WHERE id = ?");
            $stmtOld->execute([$id]);
            $oldRow = $stmtOld->fetch(\PDO::FETCH_ASSOC);
            if (!$oldRow) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Data tidak ditemukan'
                ], 404);
            }
            $user = $request->getAttribute('user');
            $idAdmin = $user['user_id'] ?? $user['id'] ?? null;

            // Delete
            $stmt = $this->db->prepare("DELETE FROM santri___juara WHERE id = ?");
            $stmt->execute([$id]);
            if ($stmt->rowCount() > 0 && $idAdmin) {
                UserAktivitasLogger::log(null, $idAdmin, UserAktivitasLogger::ACTION_DELETE, 'santri___juara', $id, $oldRow, null, $request);
            }

            return $this->jsonResponse($response, [
                'success' => true,
                'message' => 'Data santri juara berhasil dihapus'
            ], 200);
        } catch (\Exception $e) {
            error_log("Error deleting santri juara: " . $e->getMessage());
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Gagal menghapus data santri juara',
                'error' => $e->getMessage()
            ], 500);
        }
    }
}

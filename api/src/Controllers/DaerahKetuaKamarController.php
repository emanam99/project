<?php

namespace App\Controllers;

use App\Database;
use App\Helpers\LiveDomisiliCacheNotifier;
use App\Helpers\TextSanitizer;
use App\Helpers\UserAktivitasLogger;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;

class DaerahKetuaKamarController
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
     * GET /api/daerah-ketua-kamar - List (filter: id_daerah_kamar, status). JOIN santri untuk nama ketua.
     * Urutan: status aktif dulu, lalu tahun_ajaran DESC.
     */
    public function getAll(Request $request, Response $response): Response
    {
        try {
            $params = $request->getQueryParams();
            $idDaerahKamar = isset($params['id_daerah_kamar']) ? (int) $params['id_daerah_kamar'] : null;
            $status = $params['status'] ?? null;

            $sql = "SELECT dkk.*, s.nama AS ketua_nama, s.nis
                    FROM daerah___ketua_kamar dkk
                    LEFT JOIN santri s ON s.id = dkk.id_ketua_kamar
                    WHERE 1=1";
            $bind = [];
            if ($idDaerahKamar !== null && $idDaerahKamar > 0) {
                $sql .= " AND dkk.id_daerah_kamar = ?";
                $bind[] = $idDaerahKamar;
            }
            if ($status !== null && $status !== '') {
                $sql .= " AND dkk.status = ?";
                $bind[] = $status;
            }
            $sql .= " ORDER BY dkk.status DESC, dkk.tahun_ajaran DESC, dkk.tanggal_dibuat DESC";

            $stmt = $this->db->prepare($sql);
            $stmt->execute($bind);
            $rows = $stmt->fetchAll(\PDO::FETCH_ASSOC);

            return $this->jsonResponse($response, [
                'success' => true,
                'data' => $rows
            ], 200);
        } catch (\Exception $e) {
            error_log("DaerahKetuaKamarController getAll: " . $e->getMessage());
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Gagal mengambil data ketua kamar',
                'error' => null
            ], 500);
        }
    }

    /**
     * GET /api/daerah-ketua-kamar/{id}
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
                SELECT dkk.*, s.nama AS ketua_nama, s.nis
                FROM daerah___ketua_kamar dkk
                LEFT JOIN santri s ON s.id = dkk.id_ketua_kamar
                WHERE dkk.id = ?
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
            error_log("DaerahKetuaKamarController getById: " . $e->getMessage());
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Gagal mengambil data',
                'error' => null
            ], 500);
        }
    }

    /**
     * POST /api/daerah-ketua-kamar - Create
     */
    public function create(Request $request, Response $response): Response
    {
        try {
            $data = $request->getParsedBody();
            if (empty($data['id_daerah_kamar'])) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'ID kamar wajib diisi'
                ], 400);
            }
            if (empty($data['id_ketua_kamar'])) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'ID ketua (santri) wajib diisi'
                ], 400);
            }

            $idDaerahKamar = (int) $data['id_daerah_kamar'];
            $idKetuaKamar = (int) $data['id_ketua_kamar'];
            $tahunAjaran = TextSanitizer::cleanTextOrNull($data['tahun_ajaran'] ?? null);
            $status = isset($data['status']) && in_array($data['status'], ['aktif', 'nonaktif'], true)
                ? $data['status'] : 'aktif';
            $keterangan = TextSanitizer::cleanTextOrNull($data['keterangan'] ?? null);

            $waktu = (new \DateTime('now', new \DateTimeZone('Asia/Jakarta')))->format('Y-m-d H:i:s');
            $stmt = $this->db->prepare("
                INSERT INTO daerah___ketua_kamar (id_daerah_kamar, id_ketua_kamar, tahun_ajaran, status, keterangan, tanggal_dibuat)
                VALUES (?, ?, ?, ?, ?, ?)
            ");
            $stmt->execute([$idDaerahKamar, $idKetuaKamar, $tahunAjaran, $status, $keterangan, $waktu]);
            $newId = (int) $this->db->lastInsertId();

            $newRow = [
                'id' => $newId,
                'id_daerah_kamar' => $idDaerahKamar,
                'id_ketua_kamar' => $idKetuaKamar,
                'tahun_ajaran' => $tahunAjaran,
                'status' => $status,
                'keterangan' => $keterangan,
                'tanggal_dibuat' => $waktu
            ];
            $user = $request->getAttribute('user');
            $pengurusId = isset($user['user_id']) ? (int) $user['user_id'] : (isset($user['id']) ? (int) $user['id'] : null);
            if ($pengurusId !== null) {
                UserAktivitasLogger::log(null, $pengurusId, UserAktivitasLogger::ACTION_CREATE, 'daerah___ketua_kamar', (string) $newId, null, $newRow, $request);
            }

            LiveDomisiliCacheNotifier::ping();

            return $this->jsonResponse($response, [
                'success' => true,
                'message' => 'Ketua kamar berhasil ditambahkan',
                'data' => $newRow
            ], 201);
        } catch (\Exception $e) {
            error_log("DaerahKetuaKamarController create: " . $e->getMessage());
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Gagal menambahkan ketua kamar',
                'error' => null
            ], 500);
        }
    }

    /**
     * PUT /api/daerah-ketua-kamar/{id} - Update
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

            $stmt = $this->db->prepare("SELECT * FROM daerah___ketua_kamar WHERE id = ?");
            $stmt->execute([$id]);
            $old = $stmt->fetch(\PDO::FETCH_ASSOC);
            if (!$old) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Data tidak ditemukan'
                ], 404);
            }

            $data = $request->getParsedBody();
            $idDaerahKamar = isset($data['id_daerah_kamar']) ? (int) $data['id_daerah_kamar'] : (int) $old['id_daerah_kamar'];
            $idKetuaKamar = isset($data['id_ketua_kamar']) ? (int) $data['id_ketua_kamar'] : (int) $old['id_ketua_kamar'];
            $tahunAjaran = array_key_exists('tahun_ajaran', $data) ? TextSanitizer::cleanTextOrNull($data['tahun_ajaran']) : $old['tahun_ajaran'];
            $status = isset($data['status']) && in_array($data['status'], ['aktif', 'nonaktif'], true)
                ? $data['status'] : $old['status'];
            $keterangan = array_key_exists('keterangan', $data) ? TextSanitizer::cleanTextOrNull($data['keterangan']) : $old['keterangan'];

            $stmt = $this->db->prepare("
                UPDATE daerah___ketua_kamar
                SET id_daerah_kamar = ?, id_ketua_kamar = ?, tahun_ajaran = ?, status = ?, keterangan = ?
                WHERE id = ?
            ");
            $stmt->execute([$idDaerahKamar, $idKetuaKamar, $tahunAjaran, $status, $keterangan, $id]);

            $stmtNew = $this->db->prepare("SELECT * FROM daerah___ketua_kamar WHERE id = ?");
            $stmtNew->execute([$id]);
            $new = $stmtNew->fetch(\PDO::FETCH_ASSOC);
            $user = $request->getAttribute('user');
            $pengurusId = isset($user['user_id']) ? (int) $user['user_id'] : (isset($user['id']) ? (int) $user['id'] : null);
            if ($pengurusId !== null) {
                UserAktivitasLogger::log(null, $pengurusId, UserAktivitasLogger::ACTION_UPDATE, 'daerah___ketua_kamar', (string) $id, $old, $new, $request);
            }

            LiveDomisiliCacheNotifier::ping();

            return $this->jsonResponse($response, [
                'success' => true,
                'message' => 'Ketua kamar berhasil diupdate',
                'data' => $new
            ], 200);
        } catch (\Exception $e) {
            error_log("DaerahKetuaKamarController update: " . $e->getMessage());
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Gagal mengupdate ketua kamar',
                'error' => null
            ], 500);
        }
    }

    /**
     * PATCH /api/daerah-ketua-kamar/{id}/status - Set status
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

            $stmt = $this->db->prepare("SELECT * FROM daerah___ketua_kamar WHERE id = ?");
            $stmt->execute([$id]);
            $old = $stmt->fetch(\PDO::FETCH_ASSOC);
            if (!$old) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Data tidak ditemukan'
                ], 404);
            }

            $stmt = $this->db->prepare("UPDATE daerah___ketua_kamar SET status = ? WHERE id = ?");
            $stmt->execute([$status, $id]);
            $stmtNew = $this->db->prepare("SELECT * FROM daerah___ketua_kamar WHERE id = ?");
            $stmtNew->execute([$id]);
            $new = $stmtNew->fetch(\PDO::FETCH_ASSOC);

            $user = $request->getAttribute('user');
            $pengurusId = isset($user['user_id']) ? (int) $user['user_id'] : (isset($user['id']) ? (int) $user['id'] : null);
            if ($new && $pengurusId !== null) {
                UserAktivitasLogger::log(null, $pengurusId, UserAktivitasLogger::ACTION_UPDATE, 'daerah___ketua_kamar', (string) $id, $old, $new, $request);
            }

            LiveDomisiliCacheNotifier::ping();

            return $this->jsonResponse($response, [
                'success' => true,
                'message' => $status === 'aktif' ? 'Ketua kamar diaktifkan' : 'Ketua kamar dinonaktifkan',
                'data' => $new
            ], 200);
        } catch (\Exception $e) {
            error_log("DaerahKetuaKamarController setStatus: " . $e->getMessage());
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Gagal mengubah status',
                'error' => null
            ], 500);
        }
    }
}

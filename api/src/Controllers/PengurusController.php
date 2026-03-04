<?php

namespace App\Controllers;

use App\Database;
use App\Helpers\PengurusHelper;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;

class PengurusController
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
     * GET /api/pengurus - Daftar pengurus untuk dropdown/cari (admin_ugt, super_admin).
     * Query:
     *   role_keys (opsional) = comma-separated role keys.
     *   lembaga_id (opsional) = hanya pengurus yang punya pengurus___jabatan di lembaga ini dan status aktif.
     * Return id, nama, whatsapp, dusun, rt, rw, desa, kecamatan, kabupaten, provinsi, kode_pos.
     */
    public function getList(Request $request, Response $response): Response
    {
        try {
            $params = $request->getQueryParams();
            $roleKeysRaw = isset($params['role_keys']) ? trim((string) $params['role_keys']) : '';
            $lembagaId = isset($params['lembaga_id']) ? trim((string) $params['lembaga_id']) : '';

            $baseFrom = "
                FROM pengurus p
                LEFT JOIN users u ON u.id = p.id_user
            ";
            $orderBy = " ORDER BY p.nama ASC";

            if ($lembagaId !== '') {
                // Filter by lembaga: pengurus yang punya pengurus___jabatan dengan lembaga ini dan status aktif
                $baseFrom .= "
                    INNER JOIN pengurus___jabatan pj ON pj.pengurus_id = p.id AND pj.status = 'aktif'
                    LEFT JOIN jabatan j ON j.id = pj.jabatan_id
                ";
                $whereLembaga = " AND (pj.lembaga_id = ? OR (pj.lembaga_id IS NULL AND j.lembaga_id = ?))";
            } else {
                $whereLembaga = '';
            }

            if ($roleKeysRaw !== '') {
                $roleKeys = array_map('trim', array_filter(explode(',', $roleKeysRaw)));
                $roleKeys = array_map('strtolower', $roleKeys);
                if (!empty($roleKeys)) {
                    $placeholders = implode(',', array_fill(0, count($roleKeys), '?'));
                    $sql = "
                        SELECT DISTINCT p.id, p.nip, p.nama, COALESCE(u.no_wa, '') AS whatsapp, p.dusun, p.rt, p.rw, p.desa, p.kecamatan, p.kabupaten, p.provinsi, p.kode_pos
                        " . $baseFrom . "
                        INNER JOIN pengurus___role pr ON pr.pengurus_id = p.id
                        INNER JOIN role r ON r.id = pr.role_id AND LOWER(TRIM(r.`key`)) IN ($placeholders)
                        WHERE 1=1 " . $whereLembaga . $orderBy;
                    $stmt = $this->db->prepare($sql);
                    if ($lembagaId !== '') {
                        $stmt->execute(array_merge($roleKeys, [$lembagaId, $lembagaId]));
                    } else {
                        $stmt->execute($roleKeys);
                    }
                    $list = $stmt->fetchAll(\PDO::FETCH_ASSOC);
                } else {
                    $sql = "
                        SELECT DISTINCT p.id, p.nip, p.nama, COALESCE(u.no_wa, '') AS whatsapp, p.dusun, p.rt, p.rw, p.desa, p.kecamatan, p.kabupaten, p.provinsi, p.kode_pos
                        " . $baseFrom . "
                        WHERE 1=1 " . $whereLembaga . $orderBy;
                    if ($lembagaId !== '') {
                        $stmt = $this->db->prepare($sql);
                        $stmt->execute([$lembagaId, $lembagaId]);
                        $list = $stmt->fetchAll(\PDO::FETCH_ASSOC);
                    } else {
                        $stmt = $this->db->query("SELECT p.id, p.nip, p.nama, COALESCE(u.no_wa, '') AS whatsapp, p.dusun, p.rt, p.rw, p.desa, p.kecamatan, p.kabupaten, p.provinsi, p.kode_pos FROM pengurus p LEFT JOIN users u ON u.id = p.id_user " . $orderBy);
                        $list = $stmt->fetchAll(\PDO::FETCH_ASSOC);
                    }
                }
            } else {
                $sql = "
                    SELECT DISTINCT p.id, p.nip, p.nama, COALESCE(u.no_wa, '') AS whatsapp, p.dusun, p.rt, p.rw, p.desa, p.kecamatan, p.kabupaten, p.provinsi, p.kode_pos
                    " . $baseFrom . "
                    WHERE 1=1 " . $whereLembaga . $orderBy;
                if ($lembagaId !== '') {
                    $stmt = $this->db->prepare($sql);
                    $stmt->execute([$lembagaId, $lembagaId]);
                    $list = $stmt->fetchAll(\PDO::FETCH_ASSOC);
                } else {
                    $stmt = $this->db->query("SELECT p.id, p.nip, p.nama, COALESCE(u.no_wa, '') AS whatsapp, p.dusun, p.rt, p.rw, p.desa, p.kecamatan, p.kabupaten, p.provinsi, p.kode_pos FROM pengurus p LEFT JOIN users u ON u.id = p.id_user " . $orderBy);
                    $list = $stmt->fetchAll(\PDO::FETCH_ASSOC);
                }
            }

            return $this->jsonResponse($response, [
                'success' => true,
                'data' => $list
            ], 200);
        } catch (\Exception $e) {
            error_log("PengurusController::getList " . $e->getMessage());
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Gagal mengambil data pengurus',
                'data' => []
            ], 500);
        }
    }

    /**
     * GET /api/pengurus/{id} - Satu pengurus by id atau NIP (untuk tampil nama, WA, alamat).
     * Parameter bisa id (internal) atau NIP; resolve NIP ke id lalu query by id.
     * Return success, data: { id, nip, nama, whatsapp, dusun, rt, rw, desa, kecamatan, kabupaten, provinsi, kode_pos }.
     */
    public function getById(Request $request, Response $response, array $args): Response
    {
        try {
            $idOrNip = $args['id'] ?? '';
            if ($idOrNip === '' || !is_numeric($idOrNip)) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'ID atau NIP pengurus tidak valid'
                ], 400);
            }

            $resolvedId = PengurusHelper::resolveIdByNip($this->db, $idOrNip);
            if ($resolvedId === null) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Pengurus tidak ditemukan (NIP/ID tidak terdaftar)'
                ], 404);
            }

            $stmt = $this->db->prepare("
                SELECT p.id, p.nip, p.nama, COALESCE(u.no_wa, '') AS whatsapp, p.dusun, p.rt, p.rw, p.desa, p.kecamatan, p.kabupaten, p.provinsi, p.kode_pos
                FROM pengurus p
                LEFT JOIN users u ON u.id = p.id_user
                WHERE p.id = ?
            ");
            $stmt->execute([$resolvedId]);
            $row = $stmt->fetch(\PDO::FETCH_ASSOC);

            if (!$row) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Pengurus tidak ditemukan'
                ], 404);
            }

            if (isset($row['nip'])) {
                $row['nip'] = (string) $row['nip'];
            }
            $row['id'] = (int) $row['id'];

            return $this->jsonResponse($response, [
                'success' => true,
                'data' => $row
            ], 200);
        } catch (\Exception $e) {
            error_log("PengurusController::getById " . $e->getMessage());
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Gagal mengambil data pengurus'
            ], 500);
        }
    }
}

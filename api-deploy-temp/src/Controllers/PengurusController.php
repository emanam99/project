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
     * Return id, nip, nama, whatsapp, alamat, plus lembaga[] dan jabatan[] dari tabel pengurus___jabatan.
     */
    public function getList(Request $request, Response $response): Response
    {
        try {
            $params = $request->getQueryParams();
            $roleKeysRaw = isset($params['role_keys']) ? trim((string) $params['role_keys']) : '';
            $lembagaId = isset($params['lembaga_id']) ? trim((string) $params['lembaga_id']) : '';

            $joinUsers = "LEFT JOIN users u ON u.id = p.id_user";
            $joinJabatan = "LEFT JOIN pengurus___jabatan pj ON pj.pengurus_id = p.id AND pj.status = 'aktif'
                    LEFT JOIN jabatan j ON pj.jabatan_id = j.id
                    LEFT JOIN lembaga l ON l.id = COALESCE(pj.lembaga_id, j.lembaga_id)";
            $whereConditions = ["1=1"];
            $paramsBind = [];

            if ($lembagaId !== '') {
                $whereConditions[] = "(pj.lembaga_id = ? OR (pj.lembaga_id IS NULL AND j.lembaga_id = ?))";
                $paramsBind[] = $lembagaId;
                $paramsBind[] = $lembagaId;
            }

            $joinRole = '';
            if ($roleKeysRaw !== '') {
                $roleKeys = array_map('trim', array_filter(explode(',', $roleKeysRaw)));
                $roleKeys = array_map('strtolower', $roleKeys);
                if (!empty($roleKeys)) {
                    $placeholders = implode(',', array_fill(0, count($roleKeys), '?'));
                    $joinRole = "INNER JOIN pengurus___role pr ON pr.pengurus_id = p.id
                        INNER JOIN role r ON r.id = pr.role_id AND LOWER(TRIM(r.`key`)) IN ($placeholders)";
                    foreach ($roleKeys as $rk) {
                        $paramsBind[] = $rk;
                    }
                }
            }

            $whereClause = implode(' AND ', $whereConditions);
            $sql = "SELECT
                        p.id, p.nip, p.nama, COALESCE(u.no_wa, '') AS whatsapp,
                        p.dusun, p.rt, p.rw, p.desa, p.kecamatan, p.kabupaten, p.provinsi, p.kode_pos,
                        GROUP_CONCAT(DISTINCT CASE WHEN l.id IS NOT NULL THEN CONCAT(l.id, '|', COALESCE(l.nama, ''), '|', COALESCE(l.kategori, '')) END SEPARATOR '||') AS lembaga_data,
                        GROUP_CONCAT(DISTINCT CONCAT(COALESCE(pj.lembaga_id, ''), ':', j.id, ':', j.nama) SEPARATOR '||') AS jabatan_data
                    FROM pengurus p
                    {$joinUsers}
                    {$joinRole}
                    {$joinJabatan}
                    WHERE {$whereClause}
                    GROUP BY p.id, p.nip, p.nama, u.no_wa, p.dusun, p.rt, p.rw, p.desa, p.kecamatan, p.kabupaten, p.provinsi, p.kode_pos
                    ORDER BY p.nama ASC";

            $stmt = $this->db->prepare($sql);
            $stmt->execute($paramsBind);
            $list = $stmt->fetchAll(\PDO::FETCH_ASSOC);

            foreach ($list as &$row) {
                $lembagaList = [];
                if (!empty($row['lembaga_data'])) {
                    $arr = array_filter(explode('||', $row['lembaga_data']));
                    foreach ($arr as $s) {
                        $parts = explode('|', $s, 3);
                        if (!empty($parts[0])) {
                            $lembagaList[] = [
                                'id' => $parts[0],
                                'nama' => $parts[1] ?? '',
                                'kategori' => $parts[2] ?? ''
                            ];
                        }
                    }
                }
                $row['lembaga'] = $lembagaList;
                $row['lembaga_ids'] = array_map(function ($l) {
                    return (string) $l['id'];
                }, $lembagaList);

                $jabatanList = [];
                if (!empty($row['jabatan_data'])) {
                    $arr = explode('||', $row['jabatan_data']);
                    foreach ($arr as $s) {
                        if ($s === '') continue;
                        $parts = explode(':', $s, 3);
                        if (count($parts) >= 3 && $parts[1] !== '') {
                            $jabatanList[] = [
                                'lembaga_id' => $parts[0] ?: null,
                                'jabatan_id' => (int) $parts[1],
                                'jabatan_nama' => $parts[2]
                            ];
                        } elseif (count($parts) >= 2) {
                            $jabatanList[] = [
                                'lembaga_id' => $parts[0] ?: null,
                                'jabatan_id' => null,
                                'jabatan_nama' => $parts[1]
                            ];
                        }
                    }
                }
                $row['jabatan'] = $jabatanList;
                unset($row['lembaga_data'], $row['jabatan_data']);
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

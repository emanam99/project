<?php

namespace App\Controllers;

use App\Database;
use App\Helpers\UserAktivitasLogger;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;

/**
 * Master Tahun Ajaran (hijriyah & masehi).
 * Hanya diakses oleh super_admin via route /api/tahun-ajaran.
 */
class TahunAjaranController
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
     * GET /api/tahun-ajaran
     * Optional query:
     * - kategori: hijriyah / masehi
     */
    public function getAll(Request $request, Response $response): Response
    {
        try {
            $params = $request->getQueryParams();
            $kategori = $params['kategori'] ?? null;

            $sql = "SELECT tahun_ajaran, kategori, dari, sampai FROM tahun_ajaran WHERE 1=1";
            $bind = [];
            if ($kategori !== null && $kategori !== '') {
                $sql .= " AND kategori = ?";
                $bind[] = $kategori;
            }
            $sql .= " ORDER BY kategori ASC, dari ASC, tahun_ajaran ASC";

            $stmt = $this->db->prepare($sql);
            $stmt->execute($bind);
            $rows = $stmt->fetchAll(\PDO::FETCH_ASSOC);

            return $this->jsonResponse($response, [
                'success' => true,
                'data' => $rows,
            ], 200);
        } catch (\Throwable $e) {
            error_log('TahunAjaranController::getAll ' . $e->getMessage());
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Gagal mengambil data tahun ajaran',
                'error' => $e->getMessage(),
            ], 500);
        }
    }

    /**
     * GET /api/tahun-ajaran/{id}
     * id = string tahun_ajaran (contoh: 1447-1448)
     */
    public function getById(Request $request, Response $response, array $args): Response
    {
        try {
            $id = isset($args['id']) ? trim((string) $args['id']) : '';
            if ($id === '') {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Tahun ajaran tidak valid',
                ], 400);
            }

            $stmt = $this->db->prepare("SELECT tahun_ajaran, kategori, dari, sampai FROM tahun_ajaran WHERE tahun_ajaran = ?");
            $stmt->execute([$id]);
            $row = $stmt->fetch(\PDO::FETCH_ASSOC);

            if (!$row) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Tahun ajaran tidak ditemukan',
                ], 404);
            }

            return $this->jsonResponse($response, [
                'success' => true,
                'data' => $row,
            ], 200);
        } catch (\Throwable $e) {
            error_log('TahunAjaranController::getById ' . $e->getMessage());
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Gagal mengambil data tahun ajaran',
                'error' => $e->getMessage(),
            ], 500);
        }
    }

    /**
     * POST /api/tahun-ajaran
     * Body:
     * - tahun_ajaran (string, PK) - wajib
     * - kategori (hijriyah / masehi) - wajib
     * - dari (date, optional, format YYYY-MM-DD)
     * - sampai (date, optional, format YYYY-MM-DD)
     */
    public function create(Request $request, Response $response): Response
    {
        try {
            $data = $request->getParsedBody() ?? [];
            $tahunAjaran = isset($data['tahun_ajaran']) ? trim((string) $data['tahun_ajaran']) : '';
            $kategori = isset($data['kategori']) ? trim((string) $data['kategori']) : '';
            $dari = $data['dari'] ?? null;
            $sampai = $data['sampai'] ?? null;

            if ($tahunAjaran === '') {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Tahun ajaran wajib diisi',
                ], 400);
            }
            if ($kategori === '' || !in_array($kategori, ['hijriyah', 'masehi'], true)) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => "Kategori wajib diisi (hijriyah / masehi)",
                ], 400);
            }

            // Cek duplikasi
            $stmt = $this->db->prepare("SELECT COUNT(*) FROM tahun_ajaran WHERE tahun_ajaran = ?");
            $stmt->execute([$tahunAjaran]);
            if ((int) $stmt->fetchColumn() > 0) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Tahun ajaran sudah ada',
                ], 400);
            }

            $stmtIns = $this->db->prepare("
                INSERT INTO tahun_ajaran (tahun_ajaran, kategori, dari, sampai)
                VALUES (?, ?, ?, ?)
            ");
            $stmtIns->execute([$tahunAjaran, $kategori, $dari ?: null, $sampai ?: null]);

            $newRow = [
                'tahun_ajaran' => $tahunAjaran,
                'kategori' => $kategori,
                'dari' => $dari,
                'sampai' => $sampai,
            ];

            $user = $request->getAttribute('user');
            $pengurusId = isset($user['user_id']) ? (int) $user['user_id'] : (isset($user['id']) ? (int) $user['id'] : null);
            if ($pengurusId !== null) {
                UserAktivitasLogger::log(null, $pengurusId, UserAktivitasLogger::ACTION_CREATE, 'tahun_ajaran', $tahunAjaran, null, $newRow, $request);
            }

            return $this->jsonResponse($response, [
                'success' => true,
                'message' => 'Tahun ajaran berhasil ditambahkan',
                'data' => $newRow,
            ], 201);
        } catch (\Throwable $e) {
            error_log('TahunAjaranController::create ' . $e->getMessage());
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Gagal menambahkan tahun ajaran',
                'error' => $e->getMessage(),
            ], 500);
        }
    }

    /**
     * PUT /api/tahun-ajaran/{id}
     * - id = tahun_ajaran lama
     * - body boleh mengubah tahun_ajaran (akan trigger ON UPDATE CASCADE pada FK)
     */
    public function update(Request $request, Response $response, array $args): Response
    {
        try {
            $id = isset($args['id']) ? trim((string) $args['id']) : '';
            if ($id === '') {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Tahun ajaran tidak valid',
                ], 400);
            }

            $stmt = $this->db->prepare("SELECT tahun_ajaran, kategori, dari, sampai FROM tahun_ajaran WHERE tahun_ajaran = ?");
            $stmt->execute([$id]);
            $old = $stmt->fetch(\PDO::FETCH_ASSOC);
            if (!$old) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Tahun ajaran tidak ditemukan',
                ], 404);
            }

            $data = $request->getParsedBody() ?? [];
            $newTahunAjaran = isset($data['tahun_ajaran']) && trim((string) $data['tahun_ajaran']) !== ''
                ? trim((string) $data['tahun_ajaran'])
                : $old['tahun_ajaran'];
            $kategori = isset($data['kategori']) && trim((string) $data['kategori']) !== ''
                ? trim((string) $data['kategori'])
                : $old['kategori'];
            $dari = array_key_exists('dari', $data) ? ($data['dari'] ?: null) : $old['dari'];
            $sampai = array_key_exists('sampai', $data) ? ($data['sampai'] ?: null) : $old['sampai'];

            if (!in_array($kategori, ['hijriyah', 'masehi'], true)) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => "Kategori wajib hijriyah atau masehi",
                ], 400);
            }

            // Jika mengganti tahun_ajaran ke nilai lain yang sudah ada, tolak
            if ($newTahunAjaran !== $id) {
                $stmtCheck = $this->db->prepare("SELECT COUNT(*) FROM tahun_ajaran WHERE tahun_ajaran = ?");
                $stmtCheck->execute([$newTahunAjaran]);
                if ((int) $stmtCheck->fetchColumn() > 0) {
                    return $this->jsonResponse($response, [
                        'success' => false,
                        'message' => 'Tahun ajaran baru sudah digunakan',
                    ], 400);
                }
            }

            $stmtUpd = $this->db->prepare("
                UPDATE tahun_ajaran 
                SET tahun_ajaran = ?, kategori = ?, dari = ?, sampai = ?
                WHERE tahun_ajaran = ?
            ");
            $stmtUpd->execute([$newTahunAjaran, $kategori, $dari, $sampai, $id]);

            $stmtNew = $this->db->prepare("SELECT tahun_ajaran, kategori, dari, sampai FROM tahun_ajaran WHERE tahun_ajaran = ?");
            $stmtNew->execute([$newTahunAjaran]);
            $new = $stmtNew->fetch(\PDO::FETCH_ASSOC) ?: [
                'tahun_ajaran' => $newTahunAjaran,
                'kategori' => $kategori,
                'dari' => $dari,
                'sampai' => $sampai,
            ];

            $user = $request->getAttribute('user');
            $pengurusId = isset($user['user_id']) ? (int) $user['user_id'] : (isset($user['id']) ? (int) $user['id'] : null);
            if ($pengurusId !== null) {
                UserAktivitasLogger::log(null, $pengurusId, UserAktivitasLogger::ACTION_UPDATE, 'tahun_ajaran', $id, $old, $new, $request);
            }

            return $this->jsonResponse($response, [
                'success' => true,
                'message' => 'Tahun ajaran berhasil diupdate',
                'data' => $new,
            ], 200);
        } catch (\Throwable $e) {
            error_log('TahunAjaranController::update ' . $e->getMessage());
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Gagal mengupdate tahun ajaran',
                'error' => $e->getMessage(),
            ], 500);
        }
    }
}


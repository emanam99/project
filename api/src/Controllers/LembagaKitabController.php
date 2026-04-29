<?php

namespace App\Controllers;

use App\Database;
use App\Helpers\TextSanitizer;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;

/**
 * Pemetaan mapel (kitab) per rombel — tabel lembaga___kitab.
 */
class LembagaKitabController
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
     * GET /api/mapel — daftar dengan join rombel, lembaga, kitab.
     */
    public function getAll(Request $request, Response $response): Response
    {
        try {
            $params = $request->getQueryParams();
            $lembagaId = isset($params['lembaga_id']) ? trim((string) $params['lembaga_id']) : '';
            $lembagaIdsCsv = isset($params['lembaga_ids']) ? trim((string) $params['lembaga_ids']) : '';
            $status = isset($params['status']) ? trim((string) $params['status']) : '';
            $search = isset($params['search']) ? trim((string) $params['search']) : '';
            $page = isset($params['page']) ? max(1, (int) $params['page']) : 1;
            $limit = isset($params['limit']) ? max(1, min(500, (int) $params['limit'])) : 50;
            $offset = ($page - 1) * $limit;

            $where = ' WHERE 1=1';
            $bind = [];

            if ($lembagaIdsCsv !== '') {
                $lembagaIds = array_values(array_filter(array_map(static function ($v) {
                    return trim((string) $v);
                }, explode(',', $lembagaIdsCsv)), static function ($v) {
                    return $v !== '';
                }));
                if ($lembagaIds !== []) {
                    $ph = implode(',', array_fill(0, count($lembagaIds), '?'));
                    $where .= " AND r.lembaga_id IN ($ph)";
                    foreach ($lembagaIds as $lid) {
                        $bind[] = $lid;
                    }
                }
            } elseif ($lembagaId !== '') {
                $where .= ' AND r.lembaga_id = ?';
                $bind[] = $lembagaId;
            }
            if ($status !== '') {
                $where .= ' AND lk.status = ?';
                $bind[] = $status;
            }
            if ($search !== '') {
                $term = '%' . $search . '%';
                $where .= ' AND (
                    k.nama_indo LIKE ? OR k.nama_arab LIKE ? OR k.fan LIKE ?
                    OR lk.keterangan LIKE ? OR lk.dari LIKE ? OR lk.sampai LIKE ?
                    OR r.kelas LIKE ? OR r.kel LIKE ? OR l.nama LIKE ?
                )';
                for ($i = 0; $i < 9; $i++) {
                    $bind[] = $term;
                }
            }

            $base = "FROM lembaga___kitab lk
                INNER JOIN lembaga___rombel r ON r.id = lk.id_rombel
                LEFT JOIN lembaga l ON l.id = r.lembaga_id
                INNER JOIN kitab k ON k.id = lk.id_kitab
                $where";

            $stmt = $this->db->prepare('SELECT COUNT(*) AS total ' . $base);
            $stmt->execute($bind);
            $total = (int) $stmt->fetch(\PDO::FETCH_ASSOC)['total'];

            $sql = "SELECT lk.*,
                    r.lembaga_id, r.kelas, r.kel,
                    l.nama AS lembaga_nama,
                    k.nama_indo AS kitab_nama, k.fan AS kitab_fan, k.nama_arab AS kitab_nama_arab
                    $base
                    ORDER BY l.nama, r.kelas, r.kel, k.nama_indo
                    LIMIT " . (int) $limit . ' OFFSET ' . (int) $offset;

            $stmt = $this->db->prepare($sql);
            $stmt->execute($bind);
            $rows = $stmt->fetchAll(\PDO::FETCH_ASSOC);

            return $this->jsonResponse($response, [
                'success' => true,
                'data' => $rows,
                'total' => $total,
                'page' => $page,
                'limit' => $limit,
            ], 200);
        } catch (\Exception $e) {
            error_log('LembagaKitabController::getAll: ' . $e->getMessage());

            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Gagal mengambil daftar mapel',
                'error' => null,
            ], 500);
        }
    }

    /**
     * GET /api/mapel/{id}
     */
    public function getById(Request $request, Response $response, array $args): Response
    {
        try {
            $id = isset($args['id']) ? (int) $args['id'] : 0;
            if ($id < 1) {
                return $this->jsonResponse($response, ['success' => false, 'message' => 'ID tidak valid'], 400);
            }

            $sql = "SELECT lk.*,
                    r.lembaga_id, r.kelas, r.kel,
                    l.nama AS lembaga_nama,
                    k.nama_indo AS kitab_nama, k.fan AS kitab_fan
                    FROM lembaga___kitab lk
                    INNER JOIN lembaga___rombel r ON r.id = lk.id_rombel
                    LEFT JOIN lembaga l ON l.id = r.lembaga_id
                    INNER JOIN kitab k ON k.id = lk.id_kitab
                    WHERE lk.id = ?";

            $stmt = $this->db->prepare($sql);
            $stmt->execute([$id]);
            $row = $stmt->fetch(\PDO::FETCH_ASSOC);

            if (!$row) {
                return $this->jsonResponse($response, ['success' => false, 'message' => 'Data tidak ditemukan'], 404);
            }

            return $this->jsonResponse($response, ['success' => true, 'data' => $row], 200);
        } catch (\Exception $e) {
            error_log('LembagaKitabController::getById: ' . $e->getMessage());

            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Gagal mengambil data',
            ], 500);
        }
    }

    /**
     * POST /api/mapel
     */
    public function create(Request $request, Response $response): Response
    {
        try {
            $data = $request->getParsedBody() ?? [];
            $idRombel = isset($data['id_rombel']) ? (int) $data['id_rombel'] : 0;
            $idKitab = isset($data['id_kitab']) ? (int) $data['id_kitab'] : 0;

            if ($idRombel < 1 || $idKitab < 1) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Rombel dan kitab wajib dipilih',
                ], 400);
            }

            $stmt = $this->db->prepare('SELECT id FROM lembaga___rombel WHERE id = ?');
            $stmt->execute([$idRombel]);
            if (!$stmt->fetch()) {
                return $this->jsonResponse($response, ['success' => false, 'message' => 'Rombel tidak ditemukan'], 400);
            }

            $stmt = $this->db->prepare('SELECT id FROM kitab WHERE id = ?');
            $stmt->execute([$idKitab]);
            if (!$stmt->fetch()) {
                return $this->jsonResponse($response, ['success' => false, 'message' => 'Kitab tidak ditemukan'], 400);
            }

            $dari = TextSanitizer::cleanTextOrNull($data['dari'] ?? null);
            $sampai = TextSanitizer::cleanTextOrNull($data['sampai'] ?? null);
            $keterangan = TextSanitizer::cleanTextOrNull($data['keterangan'] ?? null);
            $status = TextSanitizer::cleanTextOrNull($data['status'] ?? null) ?: 'aktif';

            $stmt = $this->db->prepare(
                'INSERT INTO lembaga___kitab (id_rombel, id_kitab, dari, sampai, keterangan, status) VALUES (?, ?, ?, ?, ?, ?)'
            );
            $stmt->execute([$idRombel, $idKitab, $dari, $sampai, $keterangan, $status]);

            $newId = (int) $this->db->lastInsertId();

            return $this->getById($request, $response, ['id' => $newId]);
        } catch (\Exception $e) {
            error_log('LembagaKitabController::create: ' . $e->getMessage());

            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Gagal menambahkan mapel',
                'error' => null,
            ], 500);
        }
    }

    /**
     * PUT /api/mapel/{id}
     */
    public function update(Request $request, Response $response, array $args): Response
    {
        try {
            $id = isset($args['id']) ? (int) $args['id'] : 0;
            if ($id < 1) {
                return $this->jsonResponse($response, ['success' => false, 'message' => 'ID tidak valid'], 400);
            }

            $stmt = $this->db->prepare('SELECT id FROM lembaga___kitab WHERE id = ?');
            $stmt->execute([$id]);
            if (!$stmt->fetch()) {
                return $this->jsonResponse($response, ['success' => false, 'message' => 'Data tidak ditemukan'], 404);
            }

            $data = $request->getParsedBody() ?? [];
            $idRombel = isset($data['id_rombel']) ? (int) $data['id_rombel'] : 0;
            $idKitab = isset($data['id_kitab']) ? (int) $data['id_kitab'] : 0;

            if ($idRombel < 1 || $idKitab < 1) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Rombel dan kitab wajib dipilih',
                ], 400);
            }

            $stmt = $this->db->prepare('SELECT id FROM lembaga___rombel WHERE id = ?');
            $stmt->execute([$idRombel]);
            if (!$stmt->fetch()) {
                return $this->jsonResponse($response, ['success' => false, 'message' => 'Rombel tidak ditemukan'], 400);
            }

            $stmt = $this->db->prepare('SELECT id FROM kitab WHERE id = ?');
            $stmt->execute([$idKitab]);
            if (!$stmt->fetch()) {
                return $this->jsonResponse($response, ['success' => false, 'message' => 'Kitab tidak ditemukan'], 400);
            }

            $dari = TextSanitizer::cleanTextOrNull($data['dari'] ?? null);
            $sampai = TextSanitizer::cleanTextOrNull($data['sampai'] ?? null);
            $keterangan = TextSanitizer::cleanTextOrNull($data['keterangan'] ?? null);
            $status = TextSanitizer::cleanTextOrNull($data['status'] ?? null) ?: 'aktif';

            $stmt = $this->db->prepare(
                'UPDATE lembaga___kitab SET id_rombel = ?, id_kitab = ?, dari = ?, sampai = ?, keterangan = ?, status = ? WHERE id = ?'
            );
            $stmt->execute([$idRombel, $idKitab, $dari, $sampai, $keterangan, $status, $id]);

            return $this->getById($request, $response, ['id' => $id]);
        } catch (\Exception $e) {
            error_log('LembagaKitabController::update: ' . $e->getMessage());

            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Gagal memperbarui mapel',
                'error' => null,
            ], 500);
        }
    }

    /**
     * DELETE /api/mapel/{id}
     */
    public function delete(Request $request, Response $response, array $args): Response
    {
        try {
            $id = isset($args['id']) ? (int) $args['id'] : 0;
            if ($id < 1) {
                return $this->jsonResponse($response, ['success' => false, 'message' => 'ID tidak valid'], 400);
            }

            $stmt = $this->db->prepare('DELETE FROM lembaga___kitab WHERE id = ?');
            $stmt->execute([$id]);
            if ($stmt->rowCount() === 0) {
                return $this->jsonResponse($response, ['success' => false, 'message' => 'Data tidak ditemukan'], 404);
            }

            return $this->jsonResponse($response, [
                'success' => true,
                'message' => 'Mapel dihapus',
            ], 200);
        } catch (\Exception $e) {
            error_log('LembagaKitabController::delete: ' . $e->getMessage());

            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Gagal menghapus',
            ], 500);
        }
    }
}

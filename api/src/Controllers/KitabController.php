<?php

namespace App\Controllers;

use App\Database;
use App\Helpers\TextSanitizer;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;

class KitabController
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
     * GET /api/kitab — daftar kitab (opsional: search, fan)
     */
    public function getList(Request $request, Response $response): Response
    {
        try {
            $params = $request->getQueryParams();
            $search = isset($params['search']) ? trim((string) $params['search']) : '';
            $fan = isset($params['fan']) ? trim((string) $params['fan']) : '';

            $sql = 'SELECT * FROM kitab WHERE 1=1';
            $bind = [];

            if ($search !== '') {
                $like = '%' . $search . '%';
                $sql .= ' AND (
                    nama_indo LIKE ? OR nama_arab LIKE ? OR penulis LIKE ? OR penerbit LIKE ? OR isbn LIKE ? OR fan LIKE ?
                )';
                array_push($bind, $like, $like, $like, $like, $like, $like);
            }

            if ($fan !== '') {
                $sql .= ' AND fan = ?';
                $bind[] = $fan;
            }

            $sql .= ' ORDER BY fan ASC, nama_indo ASC LIMIT 2000';

            $stmt = $this->db->prepare($sql);
            $stmt->execute($bind);
            $rows = $stmt->fetchAll(\PDO::FETCH_ASSOC);

            return $this->jsonResponse($response, [
                'success' => true,
                'data' => $rows,
            ], 200);
        } catch (\Exception $e) {
            error_log('KitabController::getList: ' . $e->getMessage());

            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Gagal mengambil daftar kitab',
                'error' => $e->getMessage(),
            ], 500);
        }
    }

    /**
     * GET /api/kitab/fan-options — nilai fan unik (untuk filter)
     */
    public function getFanOptions(Request $request, Response $response): Response
    {
        try {
            $stmt = $this->db->query(
                'SELECT DISTINCT fan FROM kitab WHERE fan IS NOT NULL AND TRIM(fan) <> \'\' ORDER BY fan ASC'
            );
            $fans = $stmt->fetchAll(\PDO::FETCH_COLUMN);

            return $this->jsonResponse($response, [
                'success' => true,
                'data' => array_values(array_map('strval', $fans)),
            ], 200);
        } catch (\Exception $e) {
            error_log('KitabController::getFanOptions: ' . $e->getMessage());

            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Gagal mengambil opsi fan',
            ], 500);
        }
    }

    /**
     * GET /api/kitab/{id}
     */
    public function getById(Request $request, Response $response, array $args): Response
    {
        try {
            $id = isset($args['id']) ? (int) $args['id'] : 0;
            if ($id < 1) {
                return $this->jsonResponse($response, ['success' => false, 'message' => 'ID tidak valid'], 400);
            }

            $stmt = $this->db->prepare('SELECT * FROM kitab WHERE id = ?');
            $stmt->execute([$id]);
            $row = $stmt->fetch(\PDO::FETCH_ASSOC);

            if (!$row) {
                return $this->jsonResponse($response, ['success' => false, 'message' => 'Kitab tidak ditemukan'], 404);
            }

            return $this->jsonResponse($response, ['success' => true, 'data' => $row], 200);
        } catch (\Exception $e) {
            error_log('KitabController::getById: ' . $e->getMessage());

            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Gagal mengambil kitab',
            ], 500);
        }
    }

    /**
     * POST /api/kitab
     */
    public function create(Request $request, Response $response): Response
    {
        try {
            $data = $request->getParsedBody() ?? [];
            $namaIndo = TextSanitizer::cleanTextOrNull($data['nama_indo'] ?? null);

            if ($namaIndo === null || $namaIndo === '') {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Nama (Indonesia) wajib diisi',
                ], 400);
            }

            $fan = TextSanitizer::cleanTextOrNull($data['fan'] ?? null);
            $namaArab = TextSanitizer::cleanTextOrNull($data['nama_arab'] ?? null);
            $penulis = TextSanitizer::cleanTextOrNull($data['penulis'] ?? null);
            $penerbit = TextSanitizer::cleanTextOrNull($data['penerbit'] ?? null);
            $isbn = TextSanitizer::cleanTextOrNull($data['isbn'] ?? null);
            $keterangan = TextSanitizer::cleanTextOrNull($data['keterangan'] ?? null);

            $tahun = null;
            if (isset($data['tahun']) && $data['tahun'] !== '' && $data['tahun'] !== null) {
                $t = (int) $data['tahun'];
                if ($t < 1000 || $t > 2100) {
                    return $this->jsonResponse($response, [
                        'success' => false,
                        'message' => 'Tahun terbit tidak valid (1000–2100)',
                    ], 400);
                }
                $tahun = $t;
            }

            $stmt = $this->db->prepare(
                'INSERT INTO kitab (fan, nama_indo, nama_arab, penulis, penerbit, tahun, isbn, keterangan)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
            );
            $stmt->execute([
                $fan,
                $namaIndo,
                $namaArab,
                $penulis,
                $penerbit,
                $tahun,
                $isbn,
                $keterangan,
            ]);

            $newId = (int) $this->db->lastInsertId();

            $stmt = $this->db->prepare('SELECT * FROM kitab WHERE id = ?');
            $stmt->execute([$newId]);
            $row = $stmt->fetch(\PDO::FETCH_ASSOC);

            return $this->jsonResponse($response, [
                'success' => true,
                'message' => 'Kitab berhasil ditambahkan',
                'data' => $row,
            ], 201);
        } catch (\Exception $e) {
            error_log('KitabController::create: ' . $e->getMessage());

            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Gagal menambahkan kitab',
                'error' => $e->getMessage(),
            ], 500);
        }
    }

    /**
     * PUT /api/kitab/{id}
     */
    public function update(Request $request, Response $response, array $args): Response
    {
        try {
            $id = isset($args['id']) ? (int) $args['id'] : 0;
            if ($id < 1) {
                return $this->jsonResponse($response, ['success' => false, 'message' => 'ID tidak valid'], 400);
            }

            $stmt = $this->db->prepare('SELECT id FROM kitab WHERE id = ?');
            $stmt->execute([$id]);
            if (!$stmt->fetch()) {
                return $this->jsonResponse($response, ['success' => false, 'message' => 'Kitab tidak ditemukan'], 404);
            }

            $data = $request->getParsedBody() ?? [];
            $namaIndo = TextSanitizer::cleanTextOrNull($data['nama_indo'] ?? null);

            if ($namaIndo === null || $namaIndo === '') {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Nama (Indonesia) wajib diisi',
                ], 400);
            }

            $fan = TextSanitizer::cleanTextOrNull($data['fan'] ?? null);
            $namaArab = TextSanitizer::cleanTextOrNull($data['nama_arab'] ?? null);
            $penulis = TextSanitizer::cleanTextOrNull($data['penulis'] ?? null);
            $penerbit = TextSanitizer::cleanTextOrNull($data['penerbit'] ?? null);
            $isbn = TextSanitizer::cleanTextOrNull($data['isbn'] ?? null);
            $keterangan = TextSanitizer::cleanTextOrNull($data['keterangan'] ?? null);

            $tahun = null;
            if (isset($data['tahun']) && $data['tahun'] !== '' && $data['tahun'] !== null) {
                $t = (int) $data['tahun'];
                if ($t < 1000 || $t > 2100) {
                    return $this->jsonResponse($response, [
                        'success' => false,
                        'message' => 'Tahun terbit tidak valid (1000–2100)',
                    ], 400);
                }
                $tahun = $t;
            }

            $stmt = $this->db->prepare(
                'UPDATE kitab SET fan = ?, nama_indo = ?, nama_arab = ?, penulis = ?, penerbit = ?, tahun = ?, isbn = ?, keterangan = ? WHERE id = ?'
            );
            $stmt->execute([
                $fan,
                $namaIndo,
                $namaArab,
                $penulis,
                $penerbit,
                $tahun,
                $isbn,
                $keterangan,
                $id,
            ]);

            $stmt = $this->db->prepare('SELECT * FROM kitab WHERE id = ?');
            $stmt->execute([$id]);
            $row = $stmt->fetch(\PDO::FETCH_ASSOC);

            return $this->jsonResponse($response, [
                'success' => true,
                'message' => 'Kitab berhasil diperbarui',
                'data' => $row,
            ], 200);
        } catch (\Exception $e) {
            error_log('KitabController::update: ' . $e->getMessage());

            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Gagal memperbarui kitab',
                'error' => $e->getMessage(),
            ], 500);
        }
    }

    /**
     * DELETE /api/kitab/{id}
     */
    public function delete(Request $request, Response $response, array $args): Response
    {
        try {
            $id = isset($args['id']) ? (int) $args['id'] : 0;
            if ($id < 1) {
                return $this->jsonResponse($response, ['success' => false, 'message' => 'ID tidak valid'], 400);
            }

            $stmt = $this->db->prepare('DELETE FROM kitab WHERE id = ?');
            $stmt->execute([$id]);
            if ($stmt->rowCount() === 0) {
                return $this->jsonResponse($response, ['success' => false, 'message' => 'Kitab tidak ditemukan'], 404);
            }

            return $this->jsonResponse($response, [
                'success' => true,
                'message' => 'Kitab berhasil dihapus',
            ], 200);
        } catch (\Exception $e) {
            error_log('KitabController::delete: ' . $e->getMessage());

            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Gagal menghapus kitab',
                'error' => $e->getMessage(),
            ], 500);
        }
    }
}

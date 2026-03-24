<?php

namespace App\Controllers;

use App\Database;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;

/**
 * Daftar kontak WA (whatsapp___kontak). Super_admin only.
 * GET /api/kontak - list dengan pagination & search
 * PATCH /api/kontak/{id} - update siap_terima_notif
 * DELETE /api/kontak/{id} - hapus kontak
 */
class KontakController
{
    private function jsonResponse(Response $response, array $data, int $statusCode): Response
    {
        $response->getBody()->write(json_encode($data, JSON_UNESCAPED_UNICODE));
        return $response
            ->withStatus($statusCode)
            ->withHeader('Content-Type', 'application/json; charset=utf-8');
    }

    /**
     * GET /api/kontak - Daftar kontak (nomor unik, siap_terima_notif, nomor_kanonik/LID). Pagination & search.
     */
    public function getList(Request $request, Response $response): Response
    {
        $params = $request->getQueryParams();
        $page = max(1, (int) ($params['page'] ?? 1));
        $limit = min(100, max(1, (int) ($params['limit'] ?? 20)));
        $search = isset($params['search']) ? trim((string) $params['search']) : '';

        try {
            $db = Database::getInstance()->getConnection();
            $tableCheck = $db->query("SHOW TABLES LIKE 'whatsapp___kontak'");
            if ($tableCheck->rowCount() === 0) {
                return $this->jsonResponse($response, [
                    'success' => true,
                    'data' => ['items' => [], 'total' => 0, 'page' => $page, 'limit' => $limit],
                ], 200);
            }

            $hasNamaCol = false;
            try {
                $namaCheck = $db->query("SHOW COLUMNS FROM whatsapp___kontak LIKE 'nama'");
                $hasNamaCol = $namaCheck !== false && $namaCheck->rowCount() > 0;
            } catch (\Throwable $e) {
                $hasNamaCol = false;
            }
            $where = '1=1';
            $bind = [];
            if ($search !== '') {
                $where .= ' AND (nomor LIKE ? OR nomor LIKE ? OR nomor_kanonik LIKE ?';
                $bind[] = '%' . $search . '%';
                $bind[] = '%' . preg_replace('/\D/', '', $search) . '%';
                $bind[] = '%' . $search . '%';
                if ($hasNamaCol) {
                    $where .= ' OR nama LIKE ?';
                    $bind[] = '%' . $search . '%';
                }
                $where .= ')';
            }

            $countStmt = $db->prepare("SELECT COUNT(*) FROM whatsapp___kontak WHERE {$where}");
            $countStmt->execute($bind);
            $total = (int) $countStmt->fetchColumn();

            $offset = ($page - 1) * $limit;
            $order = 'ORDER BY updated_at DESC, id DESC';
            $selectNama = $hasNamaCol ? 'nama,' : 'NULL AS nama,';
            $listStmt = $db->prepare("SELECT id, nomor, {$selectNama} nomor_kanonik, siap_terima_notif, created_at, updated_at FROM whatsapp___kontak WHERE {$where} {$order} LIMIT {$limit} OFFSET {$offset}");
            $listStmt->execute($bind);

            $items = [];
            while ($row = $listStmt->fetch(\PDO::FETCH_ASSOC)) {
                $items[] = [
                    'id' => (int) $row['id'],
                    'nomor' => $row['nomor'],
                    'nama' => $row['nama'] ?? null,
                    'nomor_kanonik' => $row['nomor_kanonik'] ?? null,
                    'siap_terima_notif' => (int) $row['siap_terima_notif'] === 1,
                    'created_at' => $row['created_at'],
                    'updated_at' => $row['updated_at'],
                ];
            }

            return $this->jsonResponse($response, [
                'success' => true,
                'data' => [
                    'items' => $items,
                    'total' => $total,
                    'page' => $page,
                    'limit' => $limit,
                ],
            ], 200);
        } catch (\Throwable $e) {
            error_log('KontakController::getList: ' . $e->getMessage());
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Gagal mengambil daftar kontak',
            ], 500);
        }
    }

    /**
     * PATCH /api/kontak/{id} - Update siap_terima_notif. Body: { "siap_terima_notif": true|false }
     */
    public function update(Request $request, Response $response, array $args): Response
    {
        $id = (int) ($args['id'] ?? 0);
        if ($id <= 0) {
            return $this->jsonResponse($response, ['success' => false, 'message' => 'ID tidak valid'], 400);
        }

        $body = (array) $request->getParsedBody();
        $siap = isset($body['siap_terima_notif']) ? (bool) $body['siap_terima_notif'] : null;
        if ($siap === null) {
            return $this->jsonResponse($response, ['success' => false, 'message' => 'siap_terima_notif wajib (true/false)'], 400);
        }

        try {
            $db = Database::getInstance()->getConnection();
            $tableCheck = $db->query("SHOW TABLES LIKE 'whatsapp___kontak'");
            if ($tableCheck->rowCount() === 0) {
                return $this->jsonResponse($response, ['success' => false, 'message' => 'Tabel kontak belum ada'], 404);
            }

            $stmt = $db->prepare('UPDATE whatsapp___kontak SET siap_terima_notif = ?, updated_at = NOW() WHERE id = ?');
            $stmt->execute([$siap ? 1 : 0, $id]);
            if ($stmt->rowCount() === 0) {
                return $this->jsonResponse($response, ['success' => false, 'message' => 'Kontak tidak ditemukan'], 404);
            }

            return $this->jsonResponse($response, [
                'success' => true,
                'message' => 'Pengaturan kontak diperbarui',
                'data' => ['siap_terima_notif' => $siap],
            ], 200);
        } catch (\Throwable $e) {
            error_log('KontakController::update: ' . $e->getMessage());
            return $this->jsonResponse($response, ['success' => false, 'message' => 'Gagal memperbarui kontak'], 500);
        }
    }

    /**
     * DELETE /api/kontak/{id} - Hapus kontak berdasarkan ID
     */
    public function delete(Request $request, Response $response, array $args): Response
    {
        $id = (int) ($args['id'] ?? 0);
        if ($id <= 0) {
            return $this->jsonResponse($response, ['success' => false, 'message' => 'ID tidak valid'], 400);
        }

        try {
            $db = Database::getInstance()->getConnection();
            $tableCheck = $db->query("SHOW TABLES LIKE 'whatsapp___kontak'");
            if ($tableCheck->rowCount() === 0) {
                return $this->jsonResponse($response, ['success' => false, 'message' => 'Tabel kontak belum ada'], 404);
            }

            $stmt = $db->prepare('DELETE FROM whatsapp___kontak WHERE id = ?');
            $stmt->execute([$id]);
            if ($stmt->rowCount() === 0) {
                return $this->jsonResponse($response, ['success' => false, 'message' => 'Kontak tidak ditemukan'], 404);
            }

            return $this->jsonResponse($response, [
                'success' => true,
                'message' => 'Kontak berhasil dihapus',
            ], 200);
        } catch (\Throwable $e) {
            error_log('KontakController::delete: ' . $e->getMessage());
            return $this->jsonResponse($response, ['success' => false, 'message' => 'Gagal menghapus kontak'], 500);
        }
    }
}

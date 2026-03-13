<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Database;
use App\Helpers\TextSanitizer;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;

/**
 * Controller data barang toko untuk Mybeddian.
 * Hanya untuk role toko; toko_id dari JWT = pedagang_id di cashless___barang.
 */
class MybeddianBarangController
{
    private \PDO $db;

    public function __construct()
    {
        $this->db = Database::getInstance()->getConnection();
    }

    private function getTokoIdFromRequest(Request $request): ?int
    {
        $payload = $request->getAttribute('user');
        $tokoId = isset($payload['toko_id']) ? (int) $payload['toko_id'] : 0;
        return $tokoId > 0 ? $tokoId : null;
    }

    private function json(Response $response, array $data, int $status): Response
    {
        $response->getBody()->write(json_encode($data, JSON_UNESCAPED_UNICODE));
        return $response->withStatus($status)->withHeader('Content-Type', 'application/json; charset=utf-8');
    }

    /**
     * GET /api/mybeddian/v2/barang - Daftar barang toko. Query: search (cari nama_barang atau kode_barang/QR/barcode).
     */
    public function list(Request $request, Response $response): Response
    {
        try {
            $pedagangId = $this->getTokoIdFromRequest($request);
            if ($pedagangId === null) {
                return $this->json($response, ['success' => false, 'message' => 'Akses hanya untuk toko'], 403);
            }
            $params = $request->getQueryParams();
            $search = isset($params['search']) ? trim((string) $params['search']) : '';
            $where = 'pedagang_id = ?';
            $bind = [$pedagangId];
            if ($search !== '') {
                $where .= ' AND (nama_barang LIKE ? OR kode_barang LIKE ?)';
                $term = '%' . $search . '%';
                $bind[] = $term;
                $bind[] = $term;
            }
            $stmt = $this->db->prepare("
                SELECT id, pedagang_id, kode_barang, nama_barang, harga, keterangan, urutan, aktif, tanggal_dibuat, tanggal_update
                FROM cashless___barang
                WHERE $where
                ORDER BY urutan ASC, nama_barang ASC
            ");
            $stmt->execute($bind);
            $list = [];
            while ($row = $stmt->fetch(\PDO::FETCH_ASSOC)) {
                $row['id'] = (int) $row['id'];
                $row['pedagang_id'] = (int) $row['pedagang_id'];
                $row['harga'] = (float) $row['harga'];
                $row['urutan'] = (int) $row['urutan'];
                $row['aktif'] = (int) $row['aktif'];
                $list[] = $row;
            }
            return $this->json($response, ['success' => true, 'data' => $list], 200);
        } catch (\Exception $e) {
            error_log('MybeddianBarangController::list ' . $e->getMessage());
            return $this->json($response, ['success' => false, 'message' => 'Terjadi kesalahan'], 500);
        }
    }

    /** Generate kode otomatis (B0001, B0002, ...) untuk toko. */
    private function generateKodeBarang(int $pedagangId): string
    {
        $stmt = $this->db->prepare("
            SELECT COALESCE(MAX(CAST(SUBSTRING(kode_barang, 2) AS UNSIGNED)), 0) + 1 AS next_seq
            FROM cashless___barang
            WHERE pedagang_id = ? AND kode_barang REGEXP '^B[0-9]+$'
        ");
        $stmt->execute([$pedagangId]);
        $row = $stmt->fetch(\PDO::FETCH_ASSOC);
        $next = (int) ($row['next_seq'] ?? 1);
        if ($next > 99999) {
            $next = 99999;
        }
        return 'B' . str_pad((string) $next, 4, '0', STR_PAD_LEFT);
    }

    /**
     * POST /api/mybeddian/v2/barang - Tambah barang. Body: nama_barang (wajib), harga (wajib), kode_barang (opsional; kosong = otomatis B0001, B0002, ...), keterangan, urutan (opsional).
     */
    public function create(Request $request, Response $response): Response
    {
        try {
            $pedagangId = $this->getTokoIdFromRequest($request);
            if ($pedagangId === null) {
                return $this->json($response, ['success' => false, 'message' => 'Akses hanya untuk toko'], 403);
            }
            $data = $request->getParsedBody() ?? [];
            $data = is_array($data) ? TextSanitizer::sanitizeStringValues($data, []) : [];
            $namaBarang = trim((string) ($data['nama_barang'] ?? ''));
            $harga = isset($data['harga']) ? (float) $data['harga'] : null;
            $kodeBarang = isset($data['kode_barang']) ? trim((string) $data['kode_barang']) : '';
            $keterangan = isset($data['keterangan']) ? trim((string) $data['keterangan']) : null;
            $urutan = isset($data['urutan']) ? (int) $data['urutan'] : 0;
            if ($namaBarang === '') {
                return $this->json($response, ['success' => false, 'message' => 'nama_barang wajib diisi'], 400);
            }
            if ($harga === null || $harga < 0) {
                return $this->json($response, ['success' => false, 'message' => 'harga wajib diisi dan tidak boleh negatif'], 400);
            }
            if ($kodeBarang === '') {
                $kodeBarang = $this->generateKodeBarang($pedagangId);
            } else {
                $chk = $this->db->prepare('SELECT id FROM cashless___barang WHERE pedagang_id = ? AND kode_barang = ? LIMIT 1');
                $chk->execute([$pedagangId, $kodeBarang]);
                if ($chk->fetch()) {
                    return $this->json($response, ['success' => false, 'message' => 'Kode/QR/barcode sudah dipakai untuk barang lain'], 400);
                }
            }
            $ins = $this->db->prepare("INSERT INTO cashless___barang (pedagang_id, kode_barang, nama_barang, harga, keterangan, urutan, aktif) VALUES (?, ?, ?, ?, ?, ?, 1)");
            $ins->execute([$pedagangId, $kodeBarang, $namaBarang, $harga, $keterangan ?: null, $urutan]);
            $id = (int) $this->db->lastInsertId();
            return $this->json($response, [
                'success' => true,
                'message' => 'Barang berhasil ditambahkan',
                'data' => ['id' => $id, 'kode_barang' => $kodeBarang, 'nama_barang' => $namaBarang, 'harga' => $harga, 'keterangan' => $keterangan, 'urutan' => $urutan, 'aktif' => 1],
            ], 201);
        } catch (\Exception $e) {
            error_log('MybeddianBarangController::create ' . $e->getMessage());
            return $this->json($response, ['success' => false, 'message' => 'Gagal menambahkan barang'], 500);
        }
    }

    /**
     * PUT /api/mybeddian/v2/barang/{id} - Update barang. Body: nama_barang, harga, keterangan, urutan, aktif (opsional).
     */
    public function update(Request $request, Response $response, array $args): Response
    {
        try {
            $pedagangId = $this->getTokoIdFromRequest($request);
            if ($pedagangId === null) {
                return $this->json($response, ['success' => false, 'message' => 'Akses hanya untuk toko'], 403);
            }
            $id = (int) ($args['id'] ?? 0);
            if ($id <= 0) {
                return $this->json($response, ['success' => false, 'message' => 'ID tidak valid'], 400);
            }
            $data = $request->getParsedBody() ?? [];
            $data = is_array($data) ? TextSanitizer::sanitizeStringValues($data, []) : [];
            $chk = $this->db->prepare("SELECT id FROM cashless___barang WHERE id = ? AND pedagang_id = ? LIMIT 1");
            $chk->execute([$id, $pedagangId]);
            if (!$chk->fetch()) {
                return $this->json($response, ['success' => false, 'message' => 'Barang tidak ditemukan'], 404);
            }
            $updates = [];
            $params = [];
            if (array_key_exists('nama_barang', $data)) {
                $v = trim((string) $data['nama_barang']);
                if ($v === '') {
                    return $this->json($response, ['success' => false, 'message' => 'nama_barang tidak boleh kosong'], 400);
                }
                $updates[] = 'nama_barang = ?';
                $params[] = $v;
            }
            if (array_key_exists('harga', $data)) {
                $v = (float) $data['harga'];
                if ($v < 0) {
                    return $this->json($response, ['success' => false, 'message' => 'harga tidak boleh negatif'], 400);
                }
                $updates[] = 'harga = ?';
                $params[] = $v;
            }
            if (array_key_exists('keterangan', $data)) {
                $updates[] = 'keterangan = ?';
                $params[] = trim((string) $data['keterangan']) ?: null;
            }
            if (array_key_exists('urutan', $data)) {
                $updates[] = 'urutan = ?';
                $params[] = (int) $data['urutan'];
            }
            if (array_key_exists('aktif', $data)) {
                $updates[] = 'aktif = ?';
                $params[] = (int) $data['aktif'] ? 1 : 0;
            }
            if (array_key_exists('kode_barang', $data)) {
                $v = trim((string) $data['kode_barang']);
                if ($v === '') {
                    return $this->json($response, ['success' => false, 'message' => 'kode_barang tidak boleh kosong saat edit'], 400);
                }
                $chk = $this->db->prepare('SELECT id FROM cashless___barang WHERE pedagang_id = ? AND kode_barang = ? AND id != ? LIMIT 1');
                $chk->execute([$pedagangId, $v, $id]);
                if ($chk->fetch()) {
                    return $this->json($response, ['success' => false, 'message' => 'Kode/QR/barcode sudah dipakai untuk barang lain'], 400);
                }
                $updates[] = 'kode_barang = ?';
                $params[] = $v;
            }
            if ($updates === []) {
                return $this->json($response, ['success' => true, 'message' => 'Tidak ada perubahan'], 200);
            }
            $params[] = $id;
            $params[] = $pedagangId;
            $sql = "UPDATE cashless___barang SET " . implode(', ', $updates) . " WHERE id = ? AND pedagang_id = ?";
            $this->db->prepare($sql)->execute($params);
            return $this->json($response, ['success' => true, 'message' => 'Barang berhasil diperbarui'], 200);
        } catch (\Exception $e) {
            error_log('MybeddianBarangController::update ' . $e->getMessage());
            return $this->json($response, ['success' => false, 'message' => 'Gagal memperbarui barang'], 500);
        }
    }

    /**
     * DELETE /api/mybeddian/v2/barang/{id} - Hapus barang (hanya milik toko ini).
     */
    public function delete(Request $request, Response $response, array $args): Response
    {
        try {
            $pedagangId = $this->getTokoIdFromRequest($request);
            if ($pedagangId === null) {
                return $this->json($response, ['success' => false, 'message' => 'Akses hanya untuk toko'], 403);
            }
            $id = (int) ($args['id'] ?? 0);
            if ($id <= 0) {
                return $this->json($response, ['success' => false, 'message' => 'ID tidak valid'], 400);
            }
            $del = $this->db->prepare("DELETE FROM cashless___barang WHERE id = ? AND pedagang_id = ?");
            $del->execute([$id, $pedagangId]);
            if ($del->rowCount() === 0) {
                return $this->json($response, ['success' => false, 'message' => 'Barang tidak ditemukan'], 404);
            }
            return $this->json($response, ['success' => true, 'message' => 'Barang berhasil dihapus'], 200);
        } catch (\Exception $e) {
            error_log('MybeddianBarangController::delete ' . $e->getMessage());
            return $this->json($response, ['success' => false, 'message' => 'Gagal menghapus barang'], 500);
        }
    }
}

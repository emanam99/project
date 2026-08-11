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
            $since = isset($params['since']) ? trim((string) $params['since']) : '';
            $where = 'pedagang_id = ?';
            $bind = [$pedagangId];
            if ($search !== '') {
                $where .= ' AND (nama_barang LIKE ? OR kode_barang LIKE ?)';
                $term = '%' . $search . '%';
                $bind[] = $term;
                $bind[] = $term;
            }
            if ($since !== '') {
                $where .= ' AND tanggal_update > ?';
                $bind[] = $since;
            }
            $stmt = $this->db->prepare("
                SELECT id, pedagang_id, kode_barang, nama_barang, harga, stok, keterangan, urutan, aktif, tanggal_dibuat, tanggal_update
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
                $row['stok'] = (int) ($row['stok'] ?? 0);
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

    private function getUsersIdFromRequest(Request $request): ?int
    {
        $payload = $request->getAttribute('user');
        if (!is_array($payload)) {
            return null;
        }
        $usersId = (int) ($payload['users_id'] ?? $payload['id'] ?? 0);
        return $usersId > 0 ? $usersId : null;
    }

    /** @return array{id: int, stok: int}|null */
    private function getBarangOwned(int $barangId, int $pedagangId): ?array
    {
        $stmt = $this->db->prepare('SELECT id, stok FROM cashless___barang WHERE id = ? AND pedagang_id = ? LIMIT 1');
        $stmt->execute([$barangId, $pedagangId]);
        $row = $stmt->fetch(\PDO::FETCH_ASSOC);
        if (!$row) {
            return null;
        }
        return ['id' => (int) $row['id'], 'stok' => (int) ($row['stok'] ?? 0)];
    }

    private function recordStokMutation(
        int $barangId,
        int $pedagangId,
        int $jumlah,
        int $stokSetelah,
        string $jenis,
        ?string $keterangan,
        ?int $usersId,
        ?string $referensiTipe = null,
        ?int $referensiId = null
    ): void {
        $ins = $this->db->prepare(
            'INSERT INTO cashless___barang_stok
                (barang_id, pedagang_id, jumlah, stok_setelah, jenis, keterangan, referensi_tipe, referensi_id, users_id)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
        );
        $ins->execute([
            $barangId,
            $pedagangId,
            $jumlah,
            $stokSetelah,
            $jenis,
            $keterangan ?: null,
            $referensiTipe,
            $referensiId,
            $usersId,
        ]);
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
            $stokAwal = isset($data['stok_awal']) ? (int) $data['stok_awal'] : 0;
            if ($namaBarang === '') {
                return $this->json($response, ['success' => false, 'message' => 'nama_barang wajib diisi'], 400);
            }
            if ($harga === null || $harga < 0) {
                return $this->json($response, ['success' => false, 'message' => 'harga wajib diisi dan tidak boleh negatif'], 400);
            }
            if ($stokAwal < 0) {
                return $this->json($response, ['success' => false, 'message' => 'stok_awal tidak boleh negatif'], 400);
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
            $usersId = $this->getUsersIdFromRequest($request);
            $this->db->beginTransaction();
            try {
                $ins = $this->db->prepare(
                    'INSERT INTO cashless___barang (pedagang_id, kode_barang, nama_barang, harga, stok, keterangan, urutan, aktif)
                     VALUES (?, ?, ?, ?, ?, ?, ?, 1)'
                );
                $ins->execute([$pedagangId, $kodeBarang, $namaBarang, $harga, $stokAwal, $keterangan ?: null, $urutan]);
                $id = (int) $this->db->lastInsertId();
                if ($stokAwal > 0) {
                    $this->recordStokMutation($id, $pedagangId, $stokAwal, $stokAwal, 'awal', 'Stok awal', $usersId);
                }
                $this->db->commit();
            } catch (\Throwable $e) {
                $this->db->rollBack();
                throw $e;
            }
            return $this->json($response, [
                'success' => true,
                'message' => 'Barang berhasil ditambahkan',
                'data' => [
                    'id' => $id,
                    'kode_barang' => $kodeBarang,
                    'nama_barang' => $namaBarang,
                    'harga' => $harga,
                    'stok' => $stokAwal,
                    'keterangan' => $keterangan,
                    'urutan' => $urutan,
                    'aktif' => 1,
                ],
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

    /**
     * GET /api/mybeddian/v2/barang/{id}/stok — Riwayat mutasi stok barang.
     */
    public function listStok(Request $request, Response $response, array $args): Response
    {
        try {
            $pedagangId = $this->getTokoIdFromRequest($request);
            if ($pedagangId === null) {
                return $this->json($response, ['success' => false, 'message' => 'Akses hanya untuk toko'], 403);
            }
            $barangId = (int) ($args['id'] ?? 0);
            if ($barangId <= 0) {
                return $this->json($response, ['success' => false, 'message' => 'ID tidak valid'], 400);
            }
            if ($this->getBarangOwned($barangId, $pedagangId) === null) {
                return $this->json($response, ['success' => false, 'message' => 'Barang tidak ditemukan'], 404);
            }
            $params = $request->getQueryParams();
            $limit = isset($params['limit']) ? min(100, max(1, (int) $params['limit'])) : 50;
            $stmt = $this->db->prepare(
                'SELECT id, barang_id, jumlah, stok_setelah, jenis, keterangan, users_id, tanggal_dibuat
                 FROM cashless___barang_stok
                 WHERE barang_id = ? AND pedagang_id = ?
                 ORDER BY tanggal_dibuat DESC, id DESC
                 LIMIT ' . $limit
            );
            $stmt->execute([$barangId, $pedagangId]);
            $list = [];
            while ($row = $stmt->fetch(\PDO::FETCH_ASSOC)) {
                $list[] = [
                    'id' => (int) $row['id'],
                    'barang_id' => (int) $row['barang_id'],
                    'jumlah' => (int) $row['jumlah'],
                    'stok_setelah' => (int) $row['stok_setelah'],
                    'jenis' => (string) $row['jenis'],
                    'keterangan' => $row['keterangan'],
                    'users_id' => $row['users_id'] !== null ? (int) $row['users_id'] : null,
                    'tanggal_dibuat' => $row['tanggal_dibuat'],
                ];
            }
            return $this->json($response, ['success' => true, 'data' => $list], 200);
        } catch (\Exception $e) {
            error_log('MybeddianBarangController::listStok ' . $e->getMessage());
            return $this->json($response, ['success' => false, 'message' => 'Terjadi kesalahan'], 500);
        }
    }

    /**
     * POST /api/mybeddian/v2/barang/{id}/stok
     * Body: jumlah (>0), jenis: masuk|retur|rusak|penyesuaian (default masuk), keterangan?
     * - masuk / retur: stok bertambah
     * - rusak: stok berkurang
     * - penyesuaian: body delta (boleh negatif lewat field delta) atau jumlah sebagai nilai absolut baru jika set absolut=true
     */
    public function addStok(Request $request, Response $response, array $args): Response
    {
        try {
            $pedagangId = $this->getTokoIdFromRequest($request);
            if ($pedagangId === null) {
                return $this->json($response, ['success' => false, 'message' => 'Akses hanya untuk toko'], 403);
            }
            $barangId = (int) ($args['id'] ?? 0);
            if ($barangId <= 0) {
                return $this->json($response, ['success' => false, 'message' => 'ID tidak valid'], 400);
            }
            $barang = $this->getBarangOwned($barangId, $pedagangId);
            if ($barang === null) {
                return $this->json($response, ['success' => false, 'message' => 'Barang tidak ditemukan'], 404);
            }
            $data = $request->getParsedBody() ?? [];
            $data = is_array($data) ? TextSanitizer::sanitizeStringValues($data, []) : [];
            $jenis = strtolower(trim((string) ($data['jenis'] ?? 'masuk')));
            $allowed = ['masuk', 'retur', 'rusak', 'penyesuaian'];
            if (!in_array($jenis, $allowed, true)) {
                return $this->json($response, [
                    'success' => false,
                    'message' => 'jenis harus salah satu: masuk, retur, rusak, penyesuaian',
                ], 400);
            }
            $jumlahInput = isset($data['jumlah']) ? (int) $data['jumlah'] : 0;
            $keterangan = isset($data['keterangan']) ? trim((string) $data['keterangan']) : null;
            $usersId = $this->getUsersIdFromRequest($request);
            $stokLama = $barang['stok'];

            if ($jenis === 'penyesuaian') {
                $delta = isset($data['delta']) ? (int) $data['delta'] : $jumlahInput;
                if ($delta === 0) {
                    return $this->json($response, ['success' => false, 'message' => 'delta/jumlah penyesuaian tidak boleh 0'], 400);
                }
                $stokBaru = $stokLama + $delta;
                if ($stokBaru < 0) {
                    return $this->json($response, ['success' => false, 'message' => 'Stok tidak boleh negatif'], 400);
                }
                $mutasiJumlah = $delta;
            } elseif ($jenis === 'rusak') {
                if ($jumlahInput <= 0) {
                    return $this->json($response, ['success' => false, 'message' => 'jumlah wajib > 0'], 400);
                }
                if ($jumlahInput > $stokLama) {
                    return $this->json($response, ['success' => false, 'message' => 'Jumlah rusak melebihi stok'], 400);
                }
                $stokBaru = $stokLama - $jumlahInput;
                $mutasiJumlah = -$jumlahInput;
            } else {
                // masuk | retur
                if ($jumlahInput <= 0) {
                    return $this->json($response, ['success' => false, 'message' => 'jumlah wajib diisi dan harus lebih dari 0'], 400);
                }
                $stokBaru = $stokLama + $jumlahInput;
                $mutasiJumlah = $jumlahInput;
            }

            $this->db->beginTransaction();
            try {
                $upd = $this->db->prepare('UPDATE cashless___barang SET stok = ? WHERE id = ? AND pedagang_id = ?');
                $upd->execute([$stokBaru, $barangId, $pedagangId]);
                $this->recordStokMutation($barangId, $pedagangId, $mutasiJumlah, $stokBaru, $jenis, $keterangan, $usersId);
                $this->db->commit();
            } catch (\Throwable $e) {
                $this->db->rollBack();
                throw $e;
            }

            return $this->json($response, [
                'success' => true,
                'message' => 'Stok berhasil diperbarui',
                'data' => [
                    'stok' => $stokBaru,
                    'jumlah' => $mutasiJumlah,
                    'jenis' => $jenis,
                ],
            ], 200);
        } catch (\Exception $e) {
            error_log('MybeddianBarangController::addStok ' . $e->getMessage());
            return $this->json($response, ['success' => false, 'message' => 'Gagal memperbarui stok'], 500);
        }
    }
}

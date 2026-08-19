<?php

namespace App\Controllers;

use App\Config\Database;
use App\Helpers\AuthHelper;
use App\Helpers\RekeningHelper;
use PDO;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;

class BelanjaController
{
    private PDO $db;

    public function __construct()
    {
        $this->db = Database::getInstance();
    }

    private function json(Response $response, array $payload, int $status = 200): Response
    {
        $response->getBody()->write(json_encode($payload, JSON_UNESCAPED_UNICODE));
        return $response->withHeader('Content-Type', 'application/json')->withStatus($status);
    }

    private function parseBody(Request $request): array
    {
        $data = json_decode((string) $request->getBody(), true);
        return is_array($data) ? $data : [];
    }

    private function normalizeJenis(?string $jenis): ?string
    {
        $jenis = strtolower(trim((string) $jenis));
        return in_array($jenis, ['masuk', 'keluar'], true) ? $jenis : null;
    }

    private function recalcTotal(int $belanjaId): void
    {
        $stmt = $this->db->prepare('SELECT COALESCE(SUM(subtotal), 0) AS total FROM belanja_item WHERE belanja_id = ?');
        $stmt->execute([$belanjaId]);
        $total = (float) ($stmt->fetchColumn() ?: 0);
        $upd = $this->db->prepare('UPDATE belanja SET total = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?');
        $upd->execute([$total, $belanjaId]);
        RekeningHelper::syncAlokasiToTotal($this->db, $belanjaId);
    }

    /** GET /belanja?from=&to=&q=&jenis=&kategori= */
    public function index(Request $request, Response $response): Response
    {
        $q = $request->getQueryParams();
        $sql = 'SELECT b.*, u.name AS created_by_name, u.email AS created_by_email,
                       (SELECT COUNT(*) FROM belanja_item bi WHERE bi.belanja_id = b.id) AS item_count
                FROM belanja b
                LEFT JOIN users u ON u.id = b.created_by
                WHERE 1=1';
        $params = [];

        $jenis = $this->normalizeJenis($q['jenis'] ?? null);
        if ($jenis !== null) {
            $sql .= ' AND b.jenis = ?';
            $params[] = $jenis;
        }
        if (!empty($q['from'])) {
            $sql .= ' AND b.tanggal >= ?';
            $params[] = $q['from'];
        }
        if (!empty($q['to'])) {
            $sql .= ' AND b.tanggal <= ?';
            $params[] = $q['to'];
        }
        if (!empty($q['kategori'])) {
            $sql .= ' AND b.kategori = ?';
            $params[] = $q['kategori'];
        }
        if (!empty($q['q'])) {
            $sql .= ' AND (b.keterangan LIKE ? OR b.kategori LIKE ? OR EXISTS (
                SELECT 1 FROM belanja_item bi2 WHERE bi2.belanja_id = b.id AND bi2.nama_barang LIKE ?
            ))';
            $like = '%' . $q['q'] . '%';
            $params[] = $like;
            $params[] = $like;
            $params[] = $like;
        }

        $sql .= ' ORDER BY b.tanggal DESC, b.id DESC LIMIT 200';
        $stmt = $this->db->prepare($sql);
        $stmt->execute($params);
        $raw = $stmt->fetchAll();
        $grouped = RekeningHelper::listAlokasiMany($this->db, array_column($raw, 'id'));
        $rows = [];
        foreach ($raw as $row) {
            $alokasi = $grouped[(int) $row['id']] ?? [];
            $row['alokasi'] = $alokasi;
            $row['alokasi_label'] = RekeningHelper::alokasiLabel($alokasi);
            $rows[] = $row;
        }

        return $this->json($response, [
            'success' => true,
            'data' => $rows,
        ]);
    }

    /**
     * GET /belanja/item-options?jenis=
     */
    public function itemOptions(Request $request, Response $response): Response
    {
        $jenis = $this->normalizeJenis($request->getQueryParams()['jenis'] ?? null);
        $jenisSql = $jenis ? ' AND b.jenis = ' . $this->db->quote($jenis) : '';

        $namaStmt = $this->db->query(
            "SELECT bi.nama_barang AS nama, bi.satuan, bi.harga_satuan
             FROM belanja_item bi
             INNER JOIN belanja b ON b.id = bi.belanja_id
             INNER JOIN (
                 SELECT LOWER(TRIM(bi2.nama_barang)) AS k, MAX(bi2.id) AS max_id
                 FROM belanja_item bi2
                 INNER JOIN belanja b2 ON b2.id = bi2.belanja_id
                 WHERE TRIM(bi2.nama_barang) <> ''
                 GROUP BY LOWER(TRIM(bi2.nama_barang))
             ) t ON t.max_id = bi.id
             WHERE TRIM(bi.nama_barang) <> '' $jenisSql
             ORDER BY bi.nama_barang ASC
             LIMIT 800"
        );
        $namaRows = $namaStmt ? $namaStmt->fetchAll() : [];

        $satuanStmt = $this->db->query(
            "SELECT TRIM(bi.satuan) AS satuan, COUNT(*) AS c
             FROM belanja_item bi
             INNER JOIN belanja b ON b.id = bi.belanja_id
             WHERE TRIM(bi.satuan) <> '' $jenisSql
             GROUP BY LOWER(TRIM(bi.satuan)), TRIM(bi.satuan)
             ORDER BY c DESC, satuan ASC
             LIMIT 100"
        );
        $satuanRows = $satuanStmt ? $satuanStmt->fetchAll() : [];

        $defaults = ['pcs', 'kg', 'gram', 'liter', 'ikat', 'bungkus', 'pack', 'dus', 'buah'];
        $satuan = [];
        $seen = [];
        foreach ($satuanRows as $row) {
            $s = trim((string) ($row['satuan'] ?? ''));
            if ($s === '') {
                continue;
            }
            $key = strtolower($s);
            if (isset($seen[$key])) {
                continue;
            }
            $seen[$key] = true;
            $satuan[] = $s;
        }
        foreach ($defaults as $d) {
            $key = strtolower($d);
            if (!isset($seen[$key])) {
                $seen[$key] = true;
                $satuan[] = $d;
            }
        }

        $namaBarang = array_map(static function ($r) {
            return [
                'nama' => (string) $r['nama'],
                'satuan' => trim((string) ($r['satuan'] ?? '')) ?: 'pcs',
                'harga_satuan' => (float) ($r['harga_satuan'] ?? 0),
            ];
        }, $namaRows);

        return $this->json($response, [
            'success' => true,
            'data' => [
                'nama_barang' => $namaBarang,
                'satuan' => $satuan,
            ],
        ]);
    }

    /** GET /belanja/{id} */
    public function show(Request $request, Response $response, array $args): Response
    {
        $id = (int) ($args['id'] ?? 0);
        $stmt = $this->db->prepare(
            'SELECT b.*, u.name AS created_by_name, u.email AS created_by_email
             FROM belanja b
             LEFT JOIN users u ON u.id = b.created_by
             WHERE b.id = ? LIMIT 1'
        );
        $stmt->execute([$id]);
        $row = $stmt->fetch();
        if (!$row) {
            return $this->json($response, ['success' => false, 'message' => 'Catatan tidak ditemukan'], 404);
        }

        $items = $this->db->prepare('SELECT * FROM belanja_item WHERE belanja_id = ? ORDER BY id ASC');
        $items->execute([$id]);

        $alokasi = RekeningHelper::listAlokasi($this->db, $id);
        $row['alokasi'] = $alokasi;
        $row['alokasi_label'] = RekeningHelper::alokasiLabel($alokasi);

        return $this->json($response, [
            'success' => true,
            'data' => [
                'belanja' => $row,
                'items' => $items->fetchAll(),
                'alokasi' => $alokasi,
            ],
        ]);
    }

    /** POST /belanja */
    public function create(Request $request, Response $response): Response
    {
        $user = $request->getAttribute('user');
        if (!AuthHelper::canManageData($user['role'] ?? null)) {
            return $this->json($response, ['success' => false, 'message' => 'Hanya admin yang dapat menambah catatan'], 403);
        }
        $body = $this->parseBody($request);
        $tanggal = trim((string) ($body['tanggal'] ?? ''));
        $keterangan = trim((string) ($body['keterangan'] ?? ''));
        $kategori = trim((string) ($body['kategori'] ?? ''));
        $jenis = $this->normalizeJenis($body['jenis'] ?? 'keluar') ?? 'keluar';
        $items = $body['items'] ?? [];

        if ($tanggal === '' || !preg_match('/^\d{4}-\d{2}-\d{2}$/', $tanggal)) {
            return $this->json($response, ['success' => false, 'message' => 'Tanggal wajib diisi (YYYY-MM-DD)'], 422);
        }

        try {
            $this->db->beginTransaction();

            if ($kategori !== '') {
                KategoriController::ensureKategori($this->db, $kategori, $jenis);
            }

            $ins = $this->db->prepare(
                'INSERT INTO belanja (tanggal, jenis, keterangan, kategori, total, created_by)
                 VALUES (?, ?, ?, ?, 0, ?)'
            );
            $ins->execute([
                $tanggal,
                $jenis,
                $keterangan !== '' ? $keterangan : null,
                $kategori !== '' ? $kategori : null,
                $user['id'] ?? null,
            ]);
            $belanjaId = (int) $this->db->lastInsertId();

            if (is_array($items)) {
                foreach ($items as $item) {
                    $this->insertItem($belanjaId, is_array($item) ? $item : []);
                }
            }

            $this->recalcTotal($belanjaId);
            $totalStmt = $this->db->prepare('SELECT total FROM belanja WHERE id = ?');
            $totalStmt->execute([$belanjaId]);
            $total = (float) $totalStmt->fetchColumn();
            $alokasiInput = is_array($body['alokasi'] ?? null) ? $body['alokasi'] : [];
            RekeningHelper::saveAlokasi($this->db, $belanjaId, $alokasiInput, $total);
            $this->db->commit();
        } catch (\InvalidArgumentException $e) {
            if ($this->db->inTransaction()) {
                $this->db->rollBack();
            }
            return $this->json($response, ['success' => false, 'message' => $e->getMessage()], 422);
        } catch (\Throwable $e) {
            if ($this->db->inTransaction()) {
                $this->db->rollBack();
            }
            return $this->json($response, ['success' => false, 'message' => $e->getMessage()], 500);
        }

        return $this->show($request, $response, ['id' => $belanjaId]);
    }

    /** PUT /belanja/{id} */
    public function update(Request $request, Response $response, array $args): Response
    {
        $actor = $request->getAttribute('user');
        if (!AuthHelper::canManageData($actor['role'] ?? null)) {
            return $this->json($response, ['success' => false, 'message' => 'Hanya admin yang dapat mengubah catatan'], 403);
        }

        $id = (int) ($args['id'] ?? 0);
        $body = $this->parseBody($request);

        $row = $this->findBelanja($id);
        if (!$row) {
            return $this->json($response, ['success' => false, 'message' => 'Catatan tidak ditemukan'], 404);
        }

        $fields = [];
        $params = [];
        $jenis = $this->normalizeJenis($body['jenis'] ?? $row['jenis']) ?? $row['jenis'];

        if (isset($body['tanggal'])) {
            $tanggal = trim((string) $body['tanggal']);
            if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $tanggal)) {
                return $this->json($response, ['success' => false, 'message' => 'Format tanggal tidak valid'], 422);
            }
            $fields[] = 'tanggal = ?';
            $params[] = $tanggal;
        }
        if (array_key_exists('jenis', $body) && $this->normalizeJenis($body['jenis'])) {
            $fields[] = 'jenis = ?';
            $params[] = $jenis;
        }
        if (array_key_exists('keterangan', $body)) {
            $ket = trim((string) $body['keterangan']);
            $fields[] = 'keterangan = ?';
            $params[] = $ket !== '' ? $ket : null;
        }
        if (array_key_exists('kategori', $body)) {
            $kategori = trim((string) $body['kategori']);
            if ($kategori !== '') {
                KategoriController::ensureKategori($this->db, $kategori, $jenis);
            }
            $fields[] = 'kategori = ?';
            $params[] = $kategori !== '' ? $kategori : null;
        }

        if ($fields) {
            $fields[] = 'updated_at = CURRENT_TIMESTAMP';
            $params[] = $id;
            $sql = 'UPDATE belanja SET ' . implode(', ', $fields) . ' WHERE id = ?';
            $this->db->prepare($sql)->execute($params);
        }

        if (array_key_exists('alokasi', $body) && is_array($body['alokasi'])) {
            $total = (float) ($this->findBelanja($id)['total'] ?? 0);
            try {
                RekeningHelper::saveAlokasi($this->db, $id, $body['alokasi'], $total);
            } catch (\InvalidArgumentException $e) {
                return $this->json($response, ['success' => false, 'message' => $e->getMessage()], 422);
            }
        }

        return $this->show($request, $response, ['id' => $id]);
    }

    /** DELETE /belanja/{id} */
    public function delete(Request $request, Response $response, array $args): Response
    {
        $user = $request->getAttribute('user');
        if (!AuthHelper::canManageData($user['role'] ?? null)) {
            return $this->json($response, ['success' => false, 'message' => 'Hanya admin yang dapat menghapus'], 403);
        }

        $id = (int) ($args['id'] ?? 0);
        $row = $this->findBelanja($id);
        if (!$row) {
            return $this->json($response, ['success' => false, 'message' => 'Catatan tidak ditemukan'], 404);
        }

        $stmt = $this->db->prepare('DELETE FROM belanja WHERE id = ?');
        $stmt->execute([$id]);

        return $this->json($response, ['success' => true, 'message' => 'Berhasil dihapus']);
    }

    /** POST /belanja/{id}/items */
    public function addItem(Request $request, Response $response, array $args): Response
    {
        $actor = $request->getAttribute('user');
        if (!AuthHelper::canManageData($actor['role'] ?? null)) {
            return $this->json($response, ['success' => false, 'message' => 'Hanya admin yang dapat menambah item'], 403);
        }

        $belanjaId = (int) ($args['id'] ?? 0);
        if (!$this->findBelanja($belanjaId)) {
            return $this->json($response, ['success' => false, 'message' => 'Catatan tidak ditemukan'], 404);
        }

        try {
            $itemId = $this->insertItem($belanjaId, $this->parseBody($request));
            $this->recalcTotal($belanjaId);
        } catch (\InvalidArgumentException $e) {
            return $this->json($response, ['success' => false, 'message' => $e->getMessage()], 422);
        }

        $item = $this->db->prepare('SELECT * FROM belanja_item WHERE id = ?');
        $item->execute([$itemId]);

        return $this->json($response, [
            'success' => true,
            'data' => $item->fetch(),
        ], 201);
    }

    /** PUT /belanja/{id}/items/{itemId} */
    public function updateItem(Request $request, Response $response, array $args): Response
    {
        $actor = $request->getAttribute('user');
        if (!AuthHelper::canManageData($actor['role'] ?? null)) {
            return $this->json($response, ['success' => false, 'message' => 'Hanya admin yang dapat mengubah item'], 403);
        }

        $belanjaId = (int) ($args['id'] ?? 0);
        $itemId = (int) ($args['itemId'] ?? 0);
        if (!$this->findBelanja($belanjaId)) {
            return $this->json($response, ['success' => false, 'message' => 'Catatan tidak ditemukan'], 404);
        }

        $body = $this->parseBody($request);

        $stmt = $this->db->prepare('SELECT * FROM belanja_item WHERE id = ? AND belanja_id = ?');
        $stmt->execute([$itemId, $belanjaId]);
        $existing = $stmt->fetch();
        if (!$existing) {
            return $this->json($response, ['success' => false, 'message' => 'Item tidak ditemukan'], 404);
        }

        $nama = trim((string) ($body['nama_barang'] ?? $existing['nama_barang']));
        $qty = (float) ($body['qty'] ?? $existing['qty']);
        $satuan = trim((string) ($body['satuan'] ?? $existing['satuan']));
        $harga = (float) ($body['harga_satuan'] ?? $existing['harga_satuan']);
        $catatan = array_key_exists('catatan', $body)
            ? trim((string) $body['catatan'])
            : ($existing['catatan'] ?? '');

        if ($nama === '') {
            return $this->json($response, ['success' => false, 'message' => 'Nama barang wajib diisi'], 422);
        }
        if ($qty <= 0) {
            return $this->json($response, ['success' => false, 'message' => 'Qty harus lebih dari 0'], 422);
        }

        $subtotal = round($qty * $harga, 2);
        $upd = $this->db->prepare(
            'UPDATE belanja_item SET nama_barang = ?, qty = ?, satuan = ?, harga_satuan = ?, subtotal = ?, catatan = ? WHERE id = ?'
        );
        $upd->execute([
            $nama,
            $qty,
            $satuan !== '' ? $satuan : 'pcs',
            $harga,
            $subtotal,
            $catatan !== '' ? $catatan : null,
            $itemId,
        ]);

        $this->recalcTotal($belanjaId);

        $item = $this->db->prepare('SELECT * FROM belanja_item WHERE id = ?');
        $item->execute([$itemId]);

        return $this->json($response, [
            'success' => true,
            'data' => $item->fetch(),
        ]);
    }

    /** DELETE /belanja/{id}/items/{itemId} */
    public function deleteItem(Request $request, Response $response, array $args): Response
    {
        $actor = $request->getAttribute('user');
        if (!AuthHelper::canManageData($actor['role'] ?? null)) {
            return $this->json($response, ['success' => false, 'message' => 'Hanya admin yang dapat menghapus item'], 403);
        }

        $belanjaId = (int) ($args['id'] ?? 0);
        $itemId = (int) ($args['itemId'] ?? 0);
        if (!$this->findBelanja($belanjaId)) {
            return $this->json($response, ['success' => false, 'message' => 'Catatan tidak ditemukan'], 404);
        }

        $stmt = $this->db->prepare('DELETE FROM belanja_item WHERE id = ? AND belanja_id = ?');
        $stmt->execute([$itemId, $belanjaId]);
        if ($stmt->rowCount() === 0) {
            return $this->json($response, ['success' => false, 'message' => 'Item tidak ditemukan'], 404);
        }

        $this->recalcTotal($belanjaId);
        return $this->json($response, ['success' => true, 'message' => 'Item dihapus']);
    }

    private function findBelanja(int $id): ?array
    {
        $stmt = $this->db->prepare('SELECT * FROM belanja WHERE id = ? LIMIT 1');
        $stmt->execute([$id]);
        $row = $stmt->fetch();
        return $row ?: null;
    }

    private function insertItem(int $belanjaId, array $item): int
    {
        $nama = trim((string) ($item['nama_barang'] ?? ''));
        $qty = (float) ($item['qty'] ?? 1);
        $satuan = trim((string) ($item['satuan'] ?? 'pcs'));
        $harga = (float) ($item['harga_satuan'] ?? 0);
        $catatan = trim((string) ($item['catatan'] ?? ''));

        if ($nama === '') {
            throw new \InvalidArgumentException('Nama barang wajib diisi');
        }
        if ($qty <= 0) {
            throw new \InvalidArgumentException('Qty harus lebih dari 0');
        }

        $subtotal = round($qty * $harga, 2);
        $ins = $this->db->prepare(
            'INSERT INTO belanja_item (belanja_id, nama_barang, qty, satuan, harga_satuan, subtotal, catatan)
             VALUES (?, ?, ?, ?, ?, ?, ?)'
        );
        $ins->execute([
            $belanjaId,
            $nama,
            $qty,
            $satuan !== '' ? $satuan : 'pcs',
            $harga,
            $subtotal,
            $catatan !== '' ? $catatan : null,
        ]);

        return (int) $this->db->lastInsertId();
    }
}

<?php

namespace App\Controllers;

use App\Config\Database;
use App\Helpers\AuthHelper;
use App\Helpers\CairStatusHelper;
use App\Helpers\SimpleXlsxWriter;
use App\Helpers\TenantHelper;
use App\Helpers\ZipStore;
use App\Services\BniBatchService;
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

    private function recalcTotal(int $belanjaId, int $sppgId): void
    {
        $stmt = $this->db->prepare('SELECT COALESCE(SUM(subtotal), 0) AS total FROM belanja_item WHERE belanja_id = ?');
        $stmt->execute([$belanjaId]);
        $total = (float) ($stmt->fetchColumn() ?: 0);
        $upd = $this->db->prepare('UPDATE belanja SET total = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND sppg_id = ?');
        $upd->execute([$total, $belanjaId, $sppgId]);
    }

    /** GET /belanja?from=&to=&q=&bni_status= */
    public function index(Request $request, Response $response): Response
    {
        $sppgId = TenantHelper::getSppgIdFromRequest($request);
        $q = $request->getQueryParams();
        $sql = 'SELECT b.*, u.name AS created_by_name, u.email AS created_by_email,
                       r.nomor_rekening, r.nama_penerima, r.bank_tujuan, r.online_bank_code, r.jenis AS rekening_jenis,
                       (SELECT COUNT(*) FROM belanja_item bi WHERE bi.belanja_id = b.id) AS item_count
                FROM belanja b
                LEFT JOIN users u ON u.id = b.created_by
                LEFT JOIN rekening r ON r.id = b.rekening_id
                WHERE b.sppg_id = ?';
        $params = [$sppgId];

        if (!empty($q['from'])) {
            $sql .= ' AND b.tanggal >= ?';
            $params[] = $q['from'];
        }
        if (!empty($q['to'])) {
            $sql .= ' AND b.tanggal <= ?';
            $params[] = $q['to'];
        }
        if (!empty($q['rekening_id'])) {
            $sql .= ' AND b.rekening_id = ?';
            $params[] = (int) $q['rekening_id'];
        }
        if (!empty($q['kategori'])) {
            $sql .= ' AND b.kategori = ?';
            $params[] = $q['kategori'];
        }
        if (!empty($q['bni_status']) && in_array($q['bni_status'], ['belum', 'maker', 'approved'], true)) {
            $sql .= ' AND b.bni_status = ?';
            $params[] = $q['bni_status'];
        }
        if (!empty($q['cair_status']) && in_array($q['cair_status'], ['jatim', 'cair'], true)) {
            $sql .= ' AND b.cair_status = ?';
            $params[] = $q['cair_status'];
        }
        if (!empty($q['q'])) {
            $sql .= ' AND (b.keterangan LIKE ? OR b.kategori LIKE ? OR r.nama_penerima LIKE ? OR EXISTS (
                SELECT 1 FROM belanja_item bi2 WHERE bi2.belanja_id = b.id AND bi2.nama_barang LIKE ?
            ))';
            $like = '%' . $q['q'] . '%';
            $params[] = $like;
            $params[] = $like;
            $params[] = $like;
            $params[] = $like;
        }

        $sql .= ' ORDER BY b.tanggal DESC, b.id DESC LIMIT 200';
        $stmt = $this->db->prepare($sql);
        $stmt->execute($params);

        return $this->json($response, [
            'success' => true,
            'data' => $stmt->fetchAll(),
        ]);
    }

    /**
     * GET /belanja/item-options
     * Saran nama barang (+ satuan & harga terakhir) dan satuan dari riwayat.
     */
    public function itemOptions(Request $request, Response $response): Response
    {
        $sppgId = TenantHelper::getSppgIdFromRequest($request);
        $namaStmt = $this->db->prepare(
            'SELECT bi.nama_barang AS nama, bi.satuan, bi.harga_satuan
             FROM belanja_item bi
             INNER JOIN belanja b ON b.id = bi.belanja_id
             INNER JOIN (
                 SELECT LOWER(TRIM(bi2.nama_barang)) AS k, MAX(bi2.id) AS max_id
                 FROM belanja_item bi2
                 INNER JOIN belanja b2 ON b2.id = bi2.belanja_id
                 WHERE TRIM(bi2.nama_barang) <> \'\' AND b2.sppg_id = ?
                 GROUP BY LOWER(TRIM(bi2.nama_barang))
             ) t ON t.max_id = bi.id
             WHERE b.sppg_id = ?
             ORDER BY bi.nama_barang ASC
             LIMIT 800'
        );
        $namaStmt->execute([$sppgId, $sppgId]);
        $namaRows = $namaStmt->fetchAll();

        $satuanStmt = $this->db->prepare(
            'SELECT TRIM(bi.satuan) AS satuan, COUNT(*) AS c
             FROM belanja_item bi
             INNER JOIN belanja b ON b.id = bi.belanja_id
             WHERE TRIM(bi.satuan) <> \'\' AND b.sppg_id = ?
             GROUP BY LOWER(TRIM(bi.satuan)), TRIM(bi.satuan)
             ORDER BY c DESC, satuan ASC
             LIMIT 100'
        );
        $satuanStmt->execute([$sppgId]);
        $satuanRows = $satuanStmt->fetchAll();

        $defaults = ['pcs', 'kg', 'gram', 'liter', 'ikat', 'bungkus', 'pack', 'dus', 'karung', 'buah'];
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
        $sppgId = TenantHelper::getSppgIdFromRequest($request);
        $id = (int) ($args['id'] ?? 0);
        $stmt = $this->db->prepare(
            'SELECT b.*, u.name AS created_by_name, u.email AS created_by_email,
                    r.nomor_rekening, r.nama_penerima, r.bank_tujuan, r.online_bank_code, r.jenis AS rekening_jenis
             FROM belanja b
             LEFT JOIN users u ON u.id = b.created_by
             LEFT JOIN rekening r ON r.id = b.rekening_id
             WHERE b.id = ? AND b.sppg_id = ? LIMIT 1'
        );
        $stmt->execute([$id, $sppgId]);
        $row = $stmt->fetch();
        if (!$row) {
            return $this->json($response, ['success' => false, 'message' => 'Catatan belanja tidak ditemukan'], 404);
        }

        $items = $this->db->prepare('SELECT * FROM belanja_item WHERE belanja_id = ? ORDER BY id ASC');
        $items->execute([$id]);

        return $this->json($response, [
            'success' => true,
            'data' => [
                'belanja' => $row,
                'items' => $items->fetchAll(),
            ],
        ]);
    }

    /** POST /belanja */
    public function create(Request $request, Response $response): Response
    {
        $user = $request->getAttribute('user');
        $sppgId = TenantHelper::getSppgIdFromRequest($request);
        if (!AuthHelper::canManageData($user['role'] ?? null)) {
            return $this->json($response, ['success' => false, 'message' => 'Hanya admin yang dapat menambah belanja'], 403);
        }
        $body = $this->parseBody($request);
        $tanggal = trim((string) ($body['tanggal'] ?? ''));
        $keterangan = trim((string) ($body['keterangan'] ?? ''));
        $kategori = trim((string) ($body['kategori'] ?? ''));
        $rekeningId = isset($body['rekening_id']) && $body['rekening_id'] !== '' && $body['rekening_id'] !== null
            ? (int) $body['rekening_id']
            : null;
        $items = $body['items'] ?? [];

        if ($tanggal === '' || !preg_match('/^\d{4}-\d{2}-\d{2}$/', $tanggal)) {
            return $this->json($response, ['success' => false, 'message' => 'Tanggal wajib diisi (YYYY-MM-DD)'], 422);
        }

        if ($rekeningId !== null && !$this->validateRekening($rekeningId, $sppgId)) {
            return $this->json($response, ['success' => false, 'message' => 'Rekening tidak ditemukan'], 422);
        }

        try {
            $this->db->beginTransaction();

            if ($kategori !== '') {
                KategoriController::ensureKategori($this->db, $sppgId, $kategori);
            }

            $ins = $this->db->prepare(
                'INSERT INTO belanja (sppg_id, tanggal, keterangan, rekening_id, kategori, bni_status, total, created_by)
                 VALUES (?, ?, ?, ?, ?, \'belum\', 0, ?)'
            );
            $ins->execute([
                $sppgId,
                $tanggal,
                $keterangan !== '' ? $keterangan : null,
                $rekeningId,
                $kategori !== '' ? $kategori : null,
                $user['id'] ?? null,
            ]);
            $belanjaId = (int) $this->db->lastInsertId();

            if (is_array($items)) {
                foreach ($items as $item) {
                    $this->insertItem($belanjaId, is_array($item) ? $item : []);
                }
            }

            $this->recalcTotal($belanjaId, $sppgId);
            $this->db->commit();
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
        $sppgId = TenantHelper::getSppgIdFromRequest($request);
        $role = $actor['role'] ?? null;
        if (!AuthHelper::canManageData($role)) {
            return $this->json($response, ['success' => false, 'message' => 'Hanya admin yang dapat mengubah belanja'], 403);
        }

        $id = (int) ($args['id'] ?? 0);
        $body = $this->parseBody($request);

        $row = $this->findBelanja($id, $sppgId);
        if (!$row) {
            return $this->json($response, ['success' => false, 'message' => 'Catatan belanja tidak ditemukan'], 404);
        }

        $status = (string) ($row['bni_status'] ?? 'belum');
        $locked = AuthHelper::isBniLocked($status);

        if ($locked && !AuthHelper::isSuperAdminRole($role)) {
            return $this->json($response, [
                'success' => false,
                'message' => 'Catatan status ' . $status . ' terkunci dan tidak dapat diubah',
            ], 403);
        }

        $fields = [];
        $params = [];

        if ($locked && AuthHelper::isSuperAdminRole($role)) {
            // Super admin pada maker/approved: hanya keterangan & kategori
            if (array_key_exists('keterangan', $body)) {
                $ket = trim((string) $body['keterangan']);
                $fields[] = 'keterangan = ?';
                $params[] = $ket !== '' ? $ket : null;
            }
            if (array_key_exists('kategori', $body)) {
                $kategori = trim((string) $body['kategori']);
                if ($kategori !== '') {
                    KategoriController::ensureKategori($this->db, $sppgId, $kategori);
                }
                $fields[] = 'kategori = ?';
                $params[] = $kategori !== '' ? $kategori : null;
            }
            $forbidden = array_filter(['tanggal', 'rekening_id'], static fn ($k) => array_key_exists($k, $body));
            if ($forbidden && !$fields) {
                return $this->json($response, [
                    'success' => false,
                    'message' => 'Pada status terkunci, super admin hanya boleh ubah keterangan dan kategori',
                ], 403);
            }
            if ($forbidden) {
                // abaikan field terlarang, lanjut simpan yang diizinkan
            }
        } else {
            if (isset($body['tanggal'])) {
                $tanggal = trim((string) $body['tanggal']);
                if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $tanggal)) {
                    return $this->json($response, ['success' => false, 'message' => 'Format tanggal tidak valid'], 422);
                }
                $fields[] = 'tanggal = ?';
                $params[] = $tanggal;
            }
            if (array_key_exists('keterangan', $body)) {
                $ket = trim((string) $body['keterangan']);
                $fields[] = 'keterangan = ?';
                $params[] = $ket !== '' ? $ket : null;
            }
            if (array_key_exists('rekening_id', $body)) {
                $rekeningId = $body['rekening_id'] !== '' && $body['rekening_id'] !== null
                    ? (int) $body['rekening_id']
                    : null;
                if ($rekeningId !== null && !$this->validateRekening($rekeningId, $sppgId)) {
                    return $this->json($response, ['success' => false, 'message' => 'Rekening tidak ditemukan'], 422);
                }
                $fields[] = 'rekening_id = ?';
                $params[] = $rekeningId;
            }
            if (array_key_exists('kategori', $body)) {
                $kategori = trim((string) $body['kategori']);
                if ($kategori !== '') {
                    KategoriController::ensureKategori($this->db, $sppgId, $kategori);
                }
                $fields[] = 'kategori = ?';
                $params[] = $kategori !== '' ? $kategori : null;
            }
        }

        if ($fields) {
            $fields[] = 'updated_at = CURRENT_TIMESTAMP';
            $params[] = $id;
            $params[] = $sppgId;
            $sql = 'UPDATE belanja SET ' . implode(', ', $fields) . ' WHERE id = ? AND sppg_id = ?';
            $this->db->prepare($sql)->execute($params);
        }

        return $this->show($request, $response, ['id' => $id]);
    }

    /** DELETE /belanja/{id} */
    public function delete(Request $request, Response $response, array $args): Response
    {
        $user = $request->getAttribute('user');
        $sppgId = TenantHelper::getSppgIdFromRequest($request);
        $role = $user['role'] ?? null;
        if (!AuthHelper::canManageData($role)) {
            return $this->json($response, ['success' => false, 'message' => 'Hanya admin yang dapat menghapus'], 403);
        }

        $id = (int) ($args['id'] ?? 0);
        $row = $this->findBelanja($id, $sppgId);
        if (!$row) {
            return $this->json($response, ['success' => false, 'message' => 'Catatan belanja tidak ditemukan'], 404);
        }

        $status = (string) ($row['bni_status'] ?? 'belum');
        if (AuthHelper::isBniLocked($status) && !AuthHelper::isSuperAdminRole($role)) {
            return $this->json($response, [
                'success' => false,
                'message' => 'Catatan status ' . $status . ' tidak dapat dihapus (kecuali super admin)',
            ], 403);
        }

        $stmt = $this->db->prepare('DELETE FROM belanja WHERE id = ? AND sppg_id = ?');
        $stmt->execute([$id, $sppgId]);

        return $this->json($response, ['success' => true, 'message' => 'Berhasil dihapus']);
    }

    /** POST /belanja/{id}/items */
    public function addItem(Request $request, Response $response, array $args): Response
    {
        $actor = $request->getAttribute('user');
        $sppgId = TenantHelper::getSppgIdFromRequest($request);
        if (!AuthHelper::canManageData($actor['role'] ?? null)) {
            return $this->json($response, ['success' => false, 'message' => 'Hanya admin yang dapat menambah item'], 403);
        }

        $belanjaId = (int) ($args['id'] ?? 0);
        if ($denied = $this->denyIfItemsLocked($belanjaId, $sppgId, $response)) {
            return $denied;
        }

        try {
            $itemId = $this->insertItem($belanjaId, $this->parseBody($request));
            $this->recalcTotal($belanjaId, $sppgId);
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
        $sppgId = TenantHelper::getSppgIdFromRequest($request);
        if (!AuthHelper::canManageData($actor['role'] ?? null)) {
            return $this->json($response, ['success' => false, 'message' => 'Hanya admin yang dapat mengubah item'], 403);
        }

        $belanjaId = (int) ($args['id'] ?? 0);
        $itemId = (int) ($args['itemId'] ?? 0);
        if ($denied = $this->denyIfItemsLocked($belanjaId, $sppgId, $response)) {
            return $denied;
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

        $this->recalcTotal($belanjaId, $sppgId);

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
        $sppgId = TenantHelper::getSppgIdFromRequest($request);
        if (!AuthHelper::canManageData($actor['role'] ?? null)) {
            return $this->json($response, ['success' => false, 'message' => 'Hanya admin yang dapat menghapus item'], 403);
        }

        $belanjaId = (int) ($args['id'] ?? 0);
        $itemId = (int) ($args['itemId'] ?? 0);
        if ($denied = $this->denyIfItemsLocked($belanjaId, $sppgId, $response)) {
            return $denied;
        }

        $stmt = $this->db->prepare('DELETE FROM belanja_item WHERE id = ? AND belanja_id = ?');
        $stmt->execute([$itemId, $belanjaId]);
        if ($stmt->rowCount() === 0) {
            return $this->json($response, ['success' => false, 'message' => 'Item tidak ditemukan'], 404);
        }

        $this->recalcTotal($belanjaId, $sppgId);
        return $this->json($response, ['success' => true, 'message' => 'Item dihapus']);
    }

    /**
     * PATCH /belanja/bni-status
     * Body: { ids: number[], status: 'belum'|'maker'|'approved' }
     */
    public function bulkUpdateBniStatus(Request $request, Response $response): Response
    {
        $user = $request->getAttribute('user');
        $sppgId = TenantHelper::getSppgIdFromRequest($request);
        $role = $user['role'] ?? null;
        if (!AuthHelper::canChangeBniStatus($role)) {
            return $this->json($response, [
                'success' => false,
                'message' => 'Role Anda tidak dapat mengubah status BNI (admin biasa tidak diizinkan)',
            ], 403);
        }

        $body = $this->parseBody($request);
        $status = trim((string) ($body['status'] ?? ''));
        if (!in_array($status, ['belum', 'maker', 'approved'], true)) {
            return $this->json($response, [
                'success' => false,
                'message' => 'Status tidak valid. Gunakan: belum, maker, atau approved',
            ], 422);
        }

        $ids = $body['ids'] ?? [];
        if (!is_array($ids) || !$ids) {
            return $this->json($response, ['success' => false, 'message' => 'Pilih minimal satu catatan'], 422);
        }
        $ids = array_values(array_unique(array_filter(array_map('intval', $ids), static fn ($id) => $id > 0)));
        if (!$ids) {
            return $this->json($response, ['success' => false, 'message' => 'ID tidak valid'], 422);
        }
        if (count($ids) > 500) {
            return $this->json($response, ['success' => false, 'message' => 'Maksimal 500 catatan per batch'], 422);
        }

        $placeholders = implode(',', array_fill(0, count($ids), '?'));
        $stmt = $this->db->prepare("SELECT id, bni_status FROM belanja WHERE id IN ($placeholders) AND sppg_id = ?");
        $stmt->execute(array_merge($ids, [$sppgId]));
        $rows = $stmt->fetchAll();
        if (count($rows) !== count($ids)) {
            return $this->json($response, ['success' => false, 'message' => 'Beberapa catatan tidak ditemukan'], 404);
        }

        foreach ($rows as $row) {
            $from = (string) ($row['bni_status'] ?? 'belum');
            $err = AuthHelper::bniStatusTransitionError($role, $from, $status);
            if ($err !== null) {
                return $this->json($response, [
                    'success' => false,
                    'message' => $err . ' (id #' . $row['id'] . ', status sekarang: ' . $from . ')',
                ], 422);
            }
        }

        $params = array_merge([$status], $ids, [$sppgId]);
        $upd = $this->db->prepare(
            "UPDATE belanja SET bni_status = ?, updated_at = CURRENT_TIMESTAMP WHERE id IN ($placeholders) AND sppg_id = ?"
        );
        $upd->execute($params);

        $payload = [
            'updated' => $upd->rowCount(),
            'status' => $status,
        ];
        $message = 'Status diperbarui';

        // Saat Maker: arsipkan CSV Inhouse/Online terpisah (Waiting) untuk auto-approve email BNI
        if ($status === 'maker') {
            try {
                $nama = trim((string) ($body['nama'] ?? 'belanja'));
                $svc = new BniBatchService($this->db);
                $batch = $svc->archiveFromBelanjaIds($ids, $nama, isset($user['id']) ? (int) $user['id'] : null, $sppgId);
                $payload['batch'] = $batch;
                $payload['batches'] = $batch['batches'] ?? [$batch];
                $n = count($payload['batches']);
                $message = $n > 1
                    ? "Status Maker + {$n} CSV (Inhouse/Online) diarsipkan ke Waiting. Unggah masing-masing ke sheet BNI Direct yang sesuai."
                    : 'Status Maker + CSV diarsipkan. Menunggu notifikasi email BNI untuk auto-approve.';
            } catch (\Throwable $e) {
                error_log('bni archive on maker: ' . $e->getMessage());
                $payload['batch_error'] = $e->getMessage();
                $message = 'Status Maker diperbarui, tetapi arsip CSV gagal: ' . $e->getMessage();
            }
        }

        // Saat Approved: VA → jatim, Rek → cair
        if ($status === 'approved') {
            $payload['cair_updated'] = CairStatusHelper::applyAfterApproved($this->db, $ids);
            $message = 'Status Approved. Status Jatim/Cair diset otomatis menurut jenis rekening (VA/Rek).';
        }

        return $this->json($response, [
            'success' => true,
            'message' => $message,
            'data' => $payload,
        ]);
    }

    /**
     * PATCH /belanja/cair-status
     * Body: { ids: number[], status: 'jatim'|'cair' }
     * Hanya super_admin.
     */
    public function bulkUpdateCairStatus(Request $request, Response $response): Response
    {
        $user = $request->getAttribute('user');
        $sppgId = TenantHelper::getSppgIdFromRequest($request);
        $role = $user['role'] ?? null;
        if (!AuthHelper::canChangeCairStatus($role)) {
            return $this->json($response, [
                'success' => false,
                'message' => 'Hanya super admin yang dapat mengubah status Jatim/Cair',
            ], 403);
        }

        $body = $this->parseBody($request);
        $status = trim((string) ($body['status'] ?? ''));
        if (!in_array($status, ['jatim', 'cair'], true)) {
            return $this->json($response, [
                'success' => false,
                'message' => 'Status tidak valid. Gunakan: jatim atau cair',
            ], 422);
        }

        $ids = $body['ids'] ?? [];
        if (!is_array($ids) || !$ids) {
            return $this->json($response, ['success' => false, 'message' => 'Pilih minimal satu catatan'], 422);
        }
        $ids = array_values(array_unique(array_filter(array_map('intval', $ids), static fn ($id) => $id > 0)));
        if (!$ids) {
            return $this->json($response, ['success' => false, 'message' => 'ID tidak valid'], 422);
        }
        if (count($ids) > 500) {
            return $this->json($response, ['success' => false, 'message' => 'Maksimal 500 catatan per batch'], 422);
        }

        $placeholders = implode(',', array_fill(0, count($ids), '?'));
        $stmt = $this->db->prepare("SELECT id FROM belanja WHERE id IN ($placeholders) AND sppg_id = ?");
        $stmt->execute(array_merge($ids, [$sppgId]));
        $found = $stmt->fetchAll(PDO::FETCH_COLUMN);
        if (count($found) !== count($ids)) {
            return $this->json($response, ['success' => false, 'message' => 'Beberapa catatan tidak ditemukan'], 404);
        }

        $params = array_merge([$status], $ids, [$sppgId]);
        $upd = $this->db->prepare(
            "UPDATE belanja SET cair_status = ?, updated_at = CURRENT_TIMESTAMP WHERE id IN ($placeholders) AND sppg_id = ?"
        );
        $upd->execute($params);

        return $this->json($response, [
            'success' => true,
            'message' => 'Status Jatim/Cair diperbarui',
            'data' => ['updated' => $upd->rowCount(), 'status' => $status],
        ]);
    }

    /**
     * GET /belanja/export/bni-online?from=&to=&q=&nama=&ids=
     * CSV BNI Direct: Inhouse (bank BNI) dan/atau Online (bank lain).
     * Rekening debet utama: env BNI_DEBIT_ACCOUNT (default 5268080020354800).
     */
    public function exportBniOnline(Request $request, Response $response): Response
    {
        try {
            $sppgId = TenantHelper::getSppgIdFromRequest($request);
            $q = $request->getQueryParams();
            $rawDebit = trim((string) ($_ENV['BNI_DEBIT_ACCOUNT'] ?? ''));
            if ($rawDebit === '') {
                $rawDebit = '5268080020354800';
            }
            $debit = preg_replace('/\D+/', '', $rawDebit) ?? '';
            if ($debit === '') {
                return $this->json($response, [
                    'success' => false,
                    'message' => 'BNI_DEBIT_ACCOUNT belum dikonfigurasi di api/.env',
                ], 422);
            }

        $sql = 'SELECT b.id, b.tanggal, b.keterangan, b.total,
                       r.nomor_rekening, r.nama_penerima, r.bank_tujuan, r.online_bank_code
                FROM belanja b
                INNER JOIN rekening r ON r.id = b.rekening_id
                WHERE b.sppg_id = ?
                  AND b.rekening_id IS NOT NULL
                  AND r.nomor_rekening IS NOT NULL
                  AND r.nomor_rekening <> \'\'';
        $params = [$sppgId];

        if (!empty($q['from'])) {
            $sql .= ' AND b.tanggal >= ?';
            $params[] = $q['from'];
        }
        if (!empty($q['to'])) {
            $sql .= ' AND b.tanggal <= ?';
            $params[] = $q['to'];
        }
        if (!empty($q['rekening_id'])) {
            $sql .= ' AND b.rekening_id = ?';
            $params[] = (int) $q['rekening_id'];
        }
        if (!empty($q['kategori'])) {
            $sql .= ' AND b.kategori = ?';
            $params[] = $q['kategori'];
        }
        if (!empty($q['bni_status']) && in_array($q['bni_status'], ['belum', 'maker', 'approved'], true)) {
            $sql .= ' AND b.bni_status = ?';
            $params[] = $q['bni_status'];
        }

        $idsParam = trim((string) ($q['ids'] ?? ''));
        if ($idsParam !== '') {
            $ids = array_values(array_unique(array_filter(
                array_map('intval', preg_split('/[,\s]+/', $idsParam) ?: []),
                static fn ($id) => $id > 0
            )));
            if (!$ids) {
                return $this->json($response, [
                    'success' => false,
                    'message' => 'Daftar ID ekspor tidak valid',
                ], 422);
            }
            $placeholders = implode(',', array_fill(0, count($ids), '?'));
            $sql .= " AND b.id IN ($placeholders)";
            foreach ($ids as $id) {
                $params[] = $id;
            }
        }

        if (!empty($q['q'])) {
            $sql .= ' AND (b.keterangan LIKE ? OR b.kategori LIKE ? OR r.nama_penerima LIKE ? OR EXISTS (
                SELECT 1 FROM belanja_item bi2 WHERE bi2.belanja_id = b.id AND bi2.nama_barang LIKE ?
            ))';
            $like = '%' . $q['q'] . '%';
            $params[] = $like;
            $params[] = $like;
            $params[] = $like;
            $params[] = $like;
        }

        $sql .= ' ORDER BY b.tanggal ASC, b.id ASC LIMIT 5000';
        $stmt = $this->db->prepare($sql);
        $stmt->execute($params);
        $rows = $stmt->fetchAll();

        if (!$rows) {
            return $this->json($response, [
                'success' => false,
                'message' => 'Tidak ada belanja ber-rekening untuk diekspor (cek filter / rekening).',
            ], 422);
        }

        $namaFile = trim((string) ($q['nama'] ?? ''));
        if ($namaFile === '') {
            $namaFile = 'belanja';
        }
        $namaFile = (string) (preg_replace('/[^\p{L}\p{N}\s\-_]/u', '', $namaFile) ?: 'belanja');
        $namaFile = trim((string) (preg_replace('/\s+/', ' ', $namaFile) ?? $namaFile));
        $stamp = (new \DateTimeImmutable('now'))->format('Ymd_His');

        $svc = new BniBatchService($this->db);
        $builtList = $svc->buildCsvFiles($rows, $namaFile, $debit);
        if (!$builtList) {
            return $this->json($response, [
                'success' => false,
                'message' => 'Tidak ada baris dengan nominal > 0 untuk diekspor.',
            ], 422);
        }

        try {
            $user = $request->getAttribute('user');
            $svc->archiveBuiltCsvList($builtList, isset($user['id']) ? (int) $user['id'] : null, $sppgId);
        } catch (\Throwable $e) {
            error_log('bni csv archive on export: ' . $e->getMessage());
        }

        if (count($builtList) === 1) {
            $one = $builtList[0];
            $response->getBody()->write($one['body']);
            return $response
                ->withHeader('Content-Type', 'text/csv; charset=UTF-8')
                ->withHeader('Content-Disposition', 'attachment; filename="' . $one['csv_filename'] . '"')
                ->withHeader('Cache-Control', 'no-store')
                ->withStatus(200);
        }

        $zipFiles = [];
        foreach ($builtList as $one) {
            $zipFiles[$one['csv_filename']] = $one['body'];
        }
        $zipName = sprintf('%s_BNI_%s.zip', preg_replace('/\s+/', '_', $namaFile) ?: 'belanja', $stamp);
        $response->getBody()->write(ZipStore::make($zipFiles));
        return $response
            ->withHeader('Content-Type', 'application/zip')
            ->withHeader('Content-Disposition', 'attachment; filename="' . $zipName . '"')
            ->withHeader('Cache-Control', 'no-store')
            ->withStatus(200);
        } catch (\Throwable $e) {
            error_log('exportBniOnline: ' . $e->getMessage() . ' @ ' . $e->getFile() . ':' . $e->getLine());
            return $this->json($response, [
                'success' => false,
                'message' => 'Gagal membuat ekspor BNI: ' . $e->getMessage(),
            ], 500);
        }
    }

    /**
     * GET /belanja/export/maker-xlsx?from=&to=&q=&nama=&ids=
     * Excel layout template MAKER OPERASIONAL (No, Nama, Harga, Keterangan, Total).
     */
    public function exportMakerXlsx(Request $request, Response $response): Response
    {
        $sppgId = TenantHelper::getSppgIdFromRequest($request);
        $q = $request->getQueryParams();

        $sql = 'SELECT b.id, b.tanggal, b.keterangan, b.kategori, b.total, b.rekening_id,
                       r.nama_penerima, r.nomor_rekening, r.bank_tujuan
                FROM belanja b
                LEFT JOIN rekening r ON r.id = b.rekening_id
                WHERE b.sppg_id = ?';
        $params = [$sppgId];

        if (!empty($q['from'])) {
            $sql .= ' AND b.tanggal >= ?';
            $params[] = $q['from'];
        }
        if (!empty($q['to'])) {
            $sql .= ' AND b.tanggal <= ?';
            $params[] = $q['to'];
        }
        if (!empty($q['rekening_id'])) {
            $sql .= ' AND b.rekening_id = ?';
            $params[] = (int) $q['rekening_id'];
        }
        if (!empty($q['kategori'])) {
            $sql .= ' AND b.kategori = ?';
            $params[] = $q['kategori'];
        }
        if (!empty($q['bni_status']) && in_array($q['bni_status'], ['belum', 'maker', 'approved'], true)) {
            $sql .= ' AND b.bni_status = ?';
            $params[] = $q['bni_status'];
        }

        $idsParam = trim((string) ($q['ids'] ?? ''));
        if ($idsParam !== '') {
            $ids = array_values(array_unique(array_filter(
                array_map('intval', preg_split('/[,\s]+/', $idsParam) ?: []),
                static fn ($id) => $id > 0
            )));
            if (!$ids) {
                return $this->json($response, [
                    'success' => false,
                    'message' => 'Daftar ID ekspor tidak valid',
                ], 422);
            }
            $placeholders = implode(',', array_fill(0, count($ids), '?'));
            $sql .= " AND b.id IN ($placeholders)";
            foreach ($ids as $id) {
                $params[] = $id;
            }
        }

        if (!empty($q['q'])) {
            $sql .= ' AND (b.keterangan LIKE ? OR b.kategori LIKE ? OR r.nama_penerima LIKE ? OR EXISTS (
                SELECT 1 FROM belanja_item bi2 WHERE bi2.belanja_id = b.id AND bi2.nama_barang LIKE ?
            ))';
            $like = '%' . $q['q'] . '%';
            $params[] = $like;
            $params[] = $like;
            $params[] = $like;
            $params[] = $like;
        }

        // Urut tanggal dulu (satu hari = satu sheet), lalu rekening
        $sql .= ' ORDER BY
                    b.tanggal ASC,
                    (b.rekening_id IS NULL) ASC,
                    r.nama_penerima ASC,
                    r.nomor_rekening ASC,
                    b.id ASC
                  LIMIT 5000';
        $stmt = $this->db->prepare($sql);
        $stmt->execute($params);
        $rows = $stmt->fetchAll();

        if (!$rows) {
            return $this->json($response, [
                'success' => false,
                'message' => 'Tidak ada catatan belanja untuk diekspor.',
            ], 422);
        }

        $belanjaIds = array_map(static fn ($r) => (int) $r['id'], $rows);
        $itemsByBelanja = $this->itemsByBelanjaIds($belanjaIds);

        /** @var array<string, list<array>> $rowsByDay */
        $rowsByDay = [];
        foreach ($rows as $row) {
            $day = (string) ($row['tanggal'] ?? '');
            if ($day === '') {
                $day = 'tanpa-tanggal';
            }
            $rowsByDay[$day][] = $row;
        }

        $namaFile = trim((string) ($q['nama'] ?? ''));
        if ($namaFile === '') {
            $namaFile = 'MAKER OPERASIONAL';
        }
        $namaFile = preg_replace('/[^\p{L}\p{N}\s\-_]/u', '', $namaFile) ?: 'MAKER OPERASIONAL';
        $namaFile = trim(preg_replace('/\s+/', ' ', $namaFile));

        $baseTitle = preg_match('/^PENGAJUAN\b/iu', $namaFile)
            ? $namaFile
            : 'PENGAJUAN ' . $namaFile;

        $sheets = [];
        $hasItem = false;
        foreach ($rowsByDay as $day => $dayRows) {
            /** @var array<string, array{label:string, penerima:string, items:list<array>}> $groups */
            $groups = [];
            foreach ($dayRows as $row) {
                $rid = $row['rekening_id'] !== null ? (int) $row['rekening_id'] : 0;
                $penerima = trim((string) ($row['nama_penerima'] ?? ''));
                $norek = trim((string) ($row['nomor_rekening'] ?? ''));
                $bank = trim((string) ($row['bank_tujuan'] ?? ''));
                $key = $rid > 0 ? ('r' . $rid) : 'none';

                if (!isset($groups[$key])) {
                    $parts = array_values(array_filter([$penerima, $norek, $bank], static fn ($p) => $p !== ''));
                    $groups[$key] = [
                        'label' => $parts ? implode(' · ', $parts) : 'Tanpa rekening',
                        'penerima' => $penerima !== '' ? $penerima : 'Tanpa rekening',
                        'items' => [],
                    ];
                }

                $bid = (int) $row['id'];
                $items = $itemsByBelanja[$bid] ?? [];
                $belanjaKet = trim((string) ($row['keterangan'] ?? ''));
                $kategori = trim((string) ($row['kategori'] ?? ''));

                if ($items) {
                    foreach ($items as $it) {
                        $nama = trim((string) ($it['nama_barang'] ?? ''));
                        if ($nama === '') {
                            $nama = 'Item';
                        }
                        $qty = (float) ($it['qty'] ?? 0);
                        $satuan = trim((string) ($it['satuan'] ?? ''));
                        $hargaSatuan = (float) ($it['harga_satuan'] ?? 0);
                        $subtotal = (float) ($it['subtotal'] ?? 0);
                        if ($subtotal <= 0 && $qty > 0) {
                            $subtotal = round($qty * $hargaSatuan, 2);
                        }
                        if ($subtotal <= 0) {
                            continue;
                        }

                        $catatanParts = [];
                        if ($qty > 0) {
                            $qtyLabel = abs($qty - round($qty)) < 0.00001
                                ? (string) (int) round($qty)
                                : rtrim(rtrim(number_format($qty, 2, '.', ''), '0'), '.');
                            $catatanParts[] = $qtyLabel . ($satuan !== '' ? ' ' . $satuan : '');
                            if ($hargaSatuan > 0) {
                                $catatanParts[] = '× ' . number_format($hargaSatuan, 0, ',', '.');
                            }
                        }
                        $itemCatatan = trim((string) ($it['catatan'] ?? ''));
                        if ($itemCatatan !== '') {
                            $catatanParts[] = $itemCatatan;
                        } elseif ($belanjaKet !== '') {
                            $catatanParts[] = $belanjaKet;
                        } elseif ($kategori !== '') {
                            $catatanParts[] = $kategori;
                        }

                        $groups[$key]['items'][] = [
                            'nama' => $nama,
                            'harga' => $subtotal,
                            'keterangan' => $groups[$key]['penerima'],
                            'catatan' => implode(' ', $catatanParts),
                        ];
                    }
                } else {
                    $amount = (float) $row['total'];
                    if ($amount <= 0) {
                        continue;
                    }
                    $nama = $kategori !== '' ? $kategori : ($belanjaKet !== '' ? $belanjaKet : 'Belanja');
                    $groups[$key]['items'][] = [
                        'nama' => $nama,
                        'harga' => $amount,
                        'keterangan' => $groups[$key]['penerima'],
                        'catatan' => $kategori !== '' && $belanjaKet !== '' ? $belanjaKet : '',
                    ];
                }
            }

            $exportRows = [];
            foreach ($groups as $group) {
                if (!$group['items']) {
                    continue;
                }
                $exportRows[] = [
                    'kind' => 'group',
                    'nama' => $group['label'],
                ];
                $sub = 0.0;
                foreach ($group['items'] as $item) {
                    $exportRows[] = array_merge(['kind' => 'item'], $item);
                    $sub += (float) $item['harga'];
                    $hasItem = true;
                }
                $exportRows[] = [
                    'kind' => 'subtotal',
                    'nama' => 'Subtotal ' . $group['penerima'],
                    'harga' => $sub,
                ];
            }

            if (!$exportRows) {
                continue;
            }

            $dayLabel = $this->formatMakerDayLabel($day);
            $sheets[] = [
                'name' => $dayLabel,
                'title' => $baseTitle . ' — ' . $dayLabel,
                'rows' => $exportRows,
            ];
        }

        if (!$hasItem || !$sheets) {
            return $this->json($response, [
                'success' => false,
                'message' => 'Tidak ada baris dengan nominal > 0 untuk diekspor.',
            ], 422);
        }

        try {
            $binary = SimpleXlsxWriter::makerOperasionalSheets($sheets);
        } catch (\Throwable $e) {
            return $this->json($response, [
                'success' => false,
                'message' => 'Gagal membuat Excel: ' . $e->getMessage(),
            ], 500);
        }

        $stamp = (new \DateTimeImmutable('now'))->format('Ymd_His');
        $downloadName = $namaFile . '_' . $stamp . '.xlsx';
        // ASCII-safe filename for Content-Disposition
        $safeName = preg_replace('/[^\w.\-]+/', '_', $downloadName) ?: ('maker_' . $stamp . '.xlsx');

        // Arsipkan Excel ke Waiting setiap kali diekspor (bukan hanya Maker pertama)
        try {
            $exportIds = array_values(array_unique(array_map(static fn ($r) => (int) $r['id'], $rows)));
            $totalAmount = 0;
            foreach ($rows as $r) {
                $totalAmount += (int) round((float) ($r['total'] ?? 0));
            }
            $svc = new BniBatchService($this->db);
            $user = $request->getAttribute('user');
            $svc->archiveBinaryExport(
                $exportIds,
                $namaFile,
                'maker_xlsx',
                $binary,
                $safeName,
                $totalAmount,
                isset($user['id']) ? (int) $user['id'] : null,
                $sppgId
            );
        } catch (\Throwable $e) {
            error_log('excel archive: ' . $e->getMessage());
        }

        $response->getBody()->write($binary);
        return $response
            ->withHeader(
                'Content-Type',
                'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
            )
            ->withHeader('Content-Disposition', 'attachment; filename="' . $safeName . '"')
            ->withHeader('Cache-Control', 'no-store')
            ->withStatus(200);
    }

    /** Label sheet: SENIN 11 AGU 2026 */
    private function formatMakerDayLabel(string $ymd): string
    {
        if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $ymd)) {
            return 'Tanpa tanggal';
        }
        $ts = strtotime($ymd . ' 00:00:00');
        if ($ts === false) {
            return $ymd;
        }
        $hari = ['MINGGU', 'SENIN', 'SELASA', 'RABU', 'KAMIS', 'JUMAT', 'SABTU'];
        $bulan = ['', 'JAN', 'FEB', 'MAR', 'APR', 'MEI', 'JUN', 'JUL', 'AGU', 'SEP', 'OKT', 'NOV', 'DES'];
        return $hari[(int) date('w', $ts)] . ' ' . (int) date('j', $ts) . ' ' . $bulan[(int) date('n', $ts)] . ' ' . date('Y', $ts);
    }

    /** @param list<int> $ids */
    private function itemNamesByBelanjaIds(array $ids): array
    {
        $ids = array_values(array_unique(array_filter($ids)));
        if (!$ids) {
            return [];
        }
        $placeholders = implode(',', array_fill(0, count($ids), '?'));
        $stmt = $this->db->prepare(
            "SELECT belanja_id, nama_barang FROM belanja_item
             WHERE belanja_id IN ($placeholders)
             ORDER BY id ASC"
        );
        $stmt->execute($ids);
        $map = [];
        while ($row = $stmt->fetch()) {
            $bid = (int) $row['belanja_id'];
            $name = trim((string) $row['nama_barang']);
            if ($name === '') {
                continue;
            }
            $map[$bid] = isset($map[$bid]) ? ($map[$bid] . ' ' . $name) : $name;
        }
        return $map;
    }

    /**
     * @param list<int> $ids
     * @return array<int, list<array>>
     */
    private function itemsByBelanjaIds(array $ids): array
    {
        $ids = array_values(array_unique(array_filter($ids)));
        if (!$ids) {
            return [];
        }
        $placeholders = implode(',', array_fill(0, count($ids), '?'));
        $stmt = $this->db->prepare(
            "SELECT belanja_id, nama_barang, qty, satuan, harga_satuan, subtotal, catatan
             FROM belanja_item
             WHERE belanja_id IN ($placeholders)
             ORDER BY id ASC"
        );
        $stmt->execute($ids);
        $map = [];
        while ($row = $stmt->fetch()) {
            $bid = (int) $row['belanja_id'];
            $map[$bid][] = $row;
        }
        return $map;
    }

    private function formatBniRemark2(string $ymd): string
    {
        $ts = strtotime($ymd . ' 00:00:00');
        if ($ts === false) {
            return '';
        }
        $hari = ['MINGGU', 'SENIN', 'SELASA', 'RABU', 'KAMIS', 'JUMAT', 'SABTU'];
        $bulan = ['', 'JAN', 'FEB', 'MAR', 'APR', 'MEI', 'JUN', 'JUL', 'AGU', 'SEP', 'OKT', 'NOV', 'DES'];
        return $hari[(int) date('w', $ts)] . ' ' . (int) date('j', $ts) . ' ' . $bulan[(int) date('n', $ts)];
    }

    private function bniClip(string $value, int $max): string
    {
        $value = trim(preg_replace('/\s+/u', ' ', str_replace([',', ';', "\r", "\n", '"'], ' ', $value)) ?? '');
        if (function_exists('mb_substr')) {
            return mb_substr($value, 0, $max);
        }
        return substr($value, 0, $max);
    }

    /** @param list<string> $cols */
    private function bniPadRow(array $cols, int $width): array
    {
        while (count($cols) < $width) {
            $cols[] = '';
        }
        return array_slice($cols, 0, $width);
    }

    /** @param list<string> $cols */
    private function bniCsvLine(array $cols): string
    {
        // Tanpa quote — sama seperti output VBA template BNI
        return implode(',', $cols);
    }

    private function findBelanja(int $id, int $sppgId): ?array
    {
        $stmt = $this->db->prepare('SELECT * FROM belanja WHERE id = ? AND sppg_id = ? LIMIT 1');
        $stmt->execute([$id, $sppgId]);
        $row = $stmt->fetch();
        return $row ?: null;
    }

    /** Item terkunci untuk maker/approved (termasuk super admin). */
    private function denyIfItemsLocked(int $belanjaId, int $sppgId, Response $response): ?Response
    {
        $row = $this->findBelanja($belanjaId, $sppgId);
        if (!$row) {
            return $this->json($response, ['success' => false, 'message' => 'Catatan belanja tidak ditemukan'], 404);
        }
        $status = (string) ($row['bni_status'] ?? 'belum');
        if (AuthHelper::isBniLocked($status)) {
            return $this->json($response, [
                'success' => false,
                'message' => 'Item tidak dapat diubah/ditambah/dihapus pada status ' . $status,
            ], 403);
        }
        return null;
    }

    private function validateRekening(int $id, int $sppgId): bool
    {
        $stmt = $this->db->prepare('SELECT id FROM rekening WHERE id = ? AND sppg_id = ? AND aktif = 1 LIMIT 1');
        $stmt->execute([$id, $sppgId]);
        return (bool) $stmt->fetch();
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

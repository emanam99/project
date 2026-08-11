<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Database;
use App\Services\CashlessPurchaseService;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;

/**
 * Kasir penjualan toko (myBeddien).
 */
class MybeddianPenjualanController
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

    private function getUsersIdFromRequest(Request $request): ?int
    {
        $payload = $request->getAttribute('user');
        if (!is_array($payload)) {
            return null;
        }
        $usersId = (int) ($payload['users_id'] ?? $payload['id'] ?? 0);
        return $usersId > 0 ? $usersId : null;
    }

    private function json(Response $response, array $data, int $status): Response
    {
        $response->getBody()->write(json_encode($data, JSON_UNESCAPED_UNICODE));
        return $response->withStatus($status)->withHeader('Content-Type', 'application/json; charset=utf-8');
    }

    /**
     * GET /api/mybeddian/v2/barang/by-kode?kode=
     */
    public function getBarangByKode(Request $request, Response $response): Response
    {
        try {
            $pedagangId = $this->getTokoIdFromRequest($request);
            if ($pedagangId === null) {
                return $this->json($response, ['success' => false, 'message' => 'Akses hanya untuk toko'], 403);
            }
            $kode = trim((string) ($request->getQueryParams()['kode'] ?? ''));
            if ($kode === '') {
                return $this->json($response, ['success' => false, 'message' => 'kode wajib'], 400);
            }
            $stmt = $this->db->prepare(
                'SELECT id, pedagang_id, kode_barang, nama_barang, harga, stok, keterangan, aktif
                 FROM cashless___barang
                 WHERE pedagang_id = ? AND kode_barang = ? AND aktif = 1
                 LIMIT 1'
            );
            $stmt->execute([$pedagangId, $kode]);
            $row = $stmt->fetch(\PDO::FETCH_ASSOC);
            if (!$row) {
                return $this->json($response, ['success' => false, 'message' => 'Barang tidak ditemukan'], 404);
            }
            return $this->json($response, [
                'success' => true,
                'data' => [
                    'id' => (int) $row['id'],
                    'pedagang_id' => (int) $row['pedagang_id'],
                    'kode_barang' => $row['kode_barang'],
                    'nama_barang' => $row['nama_barang'],
                    'harga' => (float) $row['harga'],
                    'stok' => (int) $row['stok'],
                    'keterangan' => $row['keterangan'],
                    'aktif' => (int) $row['aktif'],
                ],
            ], 200);
        } catch (\Exception $e) {
            error_log('MybeddianPenjualanController::getBarangByKode ' . $e->getMessage());
            return $this->json($response, ['success' => false, 'message' => 'Terjadi kesalahan'], 500);
        }
    }

    /**
     * POST /api/mybeddian/v2/penjualan/checkout
     * Body: { token, items: [{ barang_id, qty }], pin? }
     */
    public function checkout(Request $request, Response $response): Response
    {
        try {
            $pedagangId = $this->getTokoIdFromRequest($request);
            if ($pedagangId === null) {
                return $this->json($response, ['success' => false, 'message' => 'Akses hanya untuk toko'], 403);
            }
            $data = $request->getParsedBody() ?? [];
            if (!is_array($data)) {
                $data = [];
            }
            $token = trim((string) ($data['token'] ?? ''));
            $pin = isset($data['pin']) ? (string) $data['pin'] : null;
            $items = $data['items'] ?? [];
            if (!is_array($items)) {
                $items = [];
            }
            if ($token === '') {
                return $this->json($response, ['success' => false, 'message' => 'Token kartu wajib'], 400);
            }

            $svc = new CashlessPurchaseService($this->db);
            $result = $svc->checkout($pedagangId, $token, $items, $pin, $this->getUsersIdFromRequest($request));
            $status = ($result['success'] ?? false) ? 200 : 400;
            if (($result['code'] ?? '') === 'pin_required' || ($result['code'] ?? '') === 'pin_invalid') {
                $status = 401;
            }
            return $this->json($response, $result, $status);
        } catch (\Exception $e) {
            error_log('MybeddianPenjualanController::checkout ' . $e->getMessage());
            return $this->json($response, ['success' => false, 'message' => 'Gagal checkout'], 500);
        }
    }

    /**
     * GET /api/mybeddian/v2/penjualan — riwayat hari ini (default) atau ?days=7
     */
    public function list(Request $request, Response $response): Response
    {
        try {
            $pedagangId = $this->getTokoIdFromRequest($request);
            if ($pedagangId === null) {
                return $this->json($response, ['success' => false, 'message' => 'Akses hanya untuk toko'], 403);
            }
            $days = (int) ($request->getQueryParams()['days'] ?? 1);
            $days = max(1, min(30, $days));

            $stmt = $this->db->prepare(
                "SELECT td.id, td.journal_id, td.santri_id, td.nominal, td.keterangan, td.transaksi_at,
                        s.nama AS santri_nama, s.nis AS santri_nis,
                        (SELECT COUNT(*) FROM cashless___penjualan_item pi WHERE pi.transaksi_detail_id = td.id) AS item_count,
                        (SELECT COALESCE(SUM(pi.qty), 0) FROM cashless___penjualan_item pi WHERE pi.transaksi_detail_id = td.id) AS item_qty
                 FROM cashless___transaksi_detail td
                 LEFT JOIN santri s ON s.id = td.santri_id
                 WHERE td.pedagang_id = ?
                   AND td.transaksi_at >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
                 ORDER BY td.transaksi_at DESC, td.id DESC
                 LIMIT 200"
            );
            $stmt->execute([$pedagangId, $days - 1]);
            $list = [];
            while ($row = $stmt->fetch(\PDO::FETCH_ASSOC)) {
                $list[] = [
                    'id' => (int) $row['id'],
                    'journal_id' => (int) $row['journal_id'],
                    'santri_id' => (int) $row['santri_id'],
                    'santri_nama' => $row['santri_nama'],
                    'santri_nis' => $row['santri_nis'],
                    'nominal' => (float) $row['nominal'],
                    'keterangan' => $row['keterangan'],
                    'transaksi_at' => $row['transaksi_at'],
                    'item_count' => (int) ($row['item_count'] ?? 0),
                    'item_qty' => (int) ($row['item_qty'] ?? 0),
                ];
            }
            return $this->json($response, ['success' => true, 'data' => $list], 200);
        } catch (\Exception $e) {
            error_log('MybeddianPenjualanController::list ' . $e->getMessage());
            return $this->json($response, ['success' => false, 'message' => 'Terjadi kesalahan'], 500);
        }
    }

    /**
     * GET /api/mybeddian/v2/penjualan/{id}
     */
    public function detail(Request $request, Response $response, array $args): Response
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

            $stmt = $this->db->prepare(
                "SELECT td.id, td.journal_id, td.santri_id, td.nominal, td.keterangan, td.transaksi_at,
                        s.nama AS santri_nama, s.nis AS santri_nis
                 FROM cashless___transaksi_detail td
                 LEFT JOIN santri s ON s.id = td.santri_id
                 WHERE td.id = ? AND td.pedagang_id = ?
                 LIMIT 1"
            );
            $stmt->execute([$id, $pedagangId]);
            $row = $stmt->fetch(\PDO::FETCH_ASSOC);
            if (!$row) {
                return $this->json($response, ['success' => false, 'message' => 'Transaksi tidak ditemukan'], 404);
            }

            $itemsStmt = $this->db->prepare(
                'SELECT id, barang_id, kode_barang, nama_barang, harga_satuan, qty, subtotal
                 FROM cashless___penjualan_item
                 WHERE transaksi_detail_id = ?
                 ORDER BY id ASC'
            );
            $itemsStmt->execute([$id]);
            $items = [];
            while ($it = $itemsStmt->fetch(\PDO::FETCH_ASSOC)) {
                $items[] = [
                    'id' => (int) $it['id'],
                    'barang_id' => $it['barang_id'] !== null ? (int) $it['barang_id'] : null,
                    'kode_barang' => $it['kode_barang'],
                    'nama_barang' => $it['nama_barang'],
                    'harga_satuan' => (float) $it['harga_satuan'],
                    'qty' => (int) $it['qty'],
                    'subtotal' => (float) $it['subtotal'],
                ];
            }

            return $this->json($response, [
                'success' => true,
                'data' => [
                    'id' => (int) $row['id'],
                    'journal_id' => (int) $row['journal_id'],
                    'santri_id' => (int) $row['santri_id'],
                    'santri_nama' => $row['santri_nama'],
                    'santri_nis' => $row['santri_nis'],
                    'nominal' => (float) $row['nominal'],
                    'keterangan' => $row['keterangan'],
                    'transaksi_at' => $row['transaksi_at'],
                    'items' => $items,
                ],
            ], 200);
        } catch (\Exception $e) {
            error_log('MybeddianPenjualanController::detail ' . $e->getMessage());
            return $this->json($response, ['success' => false, 'message' => 'Terjadi kesalahan'], 500);
        }
    }
}

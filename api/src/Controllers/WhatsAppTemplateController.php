<?php

namespace App\Controllers;

use App\Database;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;

/**
 * CRUD template pesan WhatsApp (whatsapp_template).
 * List: role yang bisa akses chat (admin_uwaba, petugas_uwaba, admin_psb, petugas_psb, super_admin).
 * Create/Update/Delete: hanya super_admin.
 */
class WhatsAppTemplateController
{
    private $db;

    public function __construct()
    {
        $this->db = Database::getInstance()->getConnection();
    }

    private function json(Response $response, array $data, int $status): Response
    {
        $response->getBody()->write(json_encode($data, JSON_UNESCAPED_UNICODE));
        return $response->withStatus($status)->withHeader('Content-Type', 'application/json; charset=utf-8');
    }

    /**
     * GET /api/whatsapp-template/list
     * Query: kategori (optional) — filter by kategori
     */
    public function list(Request $request, Response $response): Response
    {
        try {
            $params = $request->getQueryParams();
            $kategori = isset($params['kategori']) ? trim((string) $params['kategori']) : null;

            $sql = 'SELECT id, kategori, nama, isi_pesan, created_at, updated_at FROM whatsapp_template WHERE 1=1';
            $bind = [];
            if ($kategori !== null && $kategori !== '') {
                $sql .= ' AND kategori = ?';
                $bind[] = $kategori;
            }
            $sql .= ' ORDER BY kategori ASC, nama ASC';

            $stmt = $this->db->prepare($sql);
            $stmt->execute($bind);
            $rows = $stmt->fetchAll(\PDO::FETCH_ASSOC);

            return $this->json($response, [
                'success' => true,
                'data' => $rows,
            ], 200);
        } catch (\Throwable $e) {
            error_log('WhatsAppTemplateController::list ' . $e->getMessage());
            return $this->json($response, [
                'success' => false,
                'message' => 'Gagal mengambil daftar template',
            ], 500);
        }
    }

    /**
     * POST /api/whatsapp-template/create
     * Body: { "kategori": "pendaftaran", "nama": "Judul", "isi_pesan": "Isi..." }
     */
    public function create(Request $request, Response $response): Response
    {
        try {
            $body = $request->getParsedBody();
            if (!is_array($body)) {
                $body = json_decode((string) $request->getBody(), true) ?? [];
            }
            $kategori = trim((string) ($body['kategori'] ?? 'umum'));
            $nama = trim((string) ($body['nama'] ?? ''));
            $isiPesan = trim((string) ($body['isi_pesan'] ?? $body['isiPesan'] ?? ''));

            if ($nama === '') {
                return $this->json($response, ['success' => false, 'message' => 'Nama template wajib diisi'], 400);
            }
            if ($isiPesan === '') {
                return $this->json($response, ['success' => false, 'message' => 'Isi pesan wajib diisi'], 400);
            }
            if ($kategori === '') {
                $kategori = 'umum';
            }

            $sql = 'INSERT INTO whatsapp_template (kategori, nama, isi_pesan) VALUES (?, ?, ?)';
            $stmt = $this->db->prepare($sql);
            $stmt->execute([$kategori, $nama, $isiPesan]);
            $id = (int) $this->db->lastInsertId();

            return $this->json($response, [
                'success' => true,
                'id' => $id,
                'message' => 'Template berhasil ditambah',
            ], 200);
        } catch (\Throwable $e) {
            error_log('WhatsAppTemplateController::create ' . $e->getMessage());
            return $this->json($response, [
                'success' => false,
                'message' => 'Gagal menambah template',
            ], 500);
        }
    }

    /**
     * PUT /api/whatsapp-template/update
     * Body: { "id": 1, "kategori": "...", "nama": "...", "isi_pesan": "..." }
     */
    public function update(Request $request, Response $response): Response
    {
        try {
            $body = $request->getParsedBody();
            if (!is_array($body)) {
                $body = json_decode((string) $request->getBody(), true) ?? [];
            }
            $id = isset($body['id']) ? (int) $body['id'] : 0;
            $kategori = isset($body['kategori']) ? trim((string) $body['kategori']) : null;
            $nama = isset($body['nama']) ? trim((string) $body['nama']) : null;
            $isiPesan = isset($body['isi_pesan']) ? trim((string) $body['isi_pesan']) : (isset($body['isiPesan']) ? trim((string) $body['isiPesan']) : null);

            if ($id < 1) {
                return $this->json($response, ['success' => false, 'message' => 'ID template tidak valid'], 400);
            }

            $updates = [];
            $bind = [];
            if ($kategori !== null) {
                $updates[] = 'kategori = ?';
                $bind[] = $kategori === '' ? 'umum' : $kategori;
            }
            if ($nama !== null) {
                $updates[] = 'nama = ?';
                $bind[] = $nama;
            }
            if ($isiPesan !== null) {
                $updates[] = 'isi_pesan = ?';
                $bind[] = $isiPesan;
            }
            if (empty($updates)) {
                return $this->json($response, ['success' => false, 'message' => 'Tidak ada field yang diubah'], 400);
            }
            $bind[] = $id;
            $sql = 'UPDATE whatsapp_template SET ' . implode(', ', $updates) . ' WHERE id = ?';
            $stmt = $this->db->prepare($sql);
            $stmt->execute($bind);

            return $this->json($response, [
                'success' => true,
                'message' => 'Template berhasil diubah',
            ], 200);
        } catch (\Throwable $e) {
            error_log('WhatsAppTemplateController::update ' . $e->getMessage());
            return $this->json($response, [
                'success' => false,
                'message' => 'Gagal mengubah template',
            ], 500);
        }
    }

    /**
     * DELETE /api/whatsapp-template/delete
     * Body: { "id": 1 }
     */
    public function delete(Request $request, Response $response): Response
    {
        try {
            $body = $request->getParsedBody();
            if (!is_array($body)) {
                $body = json_decode((string) $request->getBody(), true) ?? [];
            }
            $id = isset($body['id']) ? (int) $body['id'] : 0;
            if ($id < 1) {
                return $this->json($response, ['success' => false, 'message' => 'ID template tidak valid'], 400);
            }
            $stmt = $this->db->prepare('DELETE FROM whatsapp_template WHERE id = ?');
            $stmt->execute([$id]);
            if ($stmt->rowCount() === 0) {
                return $this->json($response, ['success' => false, 'message' => 'Template tidak ditemukan'], 404);
            }
            return $this->json($response, [
                'success' => true,
                'message' => 'Template berhasil dihapus',
            ], 200);
        } catch (\Throwable $e) {
            error_log('WhatsAppTemplateController::delete ' . $e->getMessage());
            return $this->json($response, [
                'success' => false,
                'message' => 'Gagal menghapus template',
            ], 500);
        }
    }
}

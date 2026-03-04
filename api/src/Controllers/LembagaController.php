<?php

namespace App\Controllers;

use App\Database;
use App\Helpers\UserAktivitasLogger;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;

class LembagaController
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
     * GET /api/lembaga - Get all lembaga
     */
    public function getAllLembaga(Request $request, Response $response): Response
    {
        try {
            $stmt = $this->db->query("SELECT * FROM lembaga ORDER BY id ASC");
            $lembaga = $stmt->fetchAll(\PDO::FETCH_ASSOC);

            return $this->jsonResponse($response, [
                'success' => true,
                'data' => $lembaga
            ], 200);
        } catch (\Exception $e) {
            error_log("Error getting lembaga: " . $e->getMessage());
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Gagal mengambil data lembaga',
                'error' => $e->getMessage()
            ], 500);
        }
    }

    /**
     * GET /api/lembaga/{id} - Get lembaga by id
     */
    public function getLembagaById(Request $request, Response $response, array $args): Response
    {
        try {
            $id = $args['id'] ?? null;

            if (!$id) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'ID lembaga tidak ditemukan'
                ], 400);
            }

            $stmt = $this->db->prepare("SELECT * FROM lembaga WHERE id = ?");
            $stmt->execute([$id]);
            $lembaga = $stmt->fetch(\PDO::FETCH_ASSOC);

            if (!$lembaga) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Lembaga tidak ditemukan'
                ], 404);
            }

            return $this->jsonResponse($response, [
                'success' => true,
                'data' => $lembaga
            ], 200);
        } catch (\Exception $e) {
            error_log("Error getting lembaga by id: " . $e->getMessage());
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Gagal mengambil data lembaga',
                'error' => $e->getMessage()
            ], 500);
        }
    }

    /**
     * POST /api/lembaga - Create new lembaga
     */
    public function createLembaga(Request $request, Response $response): Response
    {
        try {
            $data = $request->getParsedBody();

            // Validasi
            if (empty($data['id'])) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'ID lembaga wajib diisi'
                ], 400);
            }

            $id = $data['id'];
            $nama = $data['nama'] ?? null;
            $kategori = $data['kategori'] ?? null;
            $deskripsi = $data['deskripsi'] ?? null;

            // Cek apakah ID sudah ada
            $stmt = $this->db->prepare("SELECT id FROM lembaga WHERE id = ?");
            $stmt->execute([$id]);
            if ($stmt->fetch()) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'ID lembaga sudah ada'
                ], 400);
            }

            // Insert
            $waktuIndonesia = (new \DateTime('now', new \DateTimeZone('Asia/Jakarta')))->format('Y-m-d H:i:s');
            $stmt = $this->db->prepare("
                INSERT INTO lembaga (id, nama, kategori, deskripsi, tanggal_dibuat)
                VALUES (?, ?, ?, ?, ?)
            ");
            $stmt->execute([$id, $nama, $kategori, $deskripsi, $waktuIndonesia]);
            $newRow = ['id' => $id, 'nama' => $nama, 'kategori' => $kategori, 'deskripsi' => $deskripsi, 'tanggal_dibuat' => $waktuIndonesia];
            $user = $request->getAttribute('user');
            $pengurusId = isset($user['user_id']) ? (int) $user['user_id'] : (isset($user['id']) ? (int) $user['id'] : null);
            if ($pengurusId !== null) {
                UserAktivitasLogger::log(null, $pengurusId, UserAktivitasLogger::ACTION_CREATE, 'lembaga', $id, null, $newRow, $request);
            }

            return $this->jsonResponse($response, [
                'success' => true,
                'message' => 'Lembaga berhasil ditambahkan',
                'data' => [
                    'id' => $id,
                    'nama' => $nama,
                    'kategori' => $kategori,
                    'deskripsi' => $deskripsi
                ]
            ], 201);
        } catch (\Exception $e) {
            error_log("Error creating lembaga: " . $e->getMessage());
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Gagal menambahkan lembaga',
                'error' => $e->getMessage()
            ], 500);
        }
    }

    /**
     * PUT /api/lembaga/{id} - Update lembaga
     */
    public function updateLembaga(Request $request, Response $response, array $args): Response
    {
        try {
            $id = $args['id'] ?? null;

            if (!$id) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'ID lembaga tidak ditemukan'
                ], 400);
            }

            $data = $request->getParsedBody();
            $nama = $data['nama'] ?? null;
            $kategori = $data['kategori'] ?? null;
            $deskripsi = $data['deskripsi'] ?? null;

            $stmt = $this->db->prepare("SELECT * FROM lembaga WHERE id = ?");
            $stmt->execute([$id]);
            $oldLembaga = $stmt->fetch(\PDO::FETCH_ASSOC);
            if (!$oldLembaga) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Lembaga tidak ditemukan'
                ], 404);
            }

            $waktuIndonesia = (new \DateTime('now', new \DateTimeZone('Asia/Jakarta')))->format('Y-m-d H:i:s');
            $stmt = $this->db->prepare("
                UPDATE lembaga 
                SET nama = ?, kategori = ?, deskripsi = ?, tanggal_update = ?
                WHERE id = ?
            ");
            $stmt->execute([$nama, $kategori, $deskripsi, $waktuIndonesia, $id]);
            $stmtNew = $this->db->prepare("SELECT * FROM lembaga WHERE id = ?");
            $stmtNew->execute([$id]);
            $newLembaga = $stmtNew->fetch(\PDO::FETCH_ASSOC);
            $user = $request->getAttribute('user');
            $pengurusId = isset($user['user_id']) ? (int) $user['user_id'] : (isset($user['id']) ? (int) $user['id'] : null);
            if ($newLembaga && $pengurusId !== null) {
                UserAktivitasLogger::log(null, $pengurusId, UserAktivitasLogger::ACTION_UPDATE, 'lembaga', $id, $oldLembaga, $newLembaga, $request);
            }

            return $this->jsonResponse($response, [
                'success' => true,
                'message' => 'Lembaga berhasil diupdate'
            ], 200);
        } catch (\Exception $e) {
            error_log("Error updating lembaga: " . $e->getMessage());
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Gagal mengupdate lembaga',
                'error' => $e->getMessage()
            ], 500);
        }
    }

    /**
     * DELETE /api/lembaga/{id} - Delete lembaga
     */
    public function deleteLembaga(Request $request, Response $response, array $args): Response
    {
        try {
            $id = $args['id'] ?? null;

            if (!$id) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'ID lembaga tidak ditemukan'
                ], 400);
            }

            $stmt = $this->db->prepare("SELECT * FROM lembaga WHERE id = ?");
            $stmt->execute([$id]);
            $oldLembaga = $stmt->fetch(\PDO::FETCH_ASSOC);
            if (!$oldLembaga) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Lembaga tidak ditemukan'
                ], 404);
            }

            $stmt = $this->db->prepare("DELETE FROM lembaga WHERE id = ?");
            $stmt->execute([$id]);
            $user = $request->getAttribute('user');
            $pengurusId = isset($user['user_id']) ? (int) $user['user_id'] : (isset($user['id']) ? (int) $user['id'] : null);
            if ($pengurusId !== null) {
                UserAktivitasLogger::log(null, $pengurusId, UserAktivitasLogger::ACTION_DELETE, 'lembaga', $id, $oldLembaga, null, $request);
            }

            return $this->jsonResponse($response, [
                'success' => true,
                'message' => 'Lembaga berhasil dihapus'
            ], 200);
        } catch (\Exception $e) {
            error_log("Error deleting lembaga: " . $e->getMessage());
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Gagal menghapus lembaga',
                'error' => $e->getMessage()
            ], 500);
        }
    }
}


<?php

namespace App\Controllers;

use App\Database;
use App\Helpers\RoleHelper;
use App\Helpers\TextSanitizer;
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
     * @return array{all: bool, ids: list<string>}
     */
    private function lembagaListScopeFromUser(?array $user): array
    {
        if ($user === null || $user === []) {
            return ['all' => true, 'ids' => []];
        }
        if (RoleHelper::tokenHasAnyRoleKey($user, ['super_admin', 'admin_uwaba'])) {
            return ['all' => true, 'ids' => []];
        }
        if (RoleHelper::tokenHasAnyRoleKey($user, ['admin_lembaga'])) {
            if (!empty($user['lembaga_scope_all'])) {
                return ['all' => true, 'ids' => []];
            }

            return ['all' => false, 'ids' => RoleHelper::tokenPengeluaranLembagaIdsFromUser($user)];
        }

        return ['all' => true, 'ids' => []];
    }

    private function userMayAccessLembagaId(?array $user, string $lembagaId): bool
    {
        $scope = $this->lembagaListScopeFromUser($user);
        if ($scope['all']) {
            return true;
        }
        $id = trim($lembagaId);

        return $id !== '' && in_array($id, $scope['ids'], true);
    }

    /**
     * GET /api/lembaga - Get all lembaga
     */
    public function getAllLembaga(Request $request, Response $response): Response
    {
        try {
            $user = $request->getAttribute('user');
            $userArr = is_array($user) ? $user : null;
            $scope = $this->lembagaListScopeFromUser($userArr);

            if ($scope['all']) {
                $stmt = $this->db->query('SELECT * FROM lembaga ORDER BY id ASC');
                $lembaga = $stmt->fetchAll(\PDO::FETCH_ASSOC);
            } else {
                $ids = $scope['ids'];
                if ($ids === []) {
                    $lembaga = [];
                } else {
                    $placeholders = implode(',', array_fill(0, count($ids), '?'));
                    $stmt = $this->db->prepare("SELECT * FROM lembaga WHERE id IN ($placeholders) ORDER BY id ASC");
                    $stmt->execute($ids);
                    $lembaga = $stmt->fetchAll(\PDO::FETCH_ASSOC);
                }
            }

            return $this->jsonResponse($response, [
                'success' => true,
                'data' => $lembaga
            ], 200);
        } catch (\Exception $e) {
            error_log("Error getting lembaga: " . $e->getMessage());
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Gagal mengambil data lembaga',
                'error' => null
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

            $user = $request->getAttribute('user');
            $userArr = is_array($user) ? $user : null;
            if (!$this->userMayAccessLembagaId($userArr, (string) $id)) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Akses ditolak. Role Anda tidak memiliki izin untuk mengakses endpoint ini.',
                ], 403);
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
                'error' => null
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
            $nama = TextSanitizer::cleanTextOrNull($data['nama'] ?? null);
            $kategori = TextSanitizer::cleanTextOrNull($data['kategori'] ?? null);
            $deskripsi = TextSanitizer::cleanTextOrNull($data['deskripsi'] ?? null);

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
                'error' => null
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
            $nama = TextSanitizer::cleanTextOrNull($data['nama'] ?? null);
            $kategori = TextSanitizer::cleanTextOrNull($data['kategori'] ?? null);
            $deskripsi = TextSanitizer::cleanTextOrNull($data['deskripsi'] ?? null);

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
                'error' => null
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

            if (!empty($oldLembaga['logo_path'])) {
                LembagaLogoController::deleteStoredLogo($oldLembaga['logo_path']);
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
                'error' => null
            ], 500);
        }
    }
}


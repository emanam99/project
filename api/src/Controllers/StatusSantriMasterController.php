<?php

namespace App\Controllers;

use App\Database;
use App\Helpers\TextSanitizer;
use App\Helpers\UserAktivitasLogger;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;

class StatusSantriMasterController
{
    private \PDO $db;

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

    public function getAll(Request $request, Response $response): Response
    {
        try {
            $params = $request->getQueryParams();
            $kategori = TextSanitizer::cleanTextOrNull($params['kategori'] ?? null);
            $status = TextSanitizer::cleanTextOrNull($params['status'] ?? null);
            $q = TextSanitizer::cleanTextOrNull($params['q'] ?? null);

            $sql = "SELECT id, status_santri, kategori, status, tanggal_dibuat FROM status WHERE 1=1";
            $bind = [];

            if ($kategori !== null && $kategori !== '') {
                $sql .= " AND kategori = ?";
                $bind[] = $kategori;
            }
            if ($status !== null && in_array($status, ['aktif', 'nonaktif'], true)) {
                $sql .= " AND status = ?";
                $bind[] = $status;
            }
            if ($q !== null && $q !== '') {
                $sql .= " AND (status_santri LIKE ? OR kategori LIKE ?)";
                $like = '%' . $q . '%';
                $bind[] = $like;
                $bind[] = $like;
            }

            $sql .= " ORDER BY status_santri ASC, kategori ASC";

            $stmt = $this->db->prepare($sql);
            $stmt->execute($bind);
            $rows = $stmt->fetchAll(\PDO::FETCH_ASSOC);

            return $this->jsonResponse($response, [
                'success' => true,
                'data' => $rows
            ], 200);
        } catch (\Throwable $e) {
            error_log("StatusSantriMasterController getAll: " . $e->getMessage());
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Gagal mengambil data status santri',
                'error' => null
            ], 500);
        }
    }

    public function create(Request $request, Response $response): Response
    {
        try {
            $data = (array) $request->getParsedBody();
            $statusSantri = TextSanitizer::cleanText($data['status_santri'] ?? '');
            $kategori = TextSanitizer::cleanText($data['kategori'] ?? '');
            $status = isset($data['status']) && in_array($data['status'], ['aktif', 'nonaktif'], true)
                ? $data['status']
                : 'aktif';

            if ($statusSantri === '') {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Status santri wajib diisi'
                ], 400);
            }
            if ($kategori === '') {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Kategori wajib diisi'
                ], 400);
            }

            $waktu = (new \DateTime('now', new \DateTimeZone('Asia/Jakarta')))->format('Y-m-d H:i:s');

            $stmt = $this->db->prepare(
                "INSERT INTO status (status_santri, kategori, status, tanggal_dibuat) VALUES (?, ?, ?, ?)"
            );
            $stmt->execute([$statusSantri, $kategori, $status, $waktu]);
            $newId = (int) $this->db->lastInsertId();

            $newRow = [
                'id' => $newId,
                'status_santri' => $statusSantri,
                'kategori' => $kategori,
                'status' => $status,
                'tanggal_dibuat' => $waktu
            ];
            $user = $request->getAttribute('user');
            $pengurusId = isset($user['user_id']) ? (int) $user['user_id'] : (isset($user['id']) ? (int) $user['id'] : null);
            if ($pengurusId !== null) {
                UserAktivitasLogger::log(null, $pengurusId, UserAktivitasLogger::ACTION_CREATE, 'status', (string) $newId, null, $newRow, $request);
            }

            return $this->jsonResponse($response, [
                'success' => true,
                'message' => 'Status santri berhasil ditambahkan',
                'data' => $newRow
            ], 201);
        } catch (\PDOException $e) {
            if ((int) ($e->errorInfo[1] ?? 0) === 1062) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Kombinasi status santri dan kategori sudah ada'
                ], 409);
            }
            error_log("StatusSantriMasterController create: " . $e->getMessage());
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Gagal menambahkan status santri',
                'error' => null
            ], 500);
        } catch (\Throwable $e) {
            error_log("StatusSantriMasterController create: " . $e->getMessage());
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Gagal menambahkan status santri',
                'error' => null
            ], 500);
        }
    }

    public function update(Request $request, Response $response, array $args): Response
    {
        try {
            $id = (int) ($args['id'] ?? 0);
            if ($id <= 0) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'ID status tidak valid'
                ], 400);
            }

            $stmt = $this->db->prepare("SELECT * FROM status WHERE id = ?");
            $stmt->execute([$id]);
            $old = $stmt->fetch(\PDO::FETCH_ASSOC);
            if (!$old) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Data status tidak ditemukan'
                ], 404);
            }

            $data = (array) $request->getParsedBody();
            $statusSantri = array_key_exists('status_santri', $data)
                ? TextSanitizer::cleanText($data['status_santri'])
                : (string) $old['status_santri'];
            $kategori = array_key_exists('kategori', $data)
                ? TextSanitizer::cleanText($data['kategori'])
                : (string) $old['kategori'];
            $status = isset($data['status']) && in_array($data['status'], ['aktif', 'nonaktif'], true)
                ? $data['status']
                : (string) $old['status'];

            if ($statusSantri === '') {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Status santri wajib diisi'
                ], 400);
            }
            if ($kategori === '') {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Kategori wajib diisi'
                ], 400);
            }

            $stmt = $this->db->prepare("UPDATE status SET status_santri = ?, kategori = ?, status = ? WHERE id = ?");
            $stmt->execute([$statusSantri, $kategori, $status, $id]);

            $stmtNew = $this->db->prepare("SELECT * FROM status WHERE id = ?");
            $stmtNew->execute([$id]);
            $new = $stmtNew->fetch(\PDO::FETCH_ASSOC);

            $user = $request->getAttribute('user');
            $pengurusId = isset($user['user_id']) ? (int) $user['user_id'] : (isset($user['id']) ? (int) $user['id'] : null);
            if ($new && $pengurusId !== null) {
                UserAktivitasLogger::log(null, $pengurusId, UserAktivitasLogger::ACTION_UPDATE, 'status', (string) $id, $old, $new, $request);
            }

            return $this->jsonResponse($response, [
                'success' => true,
                'message' => 'Status santri berhasil diupdate',
                'data' => $new
            ], 200);
        } catch (\PDOException $e) {
            if ((int) ($e->errorInfo[1] ?? 0) === 1062) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Kombinasi status santri dan kategori sudah ada'
                ], 409);
            }
            error_log("StatusSantriMasterController update: " . $e->getMessage());
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Gagal mengupdate status santri',
                'error' => null
            ], 500);
        } catch (\Throwable $e) {
            error_log("StatusSantriMasterController update: " . $e->getMessage());
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Gagal mengupdate status santri',
                'error' => null
            ], 500);
        }
    }

    public function setStatus(Request $request, Response $response, array $args): Response
    {
        try {
            $id = (int) ($args['id'] ?? 0);
            if ($id <= 0) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'ID status tidak valid'
                ], 400);
            }

            $data = (array) $request->getParsedBody();
            $status = isset($data['status']) && in_array($data['status'], ['aktif', 'nonaktif'], true)
                ? $data['status']
                : null;
            if ($status === null) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Status harus aktif atau nonaktif'
                ], 400);
            }

            $stmt = $this->db->prepare("SELECT * FROM status WHERE id = ?");
            $stmt->execute([$id]);
            $old = $stmt->fetch(\PDO::FETCH_ASSOC);
            if (!$old) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Data status tidak ditemukan'
                ], 404);
            }

            $stmt = $this->db->prepare("UPDATE status SET status = ? WHERE id = ?");
            $stmt->execute([$status, $id]);
            $stmtNew = $this->db->prepare("SELECT * FROM status WHERE id = ?");
            $stmtNew->execute([$id]);
            $new = $stmtNew->fetch(\PDO::FETCH_ASSOC);

            $user = $request->getAttribute('user');
            $pengurusId = isset($user['user_id']) ? (int) $user['user_id'] : (isset($user['id']) ? (int) $user['id'] : null);
            if ($new && $pengurusId !== null) {
                UserAktivitasLogger::log(null, $pengurusId, UserAktivitasLogger::ACTION_UPDATE, 'status', (string) $id, $old, $new, $request);
            }

            return $this->jsonResponse($response, [
                'success' => true,
                'message' => $status === 'aktif' ? 'Status santri diaktifkan' : 'Status santri dinonaktifkan',
                'data' => $new
            ], 200);
        } catch (\Throwable $e) {
            error_log("StatusSantriMasterController setStatus: " . $e->getMessage());
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Gagal mengubah status santri',
                'error' => null
            ], 500);
        }
    }
}

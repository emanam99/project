<?php

namespace App\Controllers;

use App\Config\Database;
use PDO;
use PDOException;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;

class PengurusController {
    public function index(Request $request, Response $response): Response {
        $db = Database::getInstance();
        $stmt = $db->query('SELECT id, nip, nama, jabatan, akses FROM pengurus ORDER BY nama ASC');
        $pengurus = $stmt->fetchAll();

        return $this->jsonResponse($response, ['success' => true, 'data' => $pengurus]);
    }

    public function create(Request $request, Response $response): Response {
        $data = $this->parseBody($request);
        $nip = trim($data['nip'] ?? '');
        $nama = trim($data['nama'] ?? '');
        $jabatan = trim($data['jabatan'] ?? '');
        $akses = trim($data['akses'] ?? 'user');

        if ($nip === '' || $nama === '') {
            return $this->jsonResponse($response, ['success' => false, 'message' => 'NIP dan Nama wajib diisi']);
        }

        if (!$this->isValidAkses($akses)) {
            return $this->jsonResponse($response, ['success' => false, 'message' => 'Hak akses tidak valid']);
        }

        $db = Database::getInstance();

        if ($this->nipExists($db, $nip)) {
            return $this->jsonResponse($response, ['success' => false, 'message' => 'NIP sudah terdaftar']);
        }

        try {
            $stmt = $db->prepare('INSERT INTO pengurus (nip, nama, jabatan, akses) VALUES (:nip, :nama, :jabatan, :akses)');
            $stmt->execute([
                'nip' => $nip,
                'nama' => $nama,
                'jabatan' => $jabatan,
                'akses' => $akses,
            ]);
            return $this->jsonResponse($response, ['success' => true, 'message' => 'Pengurus berhasil ditambahkan']);
        } catch (PDOException $e) {
            if ($this->isDuplicateNipError($e)) {
                return $this->jsonResponse($response, ['success' => false, 'message' => 'NIP sudah terdaftar']);
            }
            return $this->jsonResponse($response, ['success' => false, 'message' => 'Gagal menambah pengurus: ' . $e->getMessage()]);
        }
    }

    public function update(Request $request, Response $response, array $args): Response {
        $data = $this->parseBody($request);
        $id = $args['id'] ?? $data['id'] ?? null;
        if (!$id) {
            return $this->jsonResponse($response, ['success' => false, 'message' => 'ID wajib untuk update']);
        }

        $nama = trim($data['nama'] ?? '');
        $jabatan = trim($data['jabatan'] ?? '');
        $akses = trim($data['akses'] ?? 'user');

        if ($nama === '') {
            return $this->jsonResponse($response, ['success' => false, 'message' => 'Nama wajib diisi']);
        }

        if (!$this->isValidAkses($akses)) {
            return $this->jsonResponse($response, ['success' => false, 'message' => 'Hak akses tidak valid']);
        }

        $db = Database::getInstance();

        $stmt = $db->prepare('SELECT id, nip, akses FROM pengurus WHERE id = :id');
        $stmt->execute(['id' => $id]);
        $existing = $stmt->fetch();
        if (!$existing) {
            return $this->jsonResponse($response, ['success' => false, 'message' => 'Pengurus tidak ditemukan']);
        }

        try {
            $stmt = $db->prepare('
                UPDATE pengurus
                SET nama = :nama, jabatan = :jabatan, akses = :akses
                WHERE id = :id
            ');
            $stmt->execute([
                'nama' => $nama,
                'jabatan' => $jabatan,
                'akses' => $akses,
                'id' => $id,
            ]);
            return $this->jsonResponse($response, ['success' => true, 'message' => 'Pengurus diperbarui']);
        } catch (PDOException $e) {
            return $this->jsonResponse($response, ['success' => false, 'message' => 'Gagal memperbarui pengurus: ' . $e->getMessage()]);
        }
    }

    public function resetPassword(Request $request, Response $response, array $args = []): Response {
        $data = $this->parseBody($request);
        $id = $args['id'] ?? $data['id'] ?? null;
        if (!$id) {
            return $this->jsonResponse($response, ['success' => false, 'message' => 'ID wajib']);
        }

        $db = Database::getInstance();
        $stmt = $db->prepare('SELECT id, nip, nama FROM pengurus WHERE id = :id');
        $stmt->execute(['id' => $id]);
        $existing = $stmt->fetch();
        if (!$existing) {
            return $this->jsonResponse($response, ['success' => false, 'message' => 'Pengurus tidak ditemukan']);
        }

        try {
            $stmt = $db->prepare('UPDATE pengurus SET pw = :pw WHERE id = :id');
            $stmt->execute(['pw' => '', 'id' => $id]);
            return $this->jsonResponse($response, [
                'success' => true,
                'message' => 'Password direset. Pengurus wajib mengisi password baru saat login berikutnya.',
            ]);
        } catch (PDOException $e) {
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Gagal mereset password: ' . $e->getMessage(),
            ]);
        }
    }

    private function parseBody(Request $request): array {
        $data = json_decode((string) $request->getBody(), true);
        return is_array($data) ? $data : [];
    }

    private function nipExists(PDO $db, string $nip, ?int $excludeId = null): bool {
        $sql = 'SELECT id FROM pengurus WHERE nip = :nip';
        $params = ['nip' => $nip];
        if ($excludeId) {
            $sql .= ' AND id != :id';
            $params['id'] = $excludeId;
        }
        $stmt = $db->prepare($sql);
        $stmt->execute($params);
        return (bool) $stmt->fetch();
    }

    private function isValidAkses(string $akses): bool {
        return in_array($akses, ['user', 'admin', 'super_admin'], true);
    }

    private function isDuplicateNipError(PDOException $e): bool {
        $code = (string) $e->getCode();
        $message = $e->getMessage();
        return $code === '23000' && (stripos($message, 'nip') !== false || stripos($message, 'Duplicate') !== false);
    }

    private function jsonResponse(Response $response, array $data, int $status = 200): Response {
        $response->getBody()->write(json_encode($data));
        return $response->withHeader('Content-Type', 'application/json')->withStatus($status);
    }
}

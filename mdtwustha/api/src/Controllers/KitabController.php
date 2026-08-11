<?php

namespace App\Controllers;

use App\Config\Database;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;

class KitabController {
    public function index(Request $request, Response $response): Response {
        $db = Database::getInstance();
        $stmt = $db->query('
            SELECT id, fan, nama, musonnif
            FROM kitab
            ORDER BY fan ASC, nama ASC
        ');
        return $this->jsonResponse($response, ['success' => true, 'data' => $stmt->fetchAll()]);
    }

    public function create(Request $request, Response $response): Response {
        $data = $this->parseBody($request);
        $fan = trim($data['fan'] ?? '');
        $nama = trim($data['nama'] ?? '');
        $musonnif = trim($data['musonnif'] ?? '');

        if ($fan === '') {
            return $this->jsonResponse($response, ['success' => false, 'message' => 'Fan wajib diisi']);
        }
        if ($nama === '') {
            return $this->jsonResponse($response, ['success' => false, 'message' => 'Nama kitab wajib diisi']);
        }

        $db = Database::getInstance();
        try {
            $stmt = $db->prepare('INSERT INTO kitab (fan, nama, musonnif) VALUES (:fan, :nama, :musonnif)');
            $stmt->execute(['fan' => $fan, 'nama' => $nama, 'musonnif' => $musonnif]);
            return $this->jsonResponse($response, ['success' => true, 'message' => 'Kitab ditambah']);
        } catch (\Exception $e) {
            return $this->jsonResponse($response, ['success' => false, 'message' => 'Gagal menambah kitab: ' . $e->getMessage()]);
        }
    }

    public function update(Request $request, Response $response, array $args): Response {
        $id = $args['id'] ?? null;
        if (!$id) {
            return $this->jsonResponse($response, ['success' => false, 'message' => 'ID wajib untuk update']);
        }

        $data = $this->parseBody($request);
        $fan = trim($data['fan'] ?? '');
        $nama = trim($data['nama'] ?? '');
        $musonnif = trim($data['musonnif'] ?? '');

        if ($fan === '') {
            return $this->jsonResponse($response, ['success' => false, 'message' => 'Fan wajib diisi']);
        }
        if ($nama === '') {
            return $this->jsonResponse($response, ['success' => false, 'message' => 'Nama kitab wajib diisi']);
        }

        $db = Database::getInstance();
        if (!$this->kitabExists($db, (int) $id)) {
            return $this->jsonResponse($response, ['success' => false, 'message' => 'Kitab tidak ditemukan']);
        }

        try {
            $stmt = $db->prepare('UPDATE kitab SET fan = :fan, nama = :nama, musonnif = :musonnif WHERE id = :id');
            $stmt->execute(['fan' => $fan, 'nama' => $nama, 'musonnif' => $musonnif, 'id' => $id]);
            return $this->jsonResponse($response, ['success' => true, 'message' => 'Kitab diperbarui']);
        } catch (\Exception $e) {
            return $this->jsonResponse($response, ['success' => false, 'message' => 'Gagal memperbarui kitab: ' . $e->getMessage()]);
        }
    }

    public function delete(Request $request, Response $response, array $args): Response {
        $id = $args['id'] ?? null;
        if (!$id) {
            return $this->jsonResponse($response, ['success' => false, 'message' => 'ID wajib untuk hapus']);
        }

        $db = Database::getInstance();
        if (!$this->kitabExists($db, (int) $id)) {
            return $this->jsonResponse($response, ['success' => false, 'message' => 'Kitab tidak ditemukan']);
        }

        $stmt = $db->prepare('SELECT COUNT(*) FROM mapel WHERE kitab_id = :id');
        $stmt->execute(['id' => $id]);
        if ((int) $stmt->fetchColumn() > 0) {
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Kitab masih dipakai mapel. Hapus mapel terkait terlebih dahulu.',
            ]);
        }

        try {
            $stmt = $db->prepare('DELETE FROM kitab WHERE id = :id');
            $stmt->execute(['id' => $id]);
            return $this->jsonResponse($response, ['success' => true, 'message' => 'Kitab dihapus']);
        } catch (\Exception $e) {
            return $this->jsonResponse($response, ['success' => false, 'message' => 'Gagal menghapus kitab: ' . $e->getMessage()]);
        }
    }

    private function kitabExists($db, int $id): bool {
        $stmt = $db->prepare('SELECT id FROM kitab WHERE id = :id');
        $stmt->execute(['id' => $id]);
        return (bool) $stmt->fetch();
    }

    private function parseBody(Request $request): array {
        $data = json_decode((string) $request->getBody(), true);
        return is_array($data) ? $data : [];
    }

    private function jsonResponse(Response $response, array $data, int $status = 200): Response {
        $response->getBody()->write(json_encode($data));
        return $response->withHeader('Content-Type', 'application/json')->withStatus($status);
    }
}

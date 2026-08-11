<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Database;
use App\Helpers\TextSanitizer;
use App\Helpers\WebsiteHelper;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;

/**
 * CRUD kategori berita untuk modul Website.
 * Akses tulis: pemilik menu.website.berita_kategori (super_admin selalu boleh).
 */
class WebsiteKategoriBeritaController
{
    private \PDO $db;

    public function __construct()
    {
        $this->db = Database::getInstance()->getConnection();
    }

    private function json(Response $response, array $data, int $status = 200): Response
    {
        $response->getBody()->write(json_encode($data, JSON_UNESCAPED_UNICODE));
        return $response->withStatus($status)->withHeader('Content-Type', 'application/json; charset=utf-8');
    }

    public function list(Request $request, Response $response): Response
    {
        try {
            $params = $request->getQueryParams();
            $q = TextSanitizer::cleanTextOrNull($params['q'] ?? null);
            $sql = 'SELECT id, slug, nama, urutan, aktif, created_at, updated_at FROM `website___kategori_berita` WHERE 1=1';
            $bind = [];
            if ($q !== null && $q !== '') {
                $sql .= ' AND (nama LIKE ? OR slug LIKE ?)';
                $bind[] = '%' . $q . '%';
                $bind[] = '%' . $q . '%';
            }
            $sql .= ' ORDER BY urutan ASC, nama ASC';
            $stmt = $this->db->prepare($sql);
            $stmt->execute($bind);
            return $this->json($response, ['success' => true, 'data' => $stmt->fetchAll(\PDO::FETCH_ASSOC)]);
        } catch (\Throwable $e) {
            error_log('WebsiteKategoriBeritaController.list: ' . $e->getMessage());
            return $this->json($response, ['success' => false, 'message' => 'Gagal memuat kategori berita'], 500);
        }
    }

    public function create(Request $request, Response $response): Response
    {
        $user = (array) ($request->getAttribute('user') ?? []);
        if (!WebsiteHelper::canWriteModule($this->db, $user, 'menu.website.berita_kategori')) {
            return $this->json($response, ['success' => false, 'message' => 'Akses ditolak'], 403);
        }
        try {
            $body = (array) $request->getParsedBody();
            $nama = TextSanitizer::cleanText((string) ($body['nama'] ?? ''));
            if ($nama === '') {
                return $this->json($response, ['success' => false, 'message' => 'Nama kategori wajib diisi'], 400);
            }
            $urutan = (int) ($body['urutan'] ?? 0);
            $aktif = isset($body['aktif']) ? (int) (bool) $body['aktif'] : 1;
            $slug = WebsiteHelper::slugify(TextSanitizer::cleanTextOrNull($body['slug'] ?? null) ?? $nama);
            if ($slug === '') {
                $slug = WebsiteHelper::slugify($nama);
            }
            $slug = WebsiteHelper::uniqueSlug($this->db, 'website___kategori_berita', $slug);

            $stmt = $this->db->prepare('INSERT INTO `website___kategori_berita` (slug, nama, urutan, aktif) VALUES (?, ?, ?, ?)');
            $stmt->execute([$slug, $nama, $urutan, $aktif]);
            return $this->json($response, ['success' => true, 'data' => ['id' => (int) $this->db->lastInsertId(), 'slug' => $slug]], 201);
        } catch (\Throwable $e) {
            error_log('WebsiteKategoriBeritaController.create: ' . $e->getMessage());
            return $this->json($response, ['success' => false, 'message' => 'Gagal membuat kategori berita'], 500);
        }
    }

    public function update(Request $request, Response $response, array $args): Response
    {
        $user = (array) ($request->getAttribute('user') ?? []);
        if (!WebsiteHelper::canWriteModule($this->db, $user, 'menu.website.berita_kategori')) {
            return $this->json($response, ['success' => false, 'message' => 'Akses ditolak'], 403);
        }
        try {
            $id = (int) ($args['id'] ?? 0);
            if ($id <= 0) {
                return $this->json($response, ['success' => false, 'message' => 'ID tidak valid'], 400);
            }
            $body = (array) $request->getParsedBody();
            $nama = TextSanitizer::cleanText((string) ($body['nama'] ?? ''));
            if ($nama === '') {
                return $this->json($response, ['success' => false, 'message' => 'Nama kategori wajib diisi'], 400);
            }
            $urutan = (int) ($body['urutan'] ?? 0);
            $aktif = isset($body['aktif']) ? (int) (bool) $body['aktif'] : 1;
            $slug = WebsiteHelper::slugify(TextSanitizer::cleanTextOrNull($body['slug'] ?? null) ?? $nama);
            if ($slug === '') {
                $slug = WebsiteHelper::slugify($nama);
            }
            $slug = WebsiteHelper::uniqueSlug($this->db, 'website___kategori_berita', $slug, $id);

            $stmt = $this->db->prepare('UPDATE `website___kategori_berita` SET slug = ?, nama = ?, urutan = ?, aktif = ? WHERE id = ?');
            $stmt->execute([$slug, $nama, $urutan, $aktif, $id]);
            return $this->json($response, ['success' => true, 'data' => ['id' => $id, 'slug' => $slug]]);
        } catch (\Throwable $e) {
            error_log('WebsiteKategoriBeritaController.update: ' . $e->getMessage());
            return $this->json($response, ['success' => false, 'message' => 'Gagal mengubah kategori berita'], 500);
        }
    }

    public function delete(Request $request, Response $response, array $args): Response
    {
        $user = (array) ($request->getAttribute('user') ?? []);
        if (!WebsiteHelper::canWriteModule($this->db, $user, 'menu.website.berita_kategori')) {
            return $this->json($response, ['success' => false, 'message' => 'Akses ditolak'], 403);
        }
        try {
            $id = (int) ($args['id'] ?? 0);
            if ($id <= 0) {
                return $this->json($response, ['success' => false, 'message' => 'ID tidak valid'], 400);
            }
            $stmt = $this->db->prepare('DELETE FROM `website___kategori_berita` WHERE id = ?');
            $stmt->execute([$id]);
            return $this->json($response, ['success' => true]);
        } catch (\Throwable $e) {
            error_log('WebsiteKategoriBeritaController.delete: ' . $e->getMessage());
            return $this->json($response, ['success' => false, 'message' => 'Gagal menghapus kategori berita'], 500);
        }
    }
}

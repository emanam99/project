<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Database;
use App\Helpers\TextSanitizer;
use App\Helpers\WebsiteHelper;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;

/**
 * CRUD halaman statis (Tentang, Kontak, dll) untuk web publik.
 * Publish/unpublish butuh action.website.halaman.publish.
 */
class WebsiteHalamanController
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

    private function mapRow(array $r): array
    {
        return [
            'id' => isset($r['id']) ? (int) $r['id'] : null,
            'slug' => $r['slug'] ?? '',
            'judul' => $r['judul'] ?? '',
            'konten_html' => $r['konten_html'] ?? null,
            'og_title' => $r['og_title'] ?? null,
            'og_description' => $r['og_description'] ?? null,
            'og_image' => $r['og_image'] ?? null,
            'status' => $r['status'] ?? 'draft',
            'created_at' => $r['created_at'] ?? null,
            'updated_at' => $r['updated_at'] ?? null,
        ];
    }

    public function listAdmin(Request $request, Response $response): Response
    {
        try {
            $params = $request->getQueryParams();
            $q = TextSanitizer::cleanTextOrNull($params['q'] ?? null);
            $status = isset($params['status']) ? trim((string) $params['status']) : '';
            $sql = 'SELECT id, slug, judul, konten_html, og_title, og_description, og_image, status, created_at, updated_at FROM `website___halaman` WHERE 1=1';
            $bind = [];
            if ($q !== null && $q !== '') {
                $sql .= ' AND (judul LIKE ? OR slug LIKE ?)';
                $bind[] = '%' . $q . '%';
                $bind[] = '%' . $q . '%';
            }
            if (in_array($status, ['draft', 'publish'], true)) {
                $sql .= ' AND status = ?';
                $bind[] = $status;
            }
            $sql .= ' ORDER BY judul ASC';
            $stmt = $this->db->prepare($sql);
            $stmt->execute($bind);
            $rows = array_map(fn ($r) => $this->mapRow($r), $stmt->fetchAll(\PDO::FETCH_ASSOC));
            return $this->json($response, ['success' => true, 'data' => $rows]);
        } catch (\Throwable $e) {
            error_log('WebsiteHalamanController.listAdmin: ' . $e->getMessage());
            return $this->json($response, ['success' => false, 'message' => 'Gagal memuat halaman'], 500);
        }
    }

    public function showAdmin(Request $request, Response $response, array $args): Response
    {
        try {
            $id = (int) ($args['id'] ?? 0);
            if ($id <= 0) {
                return $this->json($response, ['success' => false, 'message' => 'ID tidak valid'], 400);
            }
            $stmt = $this->db->prepare('SELECT id, slug, judul, konten_html, og_title, og_description, og_image, status, created_at, updated_at FROM `website___halaman` WHERE id = ? LIMIT 1');
            $stmt->execute([$id]);
            $row = $stmt->fetch(\PDO::FETCH_ASSOC);
            if (!$row) {
                return $this->json($response, ['success' => false, 'message' => 'Halaman tidak ditemukan'], 404);
            }
            return $this->json($response, ['success' => true, 'data' => $this->mapRow($row)]);
        } catch (\Throwable $e) {
            error_log('WebsiteHalamanController.showAdmin: ' . $e->getMessage());
            return $this->json($response, ['success' => false, 'message' => 'Gagal memuat halaman'], 500);
        }
    }

    private function parseBody(array $body, ?int $exceptId = null): array
    {
        $judul = TextSanitizer::cleanText((string) ($body['judul'] ?? ''));
        if ($judul === '') {
            return ['error' => 'Judul wajib diisi'] + array_fill_keys(['judul', 'slug', 'konten_html', 'og_title', 'og_description', 'og_image', 'status'], null);
        }
        $slug = WebsiteHelper::slugify(TextSanitizer::cleanTextOrNull($body['slug'] ?? null) ?? $judul);
        if ($slug === '') {
            $slug = WebsiteHelper::slugify($judul);
        }
        $slug = WebsiteHelper::uniqueSlug($this->db, 'website___halaman', $slug, $exceptId);
        $konten = isset($body['konten_html']) ? trim((string) $body['konten_html']) : null;
        if ($konten === '') {
            $konten = null;
        }
        $status = isset($body['status']) && in_array($body['status'], ['draft', 'publish'], true) ? $body['status'] : 'draft';
        return [
            'judul' => $judul,
            'slug' => $slug,
            'konten_html' => $konten,
            'og_title' => TextSanitizer::cleanTextOrNull($body['og_title'] ?? null),
            'og_description' => TextSanitizer::cleanTextOrNull($body['og_description'] ?? null),
            'og_image' => TextSanitizer::cleanTextOrNull($body['og_image'] ?? null),
            'status' => $status,
            'error' => null,
        ];
    }

    public function create(Request $request, Response $response): Response
    {
        $user = (array) ($request->getAttribute('user') ?? []);
        if (!WebsiteHelper::canWriteModule($this->db, $user, 'menu.website.halaman')) {
            return $this->json($response, ['success' => false, 'message' => 'Akses ditolak'], 403);
        }
        try {
            $parsed = $this->parseBody((array) $request->getParsedBody());
            if (!empty($parsed['error'])) {
                return $this->json($response, ['success' => false, 'message' => $parsed['error']], 400);
            }
            if ($parsed['status'] === 'publish' && !WebsiteHelper::hasAction($this->db, $user, 'action.website.halaman.publish')) {
                $parsed['status'] = 'draft';
            }
            $stmt = $this->db->prepare('INSERT INTO `website___halaman` (slug, judul, konten_html, og_title, og_description, og_image, status) VALUES (?, ?, ?, ?, ?, ?, ?)');
            $stmt->execute([$parsed['slug'], $parsed['judul'], $parsed['konten_html'], $parsed['og_title'], $parsed['og_description'], $parsed['og_image'], $parsed['status']]);
            return $this->json($response, ['success' => true, 'data' => ['id' => (int) $this->db->lastInsertId(), 'slug' => $parsed['slug']]], 201);
        } catch (\Throwable $e) {
            error_log('WebsiteHalamanController.create: ' . $e->getMessage());
            return $this->json($response, ['success' => false, 'message' => 'Gagal menyimpan halaman'], 500);
        }
    }

    public function update(Request $request, Response $response, array $args): Response
    {
        $user = (array) ($request->getAttribute('user') ?? []);
        if (!WebsiteHelper::canWriteModule($this->db, $user, 'menu.website.halaman')) {
            return $this->json($response, ['success' => false, 'message' => 'Akses ditolak'], 403);
        }
        try {
            $id = (int) ($args['id'] ?? 0);
            if ($id <= 0) {
                return $this->json($response, ['success' => false, 'message' => 'ID tidak valid'], 400);
            }
            $cur = $this->db->prepare('SELECT status FROM `website___halaman` WHERE id = ? LIMIT 1');
            $cur->execute([$id]);
            $curRow = $cur->fetch(\PDO::FETCH_ASSOC);
            if (!$curRow) {
                return $this->json($response, ['success' => false, 'message' => 'Halaman tidak ditemukan'], 404);
            }
            $parsed = $this->parseBody((array) $request->getParsedBody(), $id);
            if (!empty($parsed['error'])) {
                return $this->json($response, ['success' => false, 'message' => $parsed['error']], 400);
            }
            if ($parsed['status'] === 'publish' && $curRow['status'] !== 'publish'
                && !WebsiteHelper::hasAction($this->db, $user, 'action.website.halaman.publish')
            ) {
                return $this->json($response, ['success' => false, 'message' => 'Tidak punya hak publikasikan halaman'], 403);
            }
            $stmt = $this->db->prepare('UPDATE `website___halaman` SET slug = ?, judul = ?, konten_html = ?, og_title = ?, og_description = ?, og_image = ?, status = ? WHERE id = ?');
            $stmt->execute([$parsed['slug'], $parsed['judul'], $parsed['konten_html'], $parsed['og_title'], $parsed['og_description'], $parsed['og_image'], $parsed['status'], $id]);
            return $this->json($response, ['success' => true, 'data' => ['id' => $id, 'slug' => $parsed['slug']]]);
        } catch (\Throwable $e) {
            error_log('WebsiteHalamanController.update: ' . $e->getMessage());
            return $this->json($response, ['success' => false, 'message' => 'Gagal mengubah halaman'], 500);
        }
    }

    public function delete(Request $request, Response $response, array $args): Response
    {
        $user = (array) ($request->getAttribute('user') ?? []);
        if (!WebsiteHelper::canWriteModule($this->db, $user, 'menu.website.halaman')) {
            return $this->json($response, ['success' => false, 'message' => 'Akses ditolak'], 403);
        }
        try {
            $id = (int) ($args['id'] ?? 0);
            if ($id <= 0) {
                return $this->json($response, ['success' => false, 'message' => 'ID tidak valid'], 400);
            }
            $stmt = $this->db->prepare('DELETE FROM `website___halaman` WHERE id = ?');
            $stmt->execute([$id]);
            return $this->json($response, ['success' => true]);
        } catch (\Throwable $e) {
            error_log('WebsiteHalamanController.delete: ' . $e->getMessage());
            return $this->json($response, ['success' => false, 'message' => 'Gagal menghapus halaman'], 500);
        }
    }

    public function detailPublic(Request $request, Response $response, array $args): Response
    {
        try {
            $slug = trim((string) ($args['slug'] ?? ''));
            if ($slug === '') {
                return $this->json($response, ['success' => false, 'message' => 'Slug kosong'], 400);
            }
            $stmt = $this->db->prepare("SELECT id, slug, judul, konten_html, og_title, og_description, og_image, status, created_at, updated_at FROM `website___halaman` WHERE slug = ? AND status = 'publish' LIMIT 1");
            $stmt->execute([$slug]);
            $row = $stmt->fetch(\PDO::FETCH_ASSOC);
            if (!$row) {
                return $this->json($response, ['success' => false, 'message' => 'Halaman tidak ditemukan'], 404);
            }
            return $this->json($response, ['success' => true, 'data' => $this->mapRow($row)]);
        } catch (\Throwable $e) {
            error_log('WebsiteHalamanController.detailPublic: ' . $e->getMessage());
            return $this->json($response, ['success' => false, 'message' => 'Gagal memuat halaman'], 500);
        }
    }
}

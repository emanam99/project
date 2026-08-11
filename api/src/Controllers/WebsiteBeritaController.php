<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Database;
use App\Helpers\RoleHelper;
use App\Helpers\TextSanitizer;
use App\Helpers\WebsiteHelper;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;

/**
 * CRUD berita untuk admin Website + endpoint detail/list publik.
 *
 * Aksi destruktif/publish:
 * - publish/unpublish wajib `action.website.berita.publish`
 * - hapus wajib `action.website.berita.hapus`
 */
class WebsiteBeritaController
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

    /** Format baris untuk response (admin & public). */
    private function mapRow(array $r): array
    {
        return [
            'id' => isset($r['id']) ? (int) $r['id'] : null,
            'slug' => $r['slug'] ?? '',
            'judul' => $r['judul'] ?? '',
            'ringkasan' => $r['ringkasan'] ?? null,
            'konten_html' => $r['konten_html'] ?? null,
            'cover_url' => $r['cover_url'] ?? null,
            'kategori_id' => isset($r['kategori_id']) ? (int) $r['kategori_id'] : null,
            'kategori_nama' => $r['kategori_nama'] ?? null,
            'kategori_slug' => $r['kategori_slug'] ?? null,
            'status' => $r['status'] ?? 'draft',
            'published_at' => $r['published_at'] ?? null,
            'og_title' => $r['og_title'] ?? null,
            'og_description' => $r['og_description'] ?? null,
            'og_image' => $r['og_image'] ?? null,
            'author_pengurus_id' => isset($r['author_pengurus_id']) ? (int) $r['author_pengurus_id'] : null,
            'author_nama' => $r['author_nama'] ?? null,
            'created_at' => $r['created_at'] ?? null,
            'updated_at' => $r['updated_at'] ?? null,
        ];
    }

    private function selectColumns(): string
    {
        return 'b.id, b.slug, b.judul, b.ringkasan, b.konten_html, b.cover_url, b.kategori_id, '
            . 'b.status, b.published_at, b.og_title, b.og_description, b.og_image, b.author_pengurus_id, '
            . 'b.created_at, b.updated_at, k.nama AS kategori_nama, k.slug AS kategori_slug, p.nama AS author_nama';
    }

    /** Admin list dengan filter status / kategori / pencarian + pagination. */
    public function listAdmin(Request $request, Response $response): Response
    {
        try {
            $params = $request->getQueryParams();
            $q = TextSanitizer::cleanTextOrNull($params['q'] ?? null);
            $status = isset($params['status']) ? trim((string) $params['status']) : '';
            $kategoriId = isset($params['kategori_id']) && $params['kategori_id'] !== '' ? (int) $params['kategori_id'] : null;
            $page = max(1, (int) ($params['page'] ?? 1));
            $limit = min(100, max(1, (int) ($params['limit'] ?? 20)));
            $offset = ($page - 1) * $limit;

            $where = ['1=1'];
            $bind = [];
            if ($q !== null && $q !== '') {
                $where[] = '(b.judul LIKE ? OR b.slug LIKE ? OR b.ringkasan LIKE ?)';
                $like = '%' . $q . '%';
                $bind[] = $like;
                $bind[] = $like;
                $bind[] = $like;
            }
            if (in_array($status, ['draft', 'publish'], true)) {
                $where[] = 'b.status = ?';
                $bind[] = $status;
            }
            if ($kategoriId !== null) {
                $where[] = 'b.kategori_id = ?';
                $bind[] = $kategoriId;
            }
            $whereSql = implode(' AND ', $where);

            $countStmt = $this->db->prepare("SELECT COUNT(*) FROM `website___berita` b WHERE {$whereSql}");
            $countStmt->execute($bind);
            $total = (int) $countStmt->fetchColumn();

            $sql = 'SELECT ' . $this->selectColumns()
                . ' FROM `website___berita` b'
                . ' LEFT JOIN `website___kategori_berita` k ON k.id = b.kategori_id'
                . ' LEFT JOIN `pengurus` p ON p.id = b.author_pengurus_id'
                . " WHERE {$whereSql}"
                . ' ORDER BY (b.published_at IS NULL), b.published_at DESC, b.updated_at DESC'
                . ' LIMIT ' . $limit . ' OFFSET ' . $offset;
            $stmt = $this->db->prepare($sql);
            $stmt->execute($bind);
            $rows = array_map(fn ($r) => $this->mapRow($r), $stmt->fetchAll(\PDO::FETCH_ASSOC));

            return $this->json($response, [
                'success' => true,
                'data' => $rows,
                'pagination' => ['page' => $page, 'limit' => $limit, 'total' => $total],
            ]);
        } catch (\Throwable $e) {
            error_log('WebsiteBeritaController.listAdmin: ' . $e->getMessage());
            return $this->json($response, ['success' => false, 'message' => 'Gagal memuat berita'], 500);
        }
    }

    public function showAdmin(Request $request, Response $response, array $args): Response
    {
        try {
            $id = (int) ($args['id'] ?? 0);
            if ($id <= 0) {
                return $this->json($response, ['success' => false, 'message' => 'ID tidak valid'], 400);
            }
            $stmt = $this->db->prepare(
                'SELECT ' . $this->selectColumns()
                . ' FROM `website___berita` b'
                . ' LEFT JOIN `website___kategori_berita` k ON k.id = b.kategori_id'
                . ' LEFT JOIN `pengurus` p ON p.id = b.author_pengurus_id'
                . ' WHERE b.id = ? LIMIT 1'
            );
            $stmt->execute([$id]);
            $row = $stmt->fetch(\PDO::FETCH_ASSOC);
            if (!$row) {
                return $this->json($response, ['success' => false, 'message' => 'Berita tidak ditemukan'], 404);
            }
            return $this->json($response, ['success' => true, 'data' => $this->mapRow($row)]);
        } catch (\Throwable $e) {
            error_log('WebsiteBeritaController.showAdmin: ' . $e->getMessage());
            return $this->json($response, ['success' => false, 'message' => 'Gagal memuat berita'], 500);
        }
    }

    /**
     * @param array $body
     * @return array{judul:string,slug:string,ringkasan:?string,konten_html:?string,cover_url:?string,kategori_id:?int,status:string,published_at:?string,og_title:?string,og_description:?string,og_image:?string,error:?string}
     */
    private function parseBody(array $body, ?int $exceptId = null): array
    {
        $judul = TextSanitizer::cleanText((string) ($body['judul'] ?? ''));
        if ($judul === '') {
            return ['error' => 'Judul wajib diisi'] + array_fill_keys(
                ['judul', 'slug', 'ringkasan', 'konten_html', 'cover_url', 'kategori_id', 'status', 'published_at', 'og_title', 'og_description', 'og_image'],
                null
            );
        }
        $slug = WebsiteHelper::slugify(TextSanitizer::cleanTextOrNull($body['slug'] ?? null) ?? $judul);
        if ($slug === '') {
            $slug = WebsiteHelper::slugify($judul);
        }
        $slug = WebsiteHelper::uniqueSlugWithDateSuffix($this->db, 'website___berita', $slug, $exceptId);

        $ringkasan = TextSanitizer::cleanTextOrNull($body['ringkasan'] ?? null);
        $kontenHtml = isset($body['konten_html']) ? trim((string) $body['konten_html']) : null;
        if ($kontenHtml === '') {
            $kontenHtml = null;
        }
        $coverUrl = TextSanitizer::cleanTextOrNull($body['cover_url'] ?? null);
        $kategoriId = isset($body['kategori_id']) && $body['kategori_id'] !== '' ? (int) $body['kategori_id'] : null;
        $status = isset($body['status']) && in_array($body['status'], ['draft', 'publish'], true) ? $body['status'] : 'draft';
        $publishedAt = TextSanitizer::cleanTextOrNull($body['published_at'] ?? null);
        $ogTitle = TextSanitizer::cleanTextOrNull($body['og_title'] ?? null);
        $ogDescription = TextSanitizer::cleanTextOrNull($body['og_description'] ?? null);
        $ogImage = TextSanitizer::cleanTextOrNull($body['og_image'] ?? null);

        return [
            'judul' => $judul,
            'slug' => $slug,
            'ringkasan' => $ringkasan,
            'konten_html' => $kontenHtml,
            'cover_url' => $coverUrl,
            'kategori_id' => $kategoriId,
            'status' => $status,
            'published_at' => $publishedAt,
            'og_title' => $ogTitle,
            'og_description' => $ogDescription,
            'og_image' => $ogImage,
            'error' => null,
        ];
    }

    public function create(Request $request, Response $response): Response
    {
        $user = (array) ($request->getAttribute('user') ?? []);
        if (!WebsiteHelper::canWriteModule($this->db, $user, 'menu.website.berita')) {
            return $this->json($response, ['success' => false, 'message' => 'Akses ditolak'], 403);
        }
        try {
            $body = (array) $request->getParsedBody();
            $parsed = $this->parseBody($body);
            if (!empty($parsed['error'])) {
                return $this->json($response, ['success' => false, 'message' => $parsed['error']], 400);
            }
            // Untuk role tanpa aksi publish, paksa draft.
            if ($parsed['status'] === 'publish' && !WebsiteHelper::hasAction($this->db, $user, 'action.website.berita.publish')) {
                $parsed['status'] = 'draft';
            }
            // published_at otomatis kalau publish & belum ada
            if ($parsed['status'] === 'publish' && empty($parsed['published_at'])) {
                $parsed['published_at'] = (new \DateTime('now', new \DateTimeZone('Asia/Jakarta')))->format('Y-m-d H:i:s');
            }

            $author = RoleHelper::getPengurusIdFromPayload($user);

            $stmt = $this->db->prepare(
                'INSERT INTO `website___berita` '
                . '(slug, judul, ringkasan, konten_html, cover_url, kategori_id, status, published_at, og_title, og_description, og_image, author_pengurus_id) '
                . 'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
            );
            $stmt->execute([
                $parsed['slug'],
                $parsed['judul'],
                $parsed['ringkasan'],
                $parsed['konten_html'],
                $parsed['cover_url'],
                $parsed['kategori_id'],
                $parsed['status'],
                $parsed['published_at'],
                $parsed['og_title'],
                $parsed['og_description'],
                $parsed['og_image'],
                $author,
            ]);
            return $this->json($response, ['success' => true, 'data' => ['id' => (int) $this->db->lastInsertId(), 'slug' => $parsed['slug']]], 201);
        } catch (\Throwable $e) {
            error_log('WebsiteBeritaController.create: ' . $e->getMessage());
            return $this->json($response, ['success' => false, 'message' => 'Gagal menyimpan berita'], 500);
        }
    }

    public function update(Request $request, Response $response, array $args): Response
    {
        $user = (array) ($request->getAttribute('user') ?? []);
        if (!WebsiteHelper::canWriteModule($this->db, $user, 'menu.website.berita')) {
            return $this->json($response, ['success' => false, 'message' => 'Akses ditolak'], 403);
        }
        try {
            $id = (int) ($args['id'] ?? 0);
            if ($id <= 0) {
                return $this->json($response, ['success' => false, 'message' => 'ID tidak valid'], 400);
            }
            $cur = $this->db->prepare('SELECT status FROM `website___berita` WHERE id = ? LIMIT 1');
            $cur->execute([$id]);
            $curRow = $cur->fetch(\PDO::FETCH_ASSOC);
            if (!$curRow) {
                return $this->json($response, ['success' => false, 'message' => 'Berita tidak ditemukan'], 404);
            }

            $body = (array) $request->getParsedBody();
            $parsed = $this->parseBody($body, $id);
            if (!empty($parsed['error'])) {
                return $this->json($response, ['success' => false, 'message' => $parsed['error']], 400);
            }
            // Cek aksi publish bila status berubah ke publish
            $statusChangedToPublish = $parsed['status'] === 'publish' && $curRow['status'] !== 'publish';
            if ($statusChangedToPublish && !WebsiteHelper::hasAction($this->db, $user, 'action.website.berita.publish')) {
                return $this->json($response, ['success' => false, 'message' => 'Tidak punya hak publikasikan berita'], 403);
            }
            if ($parsed['status'] === 'publish' && empty($parsed['published_at'])) {
                $parsed['published_at'] = (new \DateTime('now', new \DateTimeZone('Asia/Jakarta')))->format('Y-m-d H:i:s');
            }

            $stmt = $this->db->prepare(
                'UPDATE `website___berita` SET '
                . 'slug = ?, judul = ?, ringkasan = ?, konten_html = ?, cover_url = ?, kategori_id = ?, '
                . 'status = ?, published_at = ?, og_title = ?, og_description = ?, og_image = ? '
                . 'WHERE id = ?'
            );
            $stmt->execute([
                $parsed['slug'],
                $parsed['judul'],
                $parsed['ringkasan'],
                $parsed['konten_html'],
                $parsed['cover_url'],
                $parsed['kategori_id'],
                $parsed['status'],
                $parsed['published_at'],
                $parsed['og_title'],
                $parsed['og_description'],
                $parsed['og_image'],
                $id,
            ]);
            return $this->json($response, ['success' => true, 'data' => ['id' => $id, 'slug' => $parsed['slug']]]);
        } catch (\Throwable $e) {
            error_log('WebsiteBeritaController.update: ' . $e->getMessage());
            return $this->json($response, ['success' => false, 'message' => 'Gagal mengubah berita'], 500);
        }
    }

    public function delete(Request $request, Response $response, array $args): Response
    {
        $user = (array) ($request->getAttribute('user') ?? []);
        if (!WebsiteHelper::hasAction($this->db, $user, 'action.website.berita.hapus')) {
            return $this->json($response, ['success' => false, 'message' => 'Tidak punya hak hapus berita'], 403);
        }
        try {
            $id = (int) ($args['id'] ?? 0);
            if ($id <= 0) {
                return $this->json($response, ['success' => false, 'message' => 'ID tidak valid'], 400);
            }
            $stmt = $this->db->prepare('DELETE FROM `website___berita` WHERE id = ?');
            $stmt->execute([$id]);
            return $this->json($response, ['success' => true]);
        } catch (\Throwable $e) {
            error_log('WebsiteBeritaController.delete: ' . $e->getMessage());
            return $this->json($response, ['success' => false, 'message' => 'Gagal menghapus berita'], 500);
        }
    }

    /** Public list: hanya status publish + pagination + filter kategori. */
    public function listPublic(Request $request, Response $response): Response
    {
        try {
            $params = $request->getQueryParams();
            $q = TextSanitizer::cleanTextOrNull($params['q'] ?? null);
            $kategoriSlug = TextSanitizer::cleanTextOrNull($params['kategori'] ?? null);
            $page = max(1, (int) ($params['page'] ?? 1));
            $limit = min(50, max(1, (int) ($params['limit'] ?? 12)));
            $offset = ($page - 1) * $limit;

            $where = ["b.status = 'publish'", '(b.published_at IS NULL OR b.published_at <= NOW())'];
            $bind = [];
            if ($q !== null && $q !== '') {
                $where[] = '(b.judul LIKE ? OR b.ringkasan LIKE ?)';
                $bind[] = '%' . $q . '%';
                $bind[] = '%' . $q . '%';
            }
            if ($kategoriSlug !== null && $kategoriSlug !== '') {
                $where[] = 'k.slug = ?';
                $bind[] = $kategoriSlug;
            }
            $whereSql = implode(' AND ', $where);

            $countStmt = $this->db->prepare(
                'SELECT COUNT(*) FROM `website___berita` b'
                . ' LEFT JOIN `website___kategori_berita` k ON k.id = b.kategori_id'
                . " WHERE {$whereSql}"
            );
            $countStmt->execute($bind);
            $total = (int) $countStmt->fetchColumn();

            $sql = 'SELECT ' . $this->selectColumns()
                . ' FROM `website___berita` b'
                . ' LEFT JOIN `website___kategori_berita` k ON k.id = b.kategori_id'
                . ' LEFT JOIN `pengurus` p ON p.id = b.author_pengurus_id'
                . " WHERE {$whereSql}"
                . ' ORDER BY b.published_at DESC, b.id DESC'
                . ' LIMIT ' . $limit . ' OFFSET ' . $offset;
            $stmt = $this->db->prepare($sql);
            $stmt->execute($bind);
            $rows = array_map(fn ($r) => $this->mapRow($r), $stmt->fetchAll(\PDO::FETCH_ASSOC));
            return $this->json($response, [
                'success' => true,
                'data' => $rows,
                'pagination' => ['page' => $page, 'limit' => $limit, 'total' => $total],
            ]);
        } catch (\Throwable $e) {
            error_log('WebsiteBeritaController.listPublic: ' . $e->getMessage());
            return $this->json($response, ['success' => false, 'message' => 'Gagal memuat berita'], 500);
        }
    }

    public function detailPublic(Request $request, Response $response, array $args): Response
    {
        try {
            $slug = trim((string) ($args['slug'] ?? ''));
            if ($slug === '') {
                return $this->json($response, ['success' => false, 'message' => 'Slug kosong'], 400);
            }
            $stmt = $this->db->prepare(
                'SELECT ' . $this->selectColumns()
                . ' FROM `website___berita` b'
                . ' LEFT JOIN `website___kategori_berita` k ON k.id = b.kategori_id'
                . ' LEFT JOIN `pengurus` p ON p.id = b.author_pengurus_id'
                . " WHERE b.slug = ? AND b.status = 'publish' AND (b.published_at IS NULL OR b.published_at <= NOW())"
                . ' LIMIT 1'
            );
            $stmt->execute([$slug]);
            $row = $stmt->fetch(\PDO::FETCH_ASSOC);
            if (!$row) {
                return $this->json($response, ['success' => false, 'message' => 'Berita tidak ditemukan'], 404);
            }
            return $this->json($response, ['success' => true, 'data' => $this->mapRow($row)]);
        } catch (\Throwable $e) {
            error_log('WebsiteBeritaController.detailPublic: ' . $e->getMessage());
            return $this->json($response, ['success' => false, 'message' => 'Gagal memuat berita'], 500);
        }
    }
}

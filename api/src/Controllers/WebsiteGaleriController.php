<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Database;
use App\Helpers\TextSanitizer;
use App\Helpers\WebsiteHelper;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;

/** CRUD foto galeri (kategori dipisah di WebsiteKategoriGaleriController). */
class WebsiteGaleriController
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
            'judul' => $r['judul'] ?? '',
            'deskripsi' => $r['deskripsi'] ?? null,
            'gambar_url' => $r['gambar_url'] ?? '',
            'kategori_id' => isset($r['kategori_id']) ? (int) $r['kategori_id'] : null,
            'kategori_slug' => $r['kategori_slug'] ?? null,
            'kategori_nama' => $r['kategori_nama'] ?? null,
            'urutan' => isset($r['urutan']) ? (int) $r['urutan'] : 0,
            'aktif' => isset($r['aktif']) ? (bool) (int) $r['aktif'] : false,
            'created_at' => $r['created_at'] ?? null,
            'updated_at' => $r['updated_at'] ?? null,
        ];
    }

    private function selectColumns(): string
    {
        return 'g.id, g.judul, g.deskripsi, g.gambar_url, g.kategori_id, g.urutan, g.aktif, '
            . 'g.created_at, g.updated_at, k.nama AS kategori_nama, k.slug AS kategori_slug';
    }

    public function listAdmin(Request $request, Response $response): Response
    {
        try {
            $params = $request->getQueryParams();
            $kategoriId = isset($params['kategori_id']) && $params['kategori_id'] !== '' ? (int) $params['kategori_id'] : null;
            $sql = 'SELECT ' . $this->selectColumns()
                . ' FROM `website___galeri` g LEFT JOIN `website___kategori_galeri` k ON k.id = g.kategori_id WHERE 1=1';
            $bind = [];
            if ($kategoriId !== null) {
                $sql .= ' AND g.kategori_id = ?';
                $bind[] = $kategoriId;
            }
            $sql .= ' ORDER BY g.urutan ASC, g.id DESC';
            $stmt = $this->db->prepare($sql);
            $stmt->execute($bind);
            $rows = array_map(fn ($r) => $this->mapRow($r), $stmt->fetchAll(\PDO::FETCH_ASSOC));
            return $this->json($response, ['success' => true, 'data' => $rows]);
        } catch (\Throwable $e) {
            error_log('WebsiteGaleriController.listAdmin: ' . $e->getMessage());
            return $this->json($response, ['success' => false, 'message' => 'Gagal memuat galeri'], 500);
        }
    }

    public function listPublic(Request $request, Response $response): Response
    {
        try {
            $params = $request->getQueryParams();
            $kategoriSlug = TextSanitizer::cleanTextOrNull($params['kategori'] ?? null);
            $sql = 'SELECT ' . $this->selectColumns()
                . ' FROM `website___galeri` g LEFT JOIN `website___kategori_galeri` k ON k.id = g.kategori_id WHERE g.aktif = 1';
            $bind = [];
            if ($kategoriSlug !== null && $kategoriSlug !== '') {
                $sql .= ' AND k.slug = ?';
                $bind[] = $kategoriSlug;
            }
            $sql .= ' ORDER BY g.urutan ASC, g.id DESC';
            $stmt = $this->db->prepare($sql);
            $stmt->execute($bind);
            $rows = array_map(fn ($r) => $this->mapRow($r), $stmt->fetchAll(\PDO::FETCH_ASSOC));
            return $this->json($response, ['success' => true, 'data' => $rows]);
        } catch (\Throwable $e) {
            error_log('WebsiteGaleriController.listPublic: ' . $e->getMessage());
            return $this->json($response, ['success' => false, 'message' => 'Gagal memuat galeri'], 500);
        }
    }

    /** @return array{judul:string,gambar_url:string,deskripsi:?string,kategori_id:?int,urutan:int,aktif:int,error:?string} */
    private function parseBody(array $body): array
    {
        $judul = TextSanitizer::cleanText((string) ($body['judul'] ?? ''));
        if ($judul === '') {
            return ['error' => 'Judul wajib diisi'] + array_fill_keys(['judul', 'gambar_url', 'deskripsi', 'kategori_id', 'urutan', 'aktif'], null);
        }
        $gambar = TextSanitizer::cleanText((string) ($body['gambar_url'] ?? ''));
        if ($gambar === '') {
            return ['error' => 'Gambar URL wajib diisi'] + array_fill_keys(['judul', 'gambar_url', 'deskripsi', 'kategori_id', 'urutan', 'aktif'], null);
        }
        return [
            'judul' => $judul,
            'gambar_url' => $gambar,
            'deskripsi' => TextSanitizer::cleanTextOrNull($body['deskripsi'] ?? null),
            'kategori_id' => isset($body['kategori_id']) && $body['kategori_id'] !== '' ? (int) $body['kategori_id'] : null,
            'urutan' => (int) ($body['urutan'] ?? 0),
            'aktif' => isset($body['aktif']) ? (int) (bool) $body['aktif'] : 1,
            'error' => null,
        ];
    }

    public function create(Request $request, Response $response): Response
    {
        $user = (array) ($request->getAttribute('user') ?? []);
        if (!WebsiteHelper::hasAction($this->db, $user, 'action.website.galeri.kelola')) {
            return $this->json($response, ['success' => false, 'message' => 'Tidak punya hak kelola galeri'], 403);
        }
        try {
            $parsed = $this->parseBody((array) $request->getParsedBody());
            if (!empty($parsed['error'])) {
                return $this->json($response, ['success' => false, 'message' => $parsed['error']], 400);
            }
            $stmt = $this->db->prepare('INSERT INTO `website___galeri` (judul, deskripsi, gambar_url, kategori_id, urutan, aktif) VALUES (?, ?, ?, ?, ?, ?)');
            $stmt->execute([$parsed['judul'], $parsed['deskripsi'], $parsed['gambar_url'], $parsed['kategori_id'], $parsed['urutan'], $parsed['aktif']]);
            return $this->json($response, ['success' => true, 'data' => ['id' => (int) $this->db->lastInsertId()]], 201);
        } catch (\Throwable $e) {
            error_log('WebsiteGaleriController.create: ' . $e->getMessage());
            return $this->json($response, ['success' => false, 'message' => 'Gagal menyimpan galeri'], 500);
        }
    }

    public function update(Request $request, Response $response, array $args): Response
    {
        $user = (array) ($request->getAttribute('user') ?? []);
        if (!WebsiteHelper::hasAction($this->db, $user, 'action.website.galeri.kelola')) {
            return $this->json($response, ['success' => false, 'message' => 'Tidak punya hak kelola galeri'], 403);
        }
        try {
            $id = (int) ($args['id'] ?? 0);
            if ($id <= 0) {
                return $this->json($response, ['success' => false, 'message' => 'ID tidak valid'], 400);
            }
            $parsed = $this->parseBody((array) $request->getParsedBody());
            if (!empty($parsed['error'])) {
                return $this->json($response, ['success' => false, 'message' => $parsed['error']], 400);
            }
            $stmt = $this->db->prepare('UPDATE `website___galeri` SET judul = ?, deskripsi = ?, gambar_url = ?, kategori_id = ?, urutan = ?, aktif = ? WHERE id = ?');
            $stmt->execute([$parsed['judul'], $parsed['deskripsi'], $parsed['gambar_url'], $parsed['kategori_id'], $parsed['urutan'], $parsed['aktif'], $id]);
            return $this->json($response, ['success' => true, 'data' => ['id' => $id]]);
        } catch (\Throwable $e) {
            error_log('WebsiteGaleriController.update: ' . $e->getMessage());
            return $this->json($response, ['success' => false, 'message' => 'Gagal mengubah galeri'], 500);
        }
    }

    public function delete(Request $request, Response $response, array $args): Response
    {
        $user = (array) ($request->getAttribute('user') ?? []);
        if (!WebsiteHelper::hasAction($this->db, $user, 'action.website.galeri.kelola')) {
            return $this->json($response, ['success' => false, 'message' => 'Tidak punya hak kelola galeri'], 403);
        }
        try {
            $id = (int) ($args['id'] ?? 0);
            if ($id <= 0) {
                return $this->json($response, ['success' => false, 'message' => 'ID tidak valid'], 400);
            }
            $stmt = $this->db->prepare('DELETE FROM `website___galeri` WHERE id = ?');
            $stmt->execute([$id]);
            return $this->json($response, ['success' => true]);
        } catch (\Throwable $e) {
            error_log('WebsiteGaleriController.delete: ' . $e->getMessage());
            return $this->json($response, ['success' => false, 'message' => 'Gagal menghapus galeri'], 500);
        }
    }
}

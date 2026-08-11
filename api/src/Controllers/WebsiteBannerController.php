<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Database;
use App\Helpers\TextSanitizer;
use App\Helpers\WebsiteHelper;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;

/** CRUD banner beranda web publik. Tulis/hapus butuh action.website.banner.kelola. */
class WebsiteBannerController
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
            'gambar_url' => $r['gambar_url'] ?? '',
            'link_url' => $r['link_url'] ?? null,
            'urutan' => isset($r['urutan']) ? (int) $r['urutan'] : 0,
            'aktif' => isset($r['aktif']) ? (bool) (int) $r['aktif'] : false,
            'periode_mulai' => $r['periode_mulai'] ?? null,
            'periode_akhir' => $r['periode_akhir'] ?? null,
            'created_at' => $r['created_at'] ?? null,
            'updated_at' => $r['updated_at'] ?? null,
        ];
    }

    public function listAdmin(Request $request, Response $response): Response
    {
        try {
            $stmt = $this->db->query('SELECT id, judul, gambar_url, link_url, urutan, aktif, periode_mulai, periode_akhir, created_at, updated_at FROM `website___banner` ORDER BY urutan ASC, id ASC');
            $rows = array_map(fn ($r) => $this->mapRow($r), $stmt->fetchAll(\PDO::FETCH_ASSOC));
            return $this->json($response, ['success' => true, 'data' => $rows]);
        } catch (\Throwable $e) {
            error_log('WebsiteBannerController.listAdmin: ' . $e->getMessage());
            return $this->json($response, ['success' => false, 'message' => 'Gagal memuat banner'], 500);
        }
    }

    public function listPublic(Request $request, Response $response): Response
    {
        try {
            $today = (new \DateTime('now', new \DateTimeZone('Asia/Jakarta')))->format('Y-m-d');
            $stmt = $this->db->prepare(
                'SELECT id, judul, gambar_url, link_url, urutan, aktif, periode_mulai, periode_akhir, created_at, updated_at '
                . 'FROM `website___banner` '
                . 'WHERE aktif = 1 '
                . 'AND (periode_mulai IS NULL OR periode_mulai <= ?) '
                . 'AND (periode_akhir IS NULL OR periode_akhir >= ?) '
                . 'ORDER BY urutan ASC, id ASC'
            );
            $stmt->execute([$today, $today]);
            $rows = array_map(fn ($r) => $this->mapRow($r), $stmt->fetchAll(\PDO::FETCH_ASSOC));
            return $this->json($response, ['success' => true, 'data' => $rows]);
        } catch (\Throwable $e) {
            error_log('WebsiteBannerController.listPublic: ' . $e->getMessage());
            return $this->json($response, ['success' => false, 'message' => 'Gagal memuat banner'], 500);
        }
    }

    /** @return array{judul:string,gambar_url:string,link_url:?string,urutan:int,aktif:int,periode_mulai:?string,periode_akhir:?string,error:?string} */
    private function parseBody(array $body): array
    {
        $judul = TextSanitizer::cleanText((string) ($body['judul'] ?? ''));
        if ($judul === '') {
            return ['error' => 'Judul wajib diisi'] + array_fill_keys(['judul', 'gambar_url', 'link_url', 'urutan', 'aktif', 'periode_mulai', 'periode_akhir'], null);
        }
        $gambarUrl = TextSanitizer::cleanText((string) ($body['gambar_url'] ?? ''));
        if ($gambarUrl === '') {
            return ['error' => 'Gambar URL wajib diisi'] + array_fill_keys(['judul', 'gambar_url', 'link_url', 'urutan', 'aktif', 'periode_mulai', 'periode_akhir'], null);
        }
        return [
            'judul' => $judul,
            'gambar_url' => $gambarUrl,
            'link_url' => TextSanitizer::cleanTextOrNull($body['link_url'] ?? null),
            'urutan' => (int) ($body['urutan'] ?? 0),
            'aktif' => isset($body['aktif']) ? (int) (bool) $body['aktif'] : 1,
            'periode_mulai' => TextSanitizer::cleanTextOrNull($body['periode_mulai'] ?? null),
            'periode_akhir' => TextSanitizer::cleanTextOrNull($body['periode_akhir'] ?? null),
            'error' => null,
        ];
    }

    public function create(Request $request, Response $response): Response
    {
        $user = (array) ($request->getAttribute('user') ?? []);
        if (!WebsiteHelper::hasAction($this->db, $user, 'action.website.banner.kelola')) {
            return $this->json($response, ['success' => false, 'message' => 'Tidak punya hak kelola banner'], 403);
        }
        try {
            $parsed = $this->parseBody((array) $request->getParsedBody());
            if (!empty($parsed['error'])) {
                return $this->json($response, ['success' => false, 'message' => $parsed['error']], 400);
            }
            $stmt = $this->db->prepare('INSERT INTO `website___banner` (judul, gambar_url, link_url, urutan, aktif, periode_mulai, periode_akhir) VALUES (?, ?, ?, ?, ?, ?, ?)');
            $stmt->execute([$parsed['judul'], $parsed['gambar_url'], $parsed['link_url'], $parsed['urutan'], $parsed['aktif'], $parsed['periode_mulai'], $parsed['periode_akhir']]);
            return $this->json($response, ['success' => true, 'data' => ['id' => (int) $this->db->lastInsertId()]], 201);
        } catch (\Throwable $e) {
            error_log('WebsiteBannerController.create: ' . $e->getMessage());
            return $this->json($response, ['success' => false, 'message' => 'Gagal menyimpan banner'], 500);
        }
    }

    public function update(Request $request, Response $response, array $args): Response
    {
        $user = (array) ($request->getAttribute('user') ?? []);
        if (!WebsiteHelper::hasAction($this->db, $user, 'action.website.banner.kelola')) {
            return $this->json($response, ['success' => false, 'message' => 'Tidak punya hak kelola banner'], 403);
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
            $stmt = $this->db->prepare('UPDATE `website___banner` SET judul = ?, gambar_url = ?, link_url = ?, urutan = ?, aktif = ?, periode_mulai = ?, periode_akhir = ? WHERE id = ?');
            $stmt->execute([$parsed['judul'], $parsed['gambar_url'], $parsed['link_url'], $parsed['urutan'], $parsed['aktif'], $parsed['periode_mulai'], $parsed['periode_akhir'], $id]);
            return $this->json($response, ['success' => true, 'data' => ['id' => $id]]);
        } catch (\Throwable $e) {
            error_log('WebsiteBannerController.update: ' . $e->getMessage());
            return $this->json($response, ['success' => false, 'message' => 'Gagal mengubah banner'], 500);
        }
    }

    public function delete(Request $request, Response $response, array $args): Response
    {
        $user = (array) ($request->getAttribute('user') ?? []);
        if (!WebsiteHelper::hasAction($this->db, $user, 'action.website.banner.kelola')) {
            return $this->json($response, ['success' => false, 'message' => 'Tidak punya hak kelola banner'], 403);
        }
        try {
            $id = (int) ($args['id'] ?? 0);
            if ($id <= 0) {
                return $this->json($response, ['success' => false, 'message' => 'ID tidak valid'], 400);
            }
            $stmt = $this->db->prepare('DELETE FROM `website___banner` WHERE id = ?');
            $stmt->execute([$id]);
            return $this->json($response, ['success' => true]);
        } catch (\Throwable $e) {
            error_log('WebsiteBannerController.delete: ' . $e->getMessage());
            return $this->json($response, ['success' => false, 'message' => 'Gagal menghapus banner'], 500);
        }
    }
}

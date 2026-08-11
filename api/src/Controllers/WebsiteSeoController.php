<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Database;
use App\Helpers\TextSanitizer;
use App\Helpers\WebsiteHelper;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;

/**
 * SEO global web publik (key-value di `website___seo_global`).
 * Hanya satu set; ubah butuh action.website.seo.ubah.
 */
class WebsiteSeoController
{
    private \PDO $db;

    private const ALLOWED_KEYS = [
        'site_title',
        'site_description',
        'site_keywords',
        'og_default_title',
        'og_default_description',
        'og_default_image',
        'twitter_handle',
        'favicon_url',
    ];

    public function __construct()
    {
        $this->db = Database::getInstance()->getConnection();
    }

    private function json(Response $response, array $data, int $status = 200): Response
    {
        $response->getBody()->write(json_encode($data, JSON_UNESCAPED_UNICODE));
        return $response->withStatus($status)->withHeader('Content-Type', 'application/json; charset=utf-8');
    }

    private function fetchAll(): array
    {
        $stmt = $this->db->query('SELECT `key`, `value`, `updated_at` FROM `website___seo_global`');
        $rows = $stmt->fetchAll(\PDO::FETCH_ASSOC);
        $out = [];
        foreach ($rows as $r) {
            $out[$r['key']] = $r['value'] ?? '';
        }
        // Pastikan semua key default ada
        foreach (self::ALLOWED_KEYS as $k) {
            if (!array_key_exists($k, $out)) {
                $out[$k] = '';
            }
        }
        return $out;
    }

    /** Public: GET /api/public/website/seo */
    public function getPublic(Request $request, Response $response): Response
    {
        try {
            return $this->json($response, ['success' => true, 'data' => $this->fetchAll()]);
        } catch (\Throwable $e) {
            error_log('WebsiteSeoController.getPublic: ' . $e->getMessage());
            return $this->json($response, ['success' => false, 'message' => 'Gagal memuat SEO'], 500);
        }
    }

    /** Admin GET = sama isi dengan public, tetap tertutup AuthMiddleware. */
    public function getAdmin(Request $request, Response $response): Response
    {
        return $this->getPublic($request, $response);
    }

    public function update(Request $request, Response $response): Response
    {
        $user = (array) ($request->getAttribute('user') ?? []);
        if (!WebsiteHelper::hasAction($this->db, $user, 'action.website.seo.ubah')) {
            return $this->json($response, ['success' => false, 'message' => 'Tidak punya hak ubah SEO'], 403);
        }
        try {
            $body = (array) $request->getParsedBody();
            $stmt = $this->db->prepare('INSERT INTO `website___seo_global` (`key`, `value`) VALUES (?, ?) ON DUPLICATE KEY UPDATE `value` = VALUES(`value`)');
            foreach (self::ALLOWED_KEYS as $key) {
                if (!array_key_exists($key, $body)) {
                    continue;
                }
                $val = TextSanitizer::cleanTextOrNull((string) $body[$key]) ?? '';
                $stmt->execute([$key, $val]);
            }
            return $this->json($response, ['success' => true, 'data' => $this->fetchAll()]);
        } catch (\Throwable $e) {
            error_log('WebsiteSeoController.update: ' . $e->getMessage());
            return $this->json($response, ['success' => false, 'message' => 'Gagal menyimpan SEO'], 500);
        }
    }
}

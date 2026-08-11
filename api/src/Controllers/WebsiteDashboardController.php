<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Database;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;

/**
 * Ringkasan untuk halaman Dashboard Website (admin) dan data sitemap untuk Astro (public).
 */
class WebsiteDashboardController
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

    /** GET /api/website/dashboard (admin). */
    public function summary(Request $request, Response $response): Response
    {
        try {
            $beritaPublish = (int) $this->db->query("SELECT COUNT(*) FROM `website___berita` WHERE status = 'publish'")->fetchColumn();
            $beritaDraft = (int) $this->db->query("SELECT COUNT(*) FROM `website___berita` WHERE status = 'draft'")->fetchColumn();
            $today = (new \DateTime('now', new \DateTimeZone('Asia/Jakarta')))->format('Y-m-d');
            $bannerStmt = $this->db->prepare(
                'SELECT COUNT(*) FROM `website___banner` WHERE aktif = 1 '
                . 'AND (periode_mulai IS NULL OR periode_mulai <= ?) '
                . 'AND (periode_akhir IS NULL OR periode_akhir >= ?)'
            );
            $bannerStmt->execute([$today, $today]);
            $bannerAktif = (int) $bannerStmt->fetchColumn();
            $halamanCount = (int) $this->db->query('SELECT COUNT(*) FROM `website___halaman`')->fetchColumn();
            $galeriAktif = (int) $this->db->query('SELECT COUNT(*) FROM `website___galeri` WHERE aktif = 1')->fetchColumn();

            $latestBerita = $this->db->query(
                "SELECT id, slug, judul, status, published_at, updated_at FROM `website___berita` "
                . 'ORDER BY updated_at DESC LIMIT 5'
            )->fetchAll(\PDO::FETCH_ASSOC);

            $latestHalaman = $this->db->query(
                'SELECT id, slug, judul, status, updated_at FROM `website___halaman` '
                . 'ORDER BY updated_at DESC LIMIT 5'
            )->fetchAll(\PDO::FETCH_ASSOC);

            return $this->json($response, [
                'success' => true,
                'data' => [
                    'berita_publish' => $beritaPublish,
                    'berita_draft' => $beritaDraft,
                    'banner_aktif' => $bannerAktif,
                    'halaman_count' => $halamanCount,
                    'galeri_aktif' => $galeriAktif,
                    'latest_berita' => $latestBerita,
                    'latest_halaman' => $latestHalaman,
                ],
            ]);
        } catch (\Throwable $e) {
            error_log('WebsiteDashboardController.summary: ' . $e->getMessage());
            return $this->json($response, ['success' => false, 'message' => 'Gagal memuat ringkasan'], 500);
        }
    }

    /**
     * GET /api/public/website/sitemap — daftar slug + lastmod untuk Astro sitemap.
     * Tanpa auth. Hanya entri publish.
     */
    public function sitemap(Request $request, Response $response): Response
    {
        try {
            $berita = $this->db->query(
                "SELECT slug, GREATEST(COALESCE(published_at, '1970-01-01'), updated_at) AS lastmod "
                . "FROM `website___berita` WHERE status = 'publish'"
            )->fetchAll(\PDO::FETCH_ASSOC);

            $halaman = $this->db->query(
                "SELECT slug, updated_at AS lastmod FROM `website___halaman` WHERE status = 'publish'"
            )->fetchAll(\PDO::FETCH_ASSOC);

            $kategoriBerita = $this->db->query(
                'SELECT slug, updated_at AS lastmod FROM `website___kategori_berita` WHERE aktif = 1'
            )->fetchAll(\PDO::FETCH_ASSOC);

            return $this->json($response, [
                'success' => true,
                'data' => [
                    'berita' => $berita,
                    'halaman' => $halaman,
                    'kategori_berita' => $kategoriBerita,
                ],
            ]);
        } catch (\Throwable $e) {
            error_log('WebsiteDashboardController.sitemap: ' . $e->getMessage());
            return $this->json($response, ['success' => false, 'message' => 'Gagal memuat sitemap'], 500);
        }
    }
}

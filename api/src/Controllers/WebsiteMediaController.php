<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Database;
use App\Helpers\WebsiteHelper;
use App\Helpers\WebsiteImageProcessor;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;

/**
 * Unggahan gambar modul Website → struktur uploads/website/… (publik lewat gambar.* atau /api/public/website/asset/…).
 */
class WebsiteMediaController
{
    private const CONTEXT_SUBDIR = [
        'berita_cover' => 'berita/cover',
        'berita_konten' => 'berita/konten',
        'galeri' => 'galeri/foto',
        'banner' => 'banner',
        'seo_og' => 'seo/og-default',
        'seo_favicon' => 'seo/favicon',
        'default' => 'lainnya',
    ];

    private \PDO $db;

    private string $uploadsPath;

    public function __construct()
    {
        $this->db = Database::getInstance()->getConnection();
        $config = require __DIR__ . '/../../config.php';
        $base = rtrim($config['uploads_base_path'] ?? __DIR__ . '/../..', '/\\');
        $folder = $config['uploads_folder'] ?? 'uploads';
        $this->uploadsPath = $base . '/' . trim($folder, '/\\');
    }

    private function json(Response $response, array $data, int $status = 200): Response
    {
        $response->getBody()->write(json_encode($data, JSON_UNESCAPED_UNICODE));
        return $response->withStatus($status)->withHeader('Content-Type', 'application/json; charset=utf-8');
    }

    private function websiteMediaConfig(): array
    {
        $config = require __DIR__ . '/../../config.php';

        return $config['website_media'] ?? [];
    }

    /**
     * Folder induk semua file website di disk: …/uploads/website.
     * Urutan: WEBSITE_MEDIA_DISK_ROOT (CDN) → folder upload API (fallback jika CDN tidak writable).
     */
    private function websiteMediaFsRootCandidates(): array
    {
        $wm = $this->websiteMediaConfig();
        $diskRoot = trim((string) ($wm['disk_root'] ?? ''));
        $candidates = [];
        if ($diskRoot !== '') {
            $candidates[] = rtrim($diskRoot, '/\\') . DIRECTORY_SEPARATOR . 'uploads' . DIRECTORY_SEPARATOR . 'website';
        }
        $candidates[] = $this->uploadsPath . DIRECTORY_SEPARATOR . 'website';

        return array_values(array_unique($candidates));
    }

    private function websiteMediaFsRoot(): string
    {
        foreach ($this->websiteMediaFsRootCandidates() as $root) {
            if (is_dir($root)) {
                return $root;
            }
        }

        return $this->uploadsPath . DIRECTORY_SEPARATOR . 'website';
    }

    /**
     * Pilih root yang bisa ditulis; $useCdnUrl true hanya bila simpan di disk CDN (gambar.*).
     *
     * @return array{root: string, use_cdn_url: bool}
     */
    private function resolveWritableWebsiteRoot(): array
    {
        $wm = $this->websiteMediaConfig();
        $diskRoot = trim((string) ($wm['disk_root'] ?? ''));
        $cdnBase = rtrim((string) ($wm['public_base_url'] ?? ''), '/');
        $cdnRootPath = $diskRoot !== ''
            ? rtrim($diskRoot, '/\\') . DIRECTORY_SEPARATOR . 'uploads' . DIRECTORY_SEPARATOR . 'website'
            : null;

        foreach ($this->websiteMediaFsRootCandidates() as $root) {
            if (!$this->ensureWritableTree($root)) {
                continue;
            }
            $useCdn = $cdnBase !== '' && $cdnRootPath !== null && $this->pathsEqual($root, $cdnRootPath);

            return ['root' => $root, 'use_cdn_url' => $useCdn];
        }

        throw new \RuntimeException(
            'Folder unggahan website tidak dapat ditulis. '
            . 'Buat & chmod folder gambar/uploads/website (775) atau periksa izin uploads API.'
        );
    }

    private function pathsEqual(string $a, string $b): bool
    {
        $ra = realpath($a);
        $rb = realpath($b);
        if ($ra !== false && $rb !== false) {
            return $ra === $rb;
        }

        return rtrim(str_replace('\\', '/', $a), '/') === rtrim(str_replace('\\', '/', $b), '/');
    }

    /** Buat folder induk bila perlu; true jika akhirnya writable. */
    private function ensureWritableTree(string $root): bool
    {
        if (!is_dir($root)) {
            if (!@mkdir($root, 0755, true) && !is_dir($root)) {
                return false;
            }
        }

        return is_dir($root) && is_writable($root);
    }

    private function normalizeContext(string $raw): string
    {
        $c = strtolower(trim($raw));
        if ($c === '') {
            return 'default';
        }
        if (!isset(self::CONTEXT_SUBDIR[$c])) {
            return 'default';
        }

        return $c;
    }

    /** Relatif terhadap folder …/uploads/website di disk (tanpa prefix "website/"). */
    private function relativeUrlPath(string $context, string $filename): string
    {
        $sub = self::CONTEXT_SUBDIR[$context] ?? self::CONTEXT_SUBDIR['default'];

        return $sub . '/' . $filename;
    }

    /** Ekstensi file aman dari MIME (whitelist gambar website). */
    private function extensionFromMime(string $mime): string
    {
        return match (strtolower($mime)) {
            'image/jpeg', 'image/jpg' => 'jpg',
            'image/png' => 'png',
            'image/gif' => 'gif',
            'image/webp' => 'webp',
            default => 'jpg',
        };
    }

    /** URL absolut untuk klien (gambar.alutsmani.id/uploads/website/… atau API). */
    private function publicAssetUrl(string $relativeUnderWebsite, bool $useCdnUrl = true): string
    {
        $config = require __DIR__ . '/../../config.php';
        $wm = $config['website_media'] ?? [];
        $publicBase = rtrim((string) ($wm['public_base_url'] ?? ''), '/');
        if ($useCdnUrl && $publicBase !== '') {
            return $publicBase . '/uploads/website/' . $relativeUnderWebsite;
        }
        $api = rtrim((string) ($config['api_public_url'] ?? ''), '/');
        $segments = explode('/', $relativeUnderWebsite);
        $enc = implode('/', array_map('rawurlencode', $segments));
        $path = '/api/public/website/asset/' . $enc;
        if ($api !== '') {
            return $api . $path;
        }

        return $path;
    }

    /**
     * POST /api/website/upload-image — multipart field "file", opsional "context"
     * (berita_cover | berita_konten | galeri | banner | seo_og | seo_favicon | default).
     */
    public function upload(Request $request, Response $response): Response
    {
        $user = (array) ($request->getAttribute('user') ?? []);
        if (!WebsiteHelper::canAccessAdminWebsite($this->db, $user)) {
            return $this->json($response, ['success' => false, 'message' => 'Akses ditolak'], 403);
        }
        try {
            $wm = $this->websiteMediaConfig();
            $maxBytes = (int) ($wm['max_upload_bytes'] ?? 8 * 1024 * 1024);
            if ($maxBytes < 512 * 1024) {
                $maxBytes = 8 * 1024 * 1024;
            }
            $webpQ = (int) ($wm['webp_quality'] ?? 85);
            $jpegQ = (int) ($wm['jpeg_quality'] ?? 88);

            $parsed = (array) ($request->getParsedBody() ?? []);
            $context = $this->normalizeContext((string) ($parsed['context'] ?? ''));

            $uploadedFiles = $request->getUploadedFiles();
            if (empty($uploadedFiles) || !isset($uploadedFiles['file'])) {
                return $this->json($response, ['success' => false, 'message' => 'File tidak ditemukan (field: file)'], 400);
            }
            $file = $uploadedFiles['file'];
            if ($file->getError() !== UPLOAD_ERR_OK) {
                return $this->json($response, ['success' => false, 'message' => 'Error upload: ' . $file->getError()], 400);
            }
            $allowed = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
            $mimeClient = strtolower((string) $file->getClientMediaType());
            if ($file->getSize() > $maxBytes) {
                $mb = (int) ceil($maxBytes / (1024 * 1024));

                return $this->json($response, ['success' => false, 'message' => 'Maksimal ' . $mb . ' MB'], 400);
            }

            $tmp = sys_get_temp_dir() . DIRECTORY_SEPARATOR . 'wst_' . bin2hex(random_bytes(8));
            $file->moveTo($tmp);

            $mimeResolved = '';
            if (is_file($tmp) && function_exists('mime_content_type')) {
                $det = @mime_content_type($tmp);
                if (is_string($det) && $det !== '') {
                    $detLower = strtolower($det);
                    if (in_array($detLower, $allowed, true)) {
                        $mimeResolved = $detLower;
                    }
                }
            }
            if ($mimeResolved === '' && in_array($mimeClient, $allowed, true)) {
                $mimeResolved = $mimeClient;
            }
            if ($mimeResolved === '') {
                @unlink($tmp);

                return $this->json($response, ['success' => false, 'message' => 'Tipe file tidak diizinkan (bukan gambar JPEG/PNG/GIF/WebP).'], 400);
            }

            $sub = self::CONTEXT_SUBDIR[$context] ?? self::CONTEXT_SUBDIR['default'];
            $resolved = $this->resolveWritableWebsiteRoot();
            $mediaRoot = $resolved['root'];
            $useCdnUrl = $resolved['use_cdn_url'];
            $dir = $mediaRoot . DIRECTORY_SEPARATOR . str_replace('/', DIRECTORY_SEPARATOR, $sub);
            if (!is_dir($dir)) {
                if (!@mkdir($dir, 0755, true) && !is_dir($dir)) {
                    @unlink($tmp);
                    throw new \RuntimeException('Folder unggahan tidak dapat dibuat: ' . $dir);
                }
            }
            if (!is_writable($dir)) {
                @unlink($tmp);
                throw new \RuntimeException('Folder unggahan tidak writable: ' . $dir);
            }

            $token = 'wst_' . bin2hex(random_bytes(8));

            // Tanpa GD (php.ini Apache): simpan berkas asli — unggah tetap jalan; aktifkan extension=gd untuk kompresi/WebP.
            if (!\extension_loaded('gd')) {
                error_log('WebsiteMediaController.upload: GD tidak aktif untuk PHP ini — menyimpan gambar tanpa resize/WebP (aktifkan extension gd di php.ini Apache).');
                $ext = $this->extensionFromMime($mimeResolved);
                $name = $token . '.' . $ext;
                $target = $dir . DIRECTORY_SEPARATOR . $name;
                $moved = @rename($tmp, $target);
                if (!$moved) {
                    $moved = @copy($tmp, $target);
                    @unlink($tmp);
                }
                if (!$moved || !is_file($target)) {
                    @unlink($target);

                    return $this->json($response, ['success' => false, 'message' => 'Gagal menyimpan berkas unggahan'], 500);
                }

                $relative = $this->relativeUrlPath($context, $name);

                return $this->json($response, [
                    'success' => true,
                    'data' => [
                        'filename' => $name,
                        'path' => $relative,
                        'url' => $this->publicAssetUrl($relative, $useCdnUrl),
                        'mime' => $mimeResolved,
                        'context' => $context,
                        'optimized' => false,
                    ],
                ], 201);
            }

            try {
                $out = WebsiteImageProcessor::process($tmp, $mimeResolved, $context, $webpQ, $jpegQ);
            } finally {
                @unlink($tmp);
            }

            $name = $token . '.' . $out['ext'];
            $target = $dir . DIRECTORY_SEPARATOR . $name;
            if (file_put_contents($target, $out['binary']) === false) {
                return $this->json($response, ['success' => false, 'message' => 'Gagal menyimpan berkas'], 500);
            }

            $relative = $this->relativeUrlPath($context, $name);

            return $this->json($response, [
                'success' => true,
                'data' => [
                    'filename' => $name,
                    'path' => $relative,
                    'url' => $this->publicAssetUrl($relative, $useCdnUrl),
                    'mime' => $out['mime'],
                    'context' => $context,
                    'optimized' => true,
                ],
            ], 201);
        } catch (\Throwable $e) {
            error_log('WebsiteMediaController.upload: ' . $e->getMessage());
            $msg = 'Gagal memproses gambar (pastikan berkas gambar valid).';
            if (str_contains($e->getMessage(), 'tidak dapat ditulis') || str_contains($e->getMessage(), 'writable')) {
                $msg = 'Folder unggahan website tidak bisa ditulis. Buat folder gambar/uploads/website (chmod 775) atau hubungi admin server.';
            }

            return $this->json($response, ['success' => false, 'message' => $msg], 500);
        }
    }

    /**
     * GET /api/public/website/asset/{path} — path boleh berisi / (nested).
     */
    public function servePublic(Request $request, Response $response, array $args): Response
    {
        $raw = (string) ($args['path'] ?? '');
        $path = rawurldecode($raw);
        $path = str_replace('\\', '/', $path);
        $path = trim($path, '/');
        if ($path === '' || str_contains($path, '..')) {
            return $response->withStatus(404);
        }
        if (!preg_match('#^[a-zA-Z0-9][a-zA-Z0-9/_\-.]*$#', $path)) {
            return $response->withStatus(404);
        }

        $roots = $this->websiteMediaFsRootCandidates();
        $realFile = false;
        $matchedRoot = null;
        foreach ($roots as $root) {
            if (!is_dir($root)) {
                continue;
            }
            $full = $root . DIRECTORY_SEPARATOR . str_replace('/', DIRECTORY_SEPARATOR, $path);
            $candidate = realpath($full);
            $realRoot = realpath($root);
            if ($realRoot === false || $candidate === false || !is_file($candidate) || !is_readable($candidate)) {
                continue;
            }
            if (strpos($candidate, $realRoot) !== 0) {
                continue;
            }
            $realFile = $candidate;
            $matchedRoot = $realRoot;
            break;
        }
        if ($realFile === false || $matchedRoot === null) {
            return $response->withStatus(404);
        }

        $ext = strtolower(pathinfo($realFile, PATHINFO_EXTENSION));
        $types = [
            'jpg' => 'image/jpeg',
            'jpeg' => 'image/jpeg',
            'png' => 'image/png',
            'gif' => 'image/gif',
            'webp' => 'image/webp',
        ];
        $contentType = $types[$ext] ?? 'application/octet-stream';
        $body = file_get_contents($realFile);
        if ($body === false) {
            return $response->withStatus(500);
        }
        $response->getBody()->write($body);

        return $response
            ->withHeader('Content-Type', $contentType)
            ->withHeader('Cache-Control', 'public, max-age=31536000, immutable');
    }
}

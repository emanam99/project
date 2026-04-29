<?php

namespace App\Controllers;

use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;

/**
 * Controller untuk mengelola file di folder uploads (hanya super_admin).
 * Menggunakan config uploads_base_path (folder di luar public, berdampingan dengan public_html).
 * Struktur uploads:
 * - uploads/santri/     (berkas santri, foto juara)
 * - uploads/pengurus/   (foto profil pengurus)
 * - uploads/pengeluaran/ (berkas pengeluaran)
 * - uploads/pengaturan/ (logo, header)
 * - uploads/rencana-pengeluaran/{id}/ (file lampiran rencana)
 */
class UploadsManagerController
{
    /** Base path folder uploads (di luar public) */
    private string $uploadsBasePath;

    /** Path folder uploads lama (backend/uploads) - untuk merge rencana-pengeluaran */
    private string $legacyUploadsPath;

    public function __construct()
    {
        $config = require __DIR__ . '/../../config.php';
        $root = rtrim($config['uploads_base_path'] ?? __DIR__ . '/../..', '/\\');
        $folder = $config['uploads_folder'] ?? 'uploads';
        $uploadsDir = $root . DIRECTORY_SEPARATOR . trim($folder, '/\\');
        $this->uploadsBasePath = rtrim(realpath($uploadsDir) ?: $uploadsDir, DIRECTORY_SEPARATOR . '/');
        $legacyBase = __DIR__ . '/../../uploads';
        $this->legacyUploadsPath = rtrim(realpath($legacyBase) ?: $legacyBase, DIRECTORY_SEPARATOR . '/');
    }

    private function jsonResponse(Response $response, array $data, int $statusCode): Response
    {
        $response->getBody()->write(json_encode($data, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT));
        return $response
            ->withStatus($statusCode)
            ->withHeader('Content-Type', 'application/json; charset=utf-8');
    }

    /**
     * Normalisasi path: pastikan relatif dan tidak keluar dari uploads.
     * Menerima path dengan atau tanpa prefix "uploads/" (sesuai path dari list).
     * Cek uploadsBasePath dulu, fallback ke legacyUploadsPath (untuk file rencana-pengeluaran lama).
     * Return path absolut ke file/folder atau null jika invalid.
     */
    private function resolveSafePath(string $relativePath): ?string
    {
        $relativePath = trim($relativePath, " \t\n\r\0\x0B/\\");
        if ($relativePath === '' || preg_match('/\.\./', $relativePath)) {
            return null;
        }
        $prefix = 'uploads';
        if (strtolower(substr($relativePath, 0, strlen($prefix))) === strtolower($prefix)) {
            $relativePath = trim(substr($relativePath, strlen($prefix)), "/\\");
        }
        if ($relativePath === '') {
            return null;
        }
        $norm = str_replace(['/', '\\'], DIRECTORY_SEPARATOR, $relativePath);

        // Coba lokasi baru (uploads_base_path)
        $fullPath = $this->uploadsBasePath . DIRECTORY_SEPARATOR . $norm;
        $real = realpath($fullPath);
        if ($real !== false && is_file($real) && strpos($real, $this->uploadsBasePath) === 0) {
            return $real;
        }

        // Fallback ke lokasi lama (backend/uploads) - untuk rencana-pengeluaran, pengaturan, dll.
        $legacyFull = $this->legacyUploadsPath . DIRECTORY_SEPARATOR . $norm;
        $legacyReal = realpath($legacyFull);
        if ($legacyReal !== false && is_file($legacyReal) && strpos($legacyReal, $this->legacyUploadsPath) === 0) {
            return $legacyReal;
        }
        return null;
    }

    /**
     * GET /api/uploads-manager/list - List folder dan file di uploads (super_admin only)
     */
    public function list(Request $request, Response $response): Response
    {
        try {
            if (!is_dir($this->uploadsBasePath)) {
                return $this->jsonResponse($response, [
                    'success' => true,
                    'data' => [
                        'folders' => [],
                        'basePath' => 'uploads'
                    ]
                ], 200);
            }

            $folders = [];
            $dirs = @scandir($this->uploadsBasePath);
            if ($dirs === false) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Tidak dapat membaca folder uploads'
                ], 500);
            }

            foreach ($dirs as $entry) {
                if ($entry === '.' || $entry === '..') {
                    continue;
                }
                $fullPath = $this->uploadsBasePath . DIRECTORY_SEPARATOR . $entry;
                if (!is_dir($fullPath)) {
                    continue;
                }

                $files = $this->listFilesInDir($fullPath, 'uploads/' . $entry);
                $folders[] = [
                    'name' => $entry,
                    'path' => 'uploads/' . $entry,
                    'files' => $files,
                    'totalSize' => array_sum(array_column($files, 'size')),
                    'fileCount' => count($files)
                ];
            }

            // Merge file rencana-pengeluaran dari lokasi lama (backend/uploads) jika ada
            $legacyRencanaPath = $this->legacyUploadsPath . DIRECTORY_SEPARATOR . 'rencana-pengeluaran';
            if (is_dir($legacyRencanaPath) && $legacyRencanaPath !== $this->uploadsBasePath . DIRECTORY_SEPARATOR . 'rencana-pengeluaran') {
                $legacyFiles = $this->listFilesInDir($legacyRencanaPath, 'uploads/rencana-pengeluaran');
                $existingPaths = [];
                $rencanaIdx = null;
                foreach ($folders as $i => $f) {
                    if ($f['name'] === 'rencana-pengeluaran') {
                        $rencanaIdx = $i;
                        foreach ($f['files'] as $fx) {
                            $existingPaths[$fx['path']] = true;
                        }
                        break;
                    }
                }
                foreach ($legacyFiles as $lf) {
                    if (!isset($existingPaths[$lf['path']])) {
                        $existingPaths[$lf['path']] = true;
                        if ($rencanaIdx !== null) {
                            $folders[$rencanaIdx]['files'][] = $lf;
                        } else {
                            $folders[] = [
                                'name' => 'rencana-pengeluaran',
                                'path' => 'uploads/rencana-pengeluaran',
                                'files' => [$lf],
                                'totalSize' => $lf['size'],
                                'fileCount' => 1
                            ];
                            $rencanaIdx = count($folders) - 1;
                        }
                    }
                }
                if ($rencanaIdx !== null) {
                    $folders[$rencanaIdx]['totalSize'] = array_sum(array_column($folders[$rencanaIdx]['files'], 'size'));
                    $folders[$rencanaIdx]['fileCount'] = count($folders[$rencanaIdx]['files']);
                }
            }

            // Urutkan folder by name
            usort($folders, fn($a, $b) => strcasecmp($a['name'], $b['name']));

            return $this->jsonResponse($response, [
                'success' => true,
                'data' => [
                    'folders' => $folders,
                    'basePath' => 'uploads'
                ]
            ], 200);
        } catch (\Throwable $e) {
            error_log('UploadsManagerController::list - ' . $e->getMessage());
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Gagal mengambil daftar file'
            ], 500);
        }
    }

    /**
     * Rekursif list file di dalam dir; subfolder digabung ke satu list dengan path relatif.
     */
    private function listFilesInDir(string $dirPath, string $relativePrefix): array
    {
        $files = [];
        $dirs = @scandir($dirPath);
        if ($dirs === false) {
            return $files;
        }

        foreach ($dirs as $entry) {
            if ($entry === '.' || $entry === '..') {
                continue;
            }
            $full = $dirPath . DIRECTORY_SEPARATOR . $entry;
            $rel = $relativePrefix . '/' . $entry;

            if (is_dir($full)) {
                $files = array_merge($files, $this->listFilesInDir($full, $rel));
            } else {
                $files[] = [
                    'name' => $entry,
                    'path' => str_replace('\\', '/', $rel),
                    'size' => (int)@filesize($full),
                    'modified' => @filemtime($full) ? date('Y-m-d H:i:s', filemtime($full)) : null
                ];
            }
        }

        return $files;
    }

    /**
     * GET /api/uploads-manager/serve?path=... - Stream file untuk preview/download (super_admin only)
     */
    public function serve(Request $request, Response $response): Response
    {
        try {
            $query = $request->getQueryParams();
            $relativePath = $query['path'] ?? '';

            if ($relativePath === '') {
                $response = $response->withStatus(400)->withHeader('Content-Type', 'text/plain');
                $response->getBody()->write('Path wajib diisi');
                return $response;
            }

            $resolved = $this->resolveSafePath($relativePath);
            if ($resolved === null || !is_file($resolved)) {
                $response = $response->withStatus(404)->withHeader('Content-Type', 'text/plain');
                $response->getBody()->write('File tidak ditemukan');
                return $response;
            }

            $mime = $this->getMimeFromPath($resolved);
            $content = file_get_contents($resolved);
            if (!is_string($content)) {
                $response = $response->withStatus(500)->withHeader('Content-Type', 'text/plain');
                $response->getBody()->write('Gagal membaca file');
                return $response;
            }
            $contentLength = strlen($content);
            $response = $response
                ->withHeader('Content-Type', $mime)
                ->withHeader('Content-Disposition', 'inline; filename="' . basename($resolved) . '"')
                ->withHeader('Content-Length', (string)$contentLength)
                ->withStatus(200);
            $response->getBody()->write($content);
            return $response;
        } catch (\Throwable $e) {
            error_log('UploadsManagerController::serve - ' . $e->getMessage());
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Gagal mengambil file'
            ], 500);
        }
    }

    private function getMimeFromPath(string $filePath): string
    {
        $ext = strtolower(pathinfo($filePath, PATHINFO_EXTENSION));
        $map = [
            'jpg' => 'image/jpeg',
            'jpeg' => 'image/jpeg',
            'png' => 'image/png',
            'gif' => 'image/gif',
            'webp' => 'image/webp',
            'pdf' => 'application/pdf',
        ];
        return $map[$ext] ?? 'application/octet-stream';
    }

    /**
     * POST /api/uploads-manager/delete - Hapus file by path relatif (super_admin only)
     * Body: { "path": "uploads/santri/xxx.jpg" }
     */
    public function delete(Request $request, Response $response): Response
    {
        try {
            $body = $request->getParsedBody() ?? [];
            $relativePath = $body['path'] ?? $request->getQueryParams()['path'] ?? '';

            if ($relativePath === '') {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Path file wajib diisi'
                ], 400);
            }

            $resolved = $this->resolveSafePath($relativePath);
            if ($resolved === null) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Path tidak valid atau tidak diizinkan'
                ], 400);
            }

            if (is_dir($resolved)) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Hanya file yang dapat dihapus, bukan folder'
                ], 400);
            }

            if (!file_exists($resolved)) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'File tidak ditemukan'
                ], 404);
            }

            if (!@unlink($resolved)) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Gagal menghapus file'
                ], 500);
            }

            return $this->jsonResponse($response, [
                'success' => true,
                'message' => 'File berhasil dihapus'
            ], 200);
        } catch (\Throwable $e) {
            error_log('UploadsManagerController::delete - ' . $e->getMessage());
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Gagal menghapus file'
            ], 500);
        }
    }

    /**
     * Path folder berkas santri lama (backend/uploads/santri) - dari SantriBerkasController v1.
     */
    private function getLegacySantriPath(): string
    {
        return rtrim(realpath(__DIR__ . '/../../uploads/santri') ?: __DIR__ . '/../../uploads/santri', DIRECTORY_SEPARATOR . '/');
    }

    /**
     * GET /api/uploads-manager/check-legacy-santri - Cek ada file di lokasi berkas lama (super_admin only)
     */
    public function checkLegacySantri(Request $request, Response $response): Response
    {
        try {
            $legacyPath = $this->getLegacySantriPath();
            if (!is_dir($legacyPath)) {
                return $this->jsonResponse($response, [
                    'success' => true,
                    'data' => [
                        'hasLegacyFiles' => false,
                        'count' => 0,
                        'files' => [],
                        'legacyPath' => str_replace('\\', '/', $legacyPath)
                    ]
                ], 200);
            }

            $files = $this->listFilesInDir($legacyPath, 'uploads/santri');
            return $this->jsonResponse($response, [
                'success' => true,
                'data' => [
                    'hasLegacyFiles' => count($files) > 0,
                    'count' => count($files),
                    'files' => $files,
                    'legacyPath' => str_replace('\\', '/', $legacyPath)
                ]
            ], 200);
        } catch (\Throwable $e) {
            error_log('UploadsManagerController::checkLegacySantri - ' . $e->getMessage());
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Gagal mengecek file lama'
            ], 500);
        }
    }

    /**
     * POST /api/uploads-manager/migrate-santri - Pindahkan file dari lokasi lama ke lokasi baru (super_admin only)
     * path_file di DB tetap "uploads/santri/xxx" - tidak perlu update DB.
     */
    public function migrateSantriFromLegacy(Request $request, Response $response): Response
    {
        try {
            $legacyPath = $this->getLegacySantriPath();
            if (!is_dir($legacyPath)) {
                return $this->jsonResponse($response, [
                    'success' => true,
                    'data' => [
                        'migrated' => 0,
                        'skipped' => 0,
                        'failed' => [],
                        'message' => 'Folder berkas lama tidak ditemukan atau kosong'
                    ]
                ], 200);
            }

            $newSantriDir = $this->uploadsBasePath . DIRECTORY_SEPARATOR . 'santri';
            if (!is_dir($newSantriDir)) {
                mkdir($newSantriDir, 0755, true);
            }

            $files = $this->listFilesInDir($legacyPath, 'uploads/santri');
            $migrated = 0;
            $skipped = 0;
            $failed = [];

            foreach ($files as $file) {
                // file['path'] = "uploads/santri/xxx.jpg" -> relative dari legacy (backend/uploads/santri) = "xxx.jpg"
                $relativeFromLegacy = preg_replace('#^uploads/santri/#', '', $file['path']);
                $legacyFull = $this->resolveLegacyPath($legacyPath, $relativeFromLegacy);
                $newFull = $this->uploadsBasePath . DIRECTORY_SEPARATOR . 'santri' . DIRECTORY_SEPARATOR
                    . str_replace(['/', '\\'], DIRECTORY_SEPARATOR, $relativeFromLegacy);

                if (!$legacyFull || !is_file($legacyFull)) {
                    continue;
                }

                if (file_exists($newFull)) {
                    $skipped++;
                    continue;
                }

                $targetDir = dirname($newFull);
                if (!is_dir($targetDir)) {
                    mkdir($targetDir, 0755, true);
                }

                if (@copy($legacyFull, $newFull)) {
                    @unlink($legacyFull);
                    $migrated++;
                } else {
                    $failed[] = ['path' => $file['path'], 'error' => 'Gagal menyalin file'];
                }
            }

            return $this->jsonResponse($response, [
                'success' => true,
                'data' => [
                    'migrated' => $migrated,
                    'skipped' => $skipped,
                    'failed' => $failed,
                    'message' => "Berhasil memindahkan {$migrated} file ke lokasi baru" . ($skipped > 0 ? ", {$skipped} dilewati (sudah ada)" : '')
                ]
            ], 200);
        } catch (\Throwable $e) {
            error_log('UploadsManagerController::migrateSantriFromLegacy - ' . $e->getMessage());
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Gagal memindahkan file'
            ], 500);
        }
    }

    private function resolveLegacyPath(string $legacyBase, string $relativePath): ?string
    {
        $relativePath = trim(str_replace(['/', '\\'], DIRECTORY_SEPARATOR, $relativePath), DIRECTORY_SEPARATOR);
        if ($relativePath === '' || preg_match('/\.\./', $relativePath)) {
            return null;
        }
        $full = $legacyBase . DIRECTORY_SEPARATOR . $relativePath;
        $real = realpath($full);
        if ($real === false || strpos($real, $legacyBase) !== 0) {
            return null;
        }
        return $real;
    }

    /**
     * Path folder rencana-pengeluaran lama (backend/uploads/rencana-pengeluaran).
     */
    private function getLegacyRencanaPengeluaranPath(): string
    {
        return rtrim(realpath($this->legacyUploadsPath . DIRECTORY_SEPARATOR . 'rencana-pengeluaran')
            ?: $this->legacyUploadsPath . DIRECTORY_SEPARATOR . 'rencana-pengeluaran', DIRECTORY_SEPARATOR . '/');
    }

    /**
     * GET /api/uploads-manager/check-legacy-rencana - Cek ada file rencana-pengeluaran di lokasi lama
     */
    public function checkLegacyRencanaPengeluaran(Request $request, Response $response): Response
    {
        try {
            $legacyPath = $this->getLegacyRencanaPengeluaranPath();
            if (!is_dir($legacyPath)) {
                return $this->jsonResponse($response, [
                    'success' => true,
                    'data' => [
                        'hasLegacyFiles' => false,
                        'count' => 0,
                        'files' => [],
                        'legacyPath' => str_replace('\\', '/', $legacyPath)
                    ]
                ], 200);
            }

            $files = $this->listFilesInDir($legacyPath, 'uploads/rencana-pengeluaran');
            return $this->jsonResponse($response, [
                'success' => true,
                'data' => [
                    'hasLegacyFiles' => count($files) > 0,
                    'count' => count($files),
                    'files' => $files,
                    'legacyPath' => str_replace('\\', '/', $legacyPath)
                ]
            ], 200);
        } catch (\Throwable $e) {
            error_log('UploadsManagerController::checkLegacyRencanaPengeluaran - ' . $e->getMessage());
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Gagal mengecek file lama'
            ], 500);
        }
    }

    /**
     * POST /api/uploads-manager/migrate-rencana - Pindahkan file rencana-pengeluaran dari lokasi lama ke baru.
     * path_file di DB tetap "rencana-pengeluaran/{id}/xxx" - tidak perlu update DB.
     */
    public function migrateRencanaPengeluaranFromLegacy(Request $request, Response $response): Response
    {
        try {
            $legacyPath = $this->getLegacyRencanaPengeluaranPath();
            if (!is_dir($legacyPath)) {
                return $this->jsonResponse($response, [
                    'success' => true,
                    'data' => [
                        'migrated' => 0,
                        'skipped' => 0,
                        'failed' => [],
                        'message' => 'Folder rencana-pengeluaran lama tidak ditemukan atau kosong'
                    ]
                ], 200);
            }

            $newBaseDir = $this->uploadsBasePath . DIRECTORY_SEPARATOR . 'rencana-pengeluaran';
            if (!is_dir($newBaseDir)) {
                mkdir($newBaseDir, 0755, true);
            }

            $files = $this->listFilesInDir($legacyPath, 'uploads/rencana-pengeluaran');
            $migrated = 0;
            $skipped = 0;
            $failed = [];

            foreach ($files as $file) {
                // file['path'] = "uploads/rencana-pengeluaran/1077/xxx.jpg" -> relative = "1077/xxx.jpg"
                $relativeFromLegacy = preg_replace('#^uploads/rencana-pengeluaran/#', '', $file['path']);
                $legacyFull = $this->resolveLegacyPath($legacyPath, $relativeFromLegacy);
                $newFull = $newBaseDir . DIRECTORY_SEPARATOR
                    . str_replace(['/', '\\'], DIRECTORY_SEPARATOR, $relativeFromLegacy);

                if (!$legacyFull || !is_file($legacyFull)) {
                    continue;
                }

                if (file_exists($newFull)) {
                    $skipped++;
                    continue;
                }

                $targetDir = dirname($newFull);
                if (!is_dir($targetDir)) {
                    mkdir($targetDir, 0755, true);
                }

                if (@copy($legacyFull, $newFull)) {
                    @unlink($legacyFull);
                    $migrated++;
                } else {
                    $failed[] = ['path' => $file['path'], 'error' => 'Gagal menyalin file'];
                }
            }

            return $this->jsonResponse($response, [
                'success' => true,
                'data' => [
                    'migrated' => $migrated,
                    'skipped' => $skipped,
                    'failed' => $failed,
                    'message' => "Berhasil memindahkan {$migrated} file rencana-pengeluaran ke lokasi baru" . ($skipped > 0 ? ", {$skipped} dilewati (sudah ada)" : '')
                ]
            ], 200);
        } catch (\Throwable $e) {
            error_log('UploadsManagerController::migrateRencanaPengeluaranFromLegacy - ' . $e->getMessage());
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Gagal memindahkan file'
            ], 500);
        }
    }
}

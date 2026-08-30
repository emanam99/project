<?php

namespace App\Controllers;

use App\Helpers\AuthHelper;
use App\Helpers\FileUploadValidator;
use App\Helpers\SppgManifestHelper;
use App\Helpers\TenantHelper;
use App\Services\SppgService;
use App\Services\XenditService;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;

class SppgController
{
    private SppgService $sppg;
    private XenditService $xendit;
    private string $uploadsBase;

    public function __construct()
    {
        $this->sppg = new SppgService();
        $this->xendit = new XenditService();
        $base = rtrim((string) ($_ENV['UPLOADS_PATH'] ?? ''), '/\\');
        if ($base === '') {
            $base = dirname(__DIR__, 2) . DIRECTORY_SEPARATOR . 'uploads';
        }
        $this->uploadsBase = $base;
    }

    private function json(Response $response, array $payload, int $status = 200): Response
    {
        $response->getBody()->write(json_encode($payload, JSON_UNESCAPED_UNICODE));
        return $response->withHeader('Content-Type', 'application/json')->withStatus($status);
    }

    /** GET /sppg/profile */
    public function profile(Request $request, Response $response): Response
    {
        $sppgId = TenantHelper::getSppgIdFromRequest($request);
        $sppg = $this->sppg->findById($sppgId);
        if (!$sppg) {
            return $this->json($response, ['success' => false, 'message' => 'SPPG tidak ditemukan'], 404);
        }
        $sub = $this->sppg->getActiveSubscription($sppgId);
        return $this->json($response, [
            'success' => true,
            'data' => [
                'sppg' => $this->sppg->publicProfile($sppg),
                'subscription' => $this->sppg->publicSubscription($sub),
            ],
        ]);
    }

    /** PUT /sppg/profile */
    public function updateProfile(Request $request, Response $response): Response
    {
        $user = $request->getAttribute('user');
        if (!AuthHelper::isSuperAdminRole($user['role'] ?? null)) {
            return $this->json($response, ['success' => false, 'message' => 'Hanya super admin yang dapat mengubah profil SPPG'], 403);
        }

        $sppgId = TenantHelper::getSppgIdFromRequest($request);
        $body = json_decode((string) $request->getBody(), true);
        $body = is_array($body) ? $body : [];

        try {
            $updated = $this->sppg->updateProfile($sppgId, $body);
            if (!$updated) {
                return $this->json($response, ['success' => false, 'message' => 'SPPG tidak ditemukan'], 404);
            }
            $sub = $this->sppg->getActiveSubscription($sppgId);
            return $this->json($response, [
                'success' => true,
                'data' => [
                    'sppg' => $this->sppg->publicProfile($updated),
                    'subscription' => $this->sppg->publicSubscription($sub),
                ],
            ]);
        } catch (\InvalidArgumentException $e) {
            return $this->json($response, ['success' => false, 'message' => $e->getMessage()], 422);
        }
    }

    /** GET /sppg/subscription */
    public function subscription(Request $request, Response $response): Response
    {
        $user = $request->getAttribute('user');
        if (!AuthHelper::isSuperAdminRole($user['role'] ?? null)) {
            return $this->json($response, ['success' => false, 'message' => 'Hanya super admin'], 403);
        }

        $sppgId = TenantHelper::getSppgIdFromRequest($request);
        $sppg = $this->sppg->findById($sppgId);
        $sub = $this->sppg->getActiveSubscription($sppgId);
        $payments = $this->sppg->getPaymentHistory($sppgId);

        return $this->json($response, [
            'success' => true,
            'data' => [
                'sppg' => $sppg ? $this->sppg->publicProfile($sppg) : null,
                'subscription' => $this->sppg->publicSubscription($sub),
                'payments' => $payments,
            ],
        ]);
    }

    /** POST /sppg/subscription/pay */
    public function paySubscription(Request $request, Response $response): Response
    {
        $user = $request->getAttribute('user');
        if (!AuthHelper::isSuperAdminRole($user['role'] ?? null)) {
            return $this->json($response, ['success' => false, 'message' => 'Hanya super admin'], 403);
        }

        if (!$this->xendit->isConfigured()) {
            return $this->json($response, ['success' => false, 'message' => 'Pembayaran belum dikonfigurasi di server'], 503);
        }

        $sppgId = TenantHelper::getSppgIdFromRequest($request);
        $sppg = $this->sppg->findById($sppgId);
        $sub = $this->sppg->getActiveSubscription($sppgId);
        if (!$sppg || !$sub) {
            return $this->json($response, ['success' => false, 'message' => 'Langganan tidak ditemukan'], 404);
        }

        if (!empty($sub['xendit_invoice_url']) && in_array($sub['status'], ['pending_payment', 'past_due'], true)) {
            return $this->json($response, [
                'success' => true,
                'data' => [
                    'invoice_url' => $sub['xendit_invoice_url'],
                    'amount' => (float) $sub['amount'],
                ],
            ]);
        }

        try {
            $amount = (float) ($sub['amount'] ?? SppgService::SUBSCRIPTION_AMOUNT);
            $invoice = $this->xendit->createSubscriptionInvoice(
                $sppgId,
                (int) $sub['id'],
                $amount,
                (string) $user['email'],
                'Langganan SPPG — ' . ($sppg['nama_unit'] ?? '')
            );
            return $this->json($response, ['success' => true, 'data' => $invoice]);
        } catch (\Throwable $e) {
            return $this->json($response, ['success' => false, 'message' => $e->getMessage()], 500);
        }
    }

    /** GET /sppg/manifest.webmanifest */
    public function manifest(Request $request, Response $response): Response
    {
        $sppgId = TenantHelper::getSppgIdFromRequest($request);
        $sppg = $this->sppg->findById($sppgId);
        if (!$sppg) {
            return $this->json($response, ['success' => false, 'message' => 'SPPG tidak ditemukan'], 404);
        }

        $origin = AuthHelper::resolveFrontendUrl($request->getHeaderLine('Origin') ?: null);
        $gambar = rtrim($origin, '/') . '/gambar';
        $version = trim((string) ($_ENV['APP_VERSION'] ?? '1'));
        $payload = SppgManifestHelper::build($sppg, $origin, $gambar, $version);

        $response->getBody()->write(json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));
        return $response
            ->withHeader('Content-Type', 'application/manifest+json')
            ->withHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    }

    /** GET /sppg/pwa-logo?slug= — publik untuk ikon manifest */
    public function pwaLogo(Request $request, Response $response): Response
    {
        $slug = SppgService::slugify((string) ($request->getQueryParams()['slug'] ?? ''));
        if ($slug === '') {
            return $response->withStatus(404);
        }
        $sppg = $this->sppg->findBySlug($slug);
        if (!$sppg || empty($sppg['pwa_logo_path'])) {
            return $response->withStatus(404);
        }

        $rel = (string) $sppg['pwa_logo_path'];
        if (str_starts_with($rel, 'uploads/')) {
            $rel = substr($rel, strlen('uploads/'));
        }
        $abs = $this->uploadsBase . DIRECTORY_SEPARATOR . str_replace(['/', '\\'], DIRECTORY_SEPARATOR, $rel);
        $real = realpath($abs);
        $realBase = realpath($this->uploadsBase);
        if (!$real || !$realBase || !str_starts_with($real, $realBase) || !is_file($real)) {
            return $response->withStatus(404);
        }

        $mime = (string) ($sppg['pwa_logo_tipe'] ?? 'image/png');
        $response->getBody()->write((string) file_get_contents($real));
        return $response
            ->withHeader('Content-Type', $mime)
            ->withHeader('Cache-Control', 'public, max-age=3600');
    }

    /** POST /sppg/profile/pwa-logo */
    public function uploadPwaLogo(Request $request, Response $response): Response
    {
        $user = $request->getAttribute('user');
        if (!AuthHelper::isSuperAdminRole($user['role'] ?? null)) {
            return $this->json($response, ['success' => false, 'message' => 'Hanya super admin'], 403);
        }

        $sppgId = TenantHelper::getSppgIdFromRequest($request);
        $sppg = $this->sppg->findById($sppgId);
        if (!$sppg) {
            return $this->json($response, ['success' => false, 'message' => 'SPPG tidak ditemukan'], 404);
        }

        $uploaded = $request->getUploadedFiles();
        if (empty($uploaded['file'])) {
            return $this->json($response, ['success' => false, 'message' => 'File logo wajib diunggah'], 422);
        }
        $file = $uploaded['file'];
        $validation = FileUploadValidator::validate($file, ['jpg', 'jpeg', 'png', 'webp'], 512 * 1024);
        if (!$validation['success']) {
            return $this->json($response, ['success' => false, 'message' => $validation['message'] ?? 'File tidak valid'], 422);
        }

        $dir = $this->uploadsBase . DIRECTORY_SEPARATOR . 'sppg' . DIRECTORY_SEPARATOR . $sppgId;
        if (!is_dir($dir) && !mkdir($dir, 0755, true)) {
            return $this->json($response, ['success' => false, 'message' => 'Gagal membuat folder upload'], 500);
        }

        $ext = $validation['extension'] ?? 'png';
        $safe = 'pwa_logo.' . $ext;
        $abs = $dir . DIRECTORY_SEPARATOR . $safe;
        $file->moveTo($abs);

        $rel = 'uploads/sppg/' . $sppgId . '/' . $safe;
        $updated = $this->sppg->updatePwaLogo($sppgId, $rel, (string) ($validation['mime'] ?? 'image/png'));
        $sub = $this->sppg->getActiveSubscription($sppgId);

        return $this->json($response, [
            'success' => true,
            'message' => 'Logo PWA diunggah',
            'data' => [
                'sppg' => $this->sppg->publicProfile($updated ?? $sppg),
                'subscription' => $this->sppg->publicSubscription($sub),
            ],
        ]);
    }
}

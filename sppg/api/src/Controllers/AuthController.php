<?php

namespace App\Controllers;

use App\Helpers\AuthHelper;
use App\Helpers\PlatformAdminHelper;
use App\Helpers\TenantHostHelper;
use App\Services\SppgService;
use App\Services\SubdomainProvisioner;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;

class AuthController
{
    private SppgService $sppg;

    public function __construct()
    {
        $this->sppg = new SppgService();
    }

    private function json(Response $response, array $payload, int $status = 200): Response
    {
        $response->getBody()->write(json_encode($payload, JSON_UNESCAPED_UNICODE));
        return $response->withHeader('Content-Type', 'application/json')->withStatus($status);
    }

    private function redirect(Response $response, string $url, array $extraHeaders = []): Response
    {
        $response = $response->withHeader('Location', $url)->withStatus(302);
        foreach ($extraHeaders as $k => $v) {
            $response = $response->withHeader($k, $v);
        }
        return $response;
    }

    /** GET /auth/google?returnTo=/dashboard&frontend= */
    public function googleStart(Request $request, Response $response): Response
    {
        $params = $request->getQueryParams();
        $returnTo = (string) ($params['returnTo'] ?? '/dashboard');
        if ($returnTo === '' || $returnTo[0] !== '/') {
            $returnTo = '/dashboard';
        }
        $frontend = AuthHelper::resolveFrontendUrl($params['frontend'] ?? null);
        $extra = [];
        if (!empty($params['sppg_slug'])) {
            $extra['sppg_slug'] = SppgService::slugify((string) $params['sppg_slug']);
        }
        if (!empty($params['sppg_subdomain'])) {
            $extra['sppg_subdomain'] = SppgService::normalizeSubdomain((string) $params['sppg_subdomain']);
        }
        $mode = (string) ($params['mode'] ?? 'login');
        if ($mode === 'platform_admin') {
            $extra['mode'] = 'platform_admin';
        } else {
            $extra['mode'] = 'login';
        }

        try {
            $url = AuthHelper::buildGoogleAuthUrl($returnTo, $frontend, $extra);
            return $this->redirect($response, $url);
        } catch (\Throwable $e) {
            $frontend = $frontend . '/login?error=' . rawurlencode($e->getMessage());
            return $this->redirect($response, $frontend);
        }
    }

    /** GET /auth/google/callback?code=&state= */
    public function googleCallback(Request $request, Response $response): Response
    {
        $params = $request->getQueryParams();
        $state = AuthHelper::decodeOAuthState($params['state'] ?? null);
        $frontend = AuthHelper::resolveFrontendUrl($state['frontend'] ?? null);
        $returnTo = (string) ($state['returnTo'] ?? '/dashboard');
        if ($returnTo === '' || $returnTo[0] !== '/') {
            $returnTo = '/dashboard';
        }

        if (!empty($params['error'])) {
            $msg = (string) ($params['error_description'] ?? $params['error']);
            return $this->redirect($response, $frontend . '/login?error=' . rawurlencode($msg));
        }

        $code = (string) ($params['code'] ?? '');
        if ($code === '') {
            return $this->redirect($response, $frontend . '/login?error=' . rawurlencode('Kode Google tidak ditemukan'));
        }

        try {
            $profile = AuthHelper::exchangeGoogleCode($code);
            $mode = (string) ($state['mode'] ?? 'login');

            if ($mode === 'register') {
                return $this->handleRegisterCallback($response, $frontend, $returnTo, $profile, $state);
            }

            if ($mode === 'platform_admin') {
                return $this->handlePlatformAdminCallback($response, $frontend, $returnTo, $profile);
            }

            return $this->handleLoginCallback($response, $frontend, $returnTo, $profile, $state);
        } catch (\Throwable $e) {
            return $this->redirect(
                $response,
                $frontend . '/login?error=' . rawurlencode($e->getMessage())
            );
        }
    }

    private function handleRegisterCallback(
        Response $response,
        string $frontend,
        string $returnTo,
        array $profile,
        array $state
    ): Response {
        $reg = is_array($state['register'] ?? null) ? $state['register'] : [];
        $sppgService = new SppgService();
        $tenant = $sppgService->createTenant([
            'nama_unit' => (string) ($reg['nama_unit'] ?? ''),
            'nama_yayasan' => (string) ($reg['nama_yayasan'] ?? ''),
            'slug' => (string) ($reg['slug'] ?? ''),
            'subdomain' => (string) ($reg['subdomain'] ?? ''),
            'alamat' => (string) ($reg['alamat'] ?? ''),
            'telepon' => (string) ($reg['telepon'] ?? ''),
            'email_kontak' => (string) ($reg['email_kontak'] ?? ''),
        ]);

        $provisioner = new SubdomainProvisioner();
        $subForDns = (string) ($tenant['subdomain'] ?? '');
        if ($subForDns !== '') {
            $provision = $provisioner->provision($subForDns);
            if (!$provision['success']) {
                $sppgService->markPendingDns((int) $tenant['id']);
            }
        }

        $user = AuthHelper::createRegisterSuperAdmin($profile, (int) $tenant['id']);
        $sessionId = AuthHelper::createSession((int) $user['id'], (int) $tenant['id']);

        $tenantFrontend = TenantHostHelper::tenantUrl($tenant['subdomain'] ?? null) ?? $frontend;
        $target = $tenantFrontend . '/auth/callback'
            . '?token=' . rawurlencode($sessionId)
            . '&returnTo=' . rawurlencode('/langganan');

        return $this->redirect($response, $target, [
            'Set-Cookie' => AuthHelper::sessionCookieHeader($sessionId),
        ]);
    }

    private function handlePlatformAdminCallback(
        Response $response,
        string $frontend,
        string $returnTo,
        array $profile
    ): Response {
        try {
            $admin = PlatformAdminHelper::upsertFromGoogle($profile);
        } catch (\Throwable $e) {
            $adminHost = PlatformAdminHelper::platformAdminHost();
            $base = $adminHost ? 'https://' . $adminHost : $frontend;
            return $this->redirect(
                $response,
                $base . '/login?error=' . rawurlencode($e->getMessage())
            );
        }

        $sessionId = PlatformAdminHelper::createPlatformSession((int) $admin['id']);
        $adminFrontend = PlatformAdminHelper::platformAdminHost()
            ? 'https://' . PlatformAdminHelper::platformAdminHost()
            : $frontend;
        $dest = $returnTo !== '' && $returnTo[0] === '/' ? $returnTo : '/';
        $target = $adminFrontend . '/auth/callback'
            . '?token=' . rawurlencode($sessionId)
            . '&returnTo=' . rawurlencode($dest);

        return $this->redirect($response, $target, [
            'Set-Cookie' => AuthHelper::sessionCookieHeader($sessionId),
        ]);
    }

    private function handleLoginCallback(
        Response $response,
        string $frontend,
        string $returnTo,
        array $profile,
        array $state
    ): Response {
        $email = strtolower(trim($profile['email']));
        $memberships = AuthHelper::findMembershipsByEmail($email);

        $slug = SppgService::slugify((string) ($state['sppg_slug'] ?? ''));
        if ($slug !== '') {
            $memberships = array_values(array_filter(
                $memberships,
                static fn ($m) => ($m['slug'] ?? '') === $slug
            ));
        }

        $subdomain = SppgService::normalizeSubdomain((string) ($state['sppg_subdomain'] ?? ''));
        if ($subdomain !== '') {
            $memberships = array_values(array_filter(
                $memberships,
                static fn ($m) => ($m['subdomain'] ?? '') === $subdomain
            ));
        }

        // Host tenant cloudy: pastikan user punya membership di tenant host
        $hostSppg = TenantHostHelper::resolveSppgFromHost();
        if ($hostSppg !== null) {
            $hostId = (int) $hostSppg['id'];
            $memberships = array_values(array_filter(
                $memberships,
                static fn ($m) => (int) ($m['sppg_id'] ?? 0) === $hostId
            ));
        }

        if (count($memberships) === 0) {
            return $this->redirect(
                $response,
                $frontend . '/login?error=' . rawurlencode('Akun belum terdaftar. Daftar SPPG baru terlebih dahulu.')
            );
        }

        if (count($memberships) > 1) {
            $pick = AuthHelper::createPickToken($profile, $memberships);
            return $this->redirect($response, $frontend . '/pilih-sppg?pick=' . rawurlencode($pick));
        }

        $user = AuthHelper::getUserById((int) $memberships[0]['id']);
        if (!$user) {
            throw new \RuntimeException('User tidak ditemukan');
        }

        AuthHelper::upsertGoogleUser($profile, (int) $user['sppg_id']);
        $user = AuthHelper::getUserById((int) $user['id']);
        $sessionId = AuthHelper::createSession((int) $user['id'], (int) $user['sppg_id']);

        $target = $frontend . '/auth/callback'
            . '?token=' . rawurlencode($sessionId)
            . '&returnTo=' . rawurlencode($returnTo);

        return $this->redirect($response, $target, [
            'Set-Cookie' => AuthHelper::sessionCookieHeader($sessionId),
        ]);
    }

    /** POST /auth/complete-pick */
    public function completePick(Request $request, Response $response): Response
    {
        $body = json_decode((string) $request->getBody(), true);
        $body = is_array($body) ? $body : [];
        $pick = trim((string) ($body['pick'] ?? ''));
        $sppgId = (int) ($body['sppg_id'] ?? 0);

        if ($pick === '' || $sppgId <= 0) {
            return $this->json($response, ['success' => false, 'message' => 'Data tidak lengkap'], 422);
        }

        $user = AuthHelper::consumePickToken($pick, $sppgId);
        if (!$user) {
            return $this->json($response, ['success' => false, 'message' => 'Sesi pilihan tidak valid atau kedaluwarsa'], 403);
        }

        $sessionId = AuthHelper::createSession((int) $user['id'], (int) $user['sppg_id']);
        return $this->json($response, [
            'success' => true,
            'data' => [
                'token' => $sessionId,
                'user' => AuthHelper::publicUser($user),
            ],
        ])->withHeader('Set-Cookie', AuthHelper::sessionCookieHeader($sessionId));
    }

    /** GET /auth/pick-options?pick= */
    public function pickOptions(Request $request, Response $response): Response
    {
        $pick = trim((string) ($request->getQueryParams()['pick'] ?? ''));
        if ($pick === '') {
            return $this->json($response, ['success' => false, 'message' => 'Token tidak valid'], 422);
        }

        $stmt = AuthHelper::pdo()->prepare(
            'SELECT memberships FROM auth_pick_tokens WHERE token = ? AND expires_at > NOW() LIMIT 1'
        );
        $stmt->execute([$pick]);
        $row = $stmt->fetch();
        if (!$row) {
            return $this->json($response, ['success' => false, 'message' => 'Sesi pilihan kedaluwarsa'], 403);
        }

        $memberships = json_decode((string) $row['memberships'], true);
        return $this->json($response, [
            'success' => true,
            'data' => is_array($memberships) ? $memberships : [],
        ]);
    }

    /** GET /auth/me */
    public function me(Request $request, Response $response): Response
    {
        $user = $request->getAttribute('user');
        if (!$user) {
            return $this->json($response, ['success' => false, 'message' => 'Belum login'], 401);
        }

        if (PlatformAdminHelper::isPlatformAdminRole($user['role'] ?? null)) {
            return $this->json($response, [
                'success' => true,
                'user' => AuthHelper::publicUser($user),
                'platform_admin' => true,
            ]);
        }

        $sppgId = (int) ($user['sppg_id'] ?? 0);
        $sppg = $this->sppg->findById($sppgId);
        $sub = $this->sppg->getActiveSubscription($sppgId);

        return $this->json($response, [
            'success' => true,
            'user' => AuthHelper::publicUser($user),
            'sppg' => $sppg ? $this->sppg->publicProfile($sppg) : null,
            'subscription' => $this->sppg->publicSubscription($sub),
            'subscription_active' => \App\Helpers\TenantHelper::subscriptionAllowsAppAccess($sppg, $sub),
        ]);
    }

    /** POST /auth/logout */
    public function logout(Request $request, Response $response): Response
    {
        $sessionId = AuthHelper::extractSessionId($request);
        if ($sessionId) {
            AuthHelper::destroySession($sessionId);
        }
        return $this->json($response, ['success' => true, 'message' => 'Logout berhasil'])
            ->withHeader('Set-Cookie', AuthHelper::clearSessionCookieHeader());
    }
}

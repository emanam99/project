<?php

namespace App\Middleware;

use App\Config\RoleConfig;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Psr\Http\Server\MiddlewareInterface;
use Psr\Http\Server\RequestHandlerInterface;
use Nyholm\Psr7\Response;

/**
 * Middleware untuk mengecek akses aplikasi berdasarkan role user
 * 
 * Middleware ini akan mengecek apakah user memiliki role yang diizinkan
 * untuk mengakses aplikasi tertentu (uwaba atau lembaga).
 * 
 * Usage:
 * $app->get('/api/endpoint', ...)
 *     ->add(new AppAccessMiddleware('uwaba'));
 */
class AppAccessMiddleware implements MiddlewareInterface
{
    private $requiredApp;
    private $allowedRoles;

    /**
     * @param string $requiredApp Key aplikasi yang diizinkan ('uwaba' atau 'lembaga')
     * @param array $allowedRoles Optional: array role yang diizinkan (jika tidak di-set, akan menggunakan RoleConfig)
     */
    public function __construct(string $requiredApp, array $allowedRoles = [])
    {
        $this->requiredApp = strtolower($requiredApp);
        $this->allowedRoles = $allowedRoles;
    }

    public function process(ServerRequestInterface $request, RequestHandlerInterface $handler): ResponseInterface
    {
        // Ambil user data dari request (dari AuthMiddleware)
        $user = $request->getAttribute('user');

        if (!$user || !is_array($user)) {
            error_log("AppAccessMiddleware: User data tidak ditemukan atau bukan array");
            $response = new Response();
            $response->getBody()->write(json_encode([
                'success' => false,
                'message' => 'User tidak terautentikasi'
            ], JSON_UNESCAPED_UNICODE));
            return $response
                ->withStatus(401)
                ->withHeader('Content-Type', 'application/json; charset=utf-8');
        }

        // Ambil role dari user - prioritaskan role_key (sistem role baru)
        // Urutan fallback: role_key -> user_role -> level
        // Catatan: role_key adalah field utama untuk sistem role baru
        // Fallback ke field lain hanya untuk backward compatibility
        $roleKey = $user['role_key'] ?? $user['user_role'] ?? $user['level'] ?? null;

        if (!$roleKey) {
            error_log("AppAccessMiddleware: Role tidak ditemukan. User data: " . json_encode($user));
            $response = new Response();
            $response->getBody()->write(json_encode([
                'success' => false,
                'message' => 'Role user tidak ditemukan'
            ], JSON_UNESCAPED_UNICODE));
            return $response
                ->withStatus(403)
                ->withHeader('Content-Type', 'application/json; charset=utf-8');
        }

        $roleKey = strtolower($roleKey);

        // Cek akses aplikasi
        $hasAccess = false;

        // Prioritas 1: allowed_apps dari token (satu user bisa akses uwaba + mybeddian)
        $tokenAllowedApps = $user['allowed_apps'] ?? [];
        if (is_array($tokenAllowedApps) && in_array($this->requiredApp, array_map('strtolower', $tokenAllowedApps))) {
            $hasAccess = true;
        }

        if (!$hasAccess && !empty($this->allowedRoles)) {
            // Jika ada custom allowed roles, gunakan itu
            $hasAccess = in_array($roleKey, array_map('strtolower', $this->allowedRoles));
        }
        if (!$hasAccess) {
            // Gunakan RoleConfig: cek role_key dan semua all_roles
            $hasAccess = RoleConfig::canAccessApp($roleKey, $this->requiredApp);
            if (!$hasAccess && !empty($user['all_roles']) && is_array($user['all_roles'])) {
                foreach ($user['all_roles'] as $r) {
                    if (RoleConfig::canAccessApp(strtolower(trim((string)$r)), $this->requiredApp)) {
                        $hasAccess = true;
                        break;
                    }
                }
            }
        }

        if (!$hasAccess) {
            $appLabel = RoleConfig::APPS[$this->requiredApp] ?? $this->requiredApp;
            error_log("AppAccessMiddleware: Akses ditolak. User role: $roleKey, Required app: {$this->requiredApp}");
            
            $response = new Response();
            $response->getBody()->write(json_encode([
                'success' => false,
                'message' => "Akses ditolak. Role Anda tidak memiliki izin untuk mengakses aplikasi {$appLabel}.",
                'required_app' => $this->requiredApp,
                'your_role' => $roleKey
            ], JSON_UNESCAPED_UNICODE));
            return $response
                ->withStatus(403)
                ->withHeader('Content-Type', 'application/json; charset=utf-8');
        }

        return $handler->handle($request);
    }
}


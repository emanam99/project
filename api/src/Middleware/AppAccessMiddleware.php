<?php

namespace App\Middleware;

use App\Config\RoleConfig;
use App\Helpers\RoleHelper;
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

        $tokenAllowedApps = $user['allowed_apps'] ?? [];
        $hasAccess = false;

        // Prioritas 1: allowed_apps dari token (gabungan semua role saat login)
        if (is_array($tokenAllowedApps) && in_array($this->requiredApp, array_map('strtolower', $tokenAllowedApps), true)) {
            $hasAccess = true;
        }

        $unionKeys = RoleHelper::normalizeTokenRoleKeysUnion($user);
        $roleKeyForLog = $unionKeys !== [] ? implode(',', $unionKeys) : '';

        if (!$hasAccess && !empty($this->allowedRoles)) {
            $hasAccess = RoleHelper::tokenHasAnyRoleKey($user, $this->allowedRoles);
        }

        if (!$hasAccess) {
            $hasAccess = RoleHelper::tokenCanAccessAppFromRoleConfig($user, $this->requiredApp);
        }

        if (!$hasAccess) {
            $pid = RoleHelper::getPengurusIdFromPayload($user);
            if ($pid !== null && $pid > 0) {
                foreach (RoleHelper::getUserRoles($pid) as $row) {
                    $k = str_replace(' ', '_', strtolower(trim((string) ($row['role_key'] ?? ''))));
                    if ($k !== '' && RoleConfig::canAccessApp($k, $this->requiredApp)) {
                        $hasAccess = true;
                        break;
                    }
                }
            }
        }

        if (!$hasAccess && $unionKeys === []
            && (!is_array($tokenAllowedApps) || !in_array($this->requiredApp, array_map('strtolower', $tokenAllowedApps), true))) {
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

        if (!$hasAccess) {
            $appLabel = RoleConfig::APPS[$this->requiredApp] ?? $this->requiredApp;
            error_log("AppAccessMiddleware: Akses ditolak. User roles: $roleKeyForLog, Required app: {$this->requiredApp}");
            
            $response = new Response();
            $response->getBody()->write(json_encode([
                'success' => false,
                'message' => "Akses ditolak. Role Anda tidak memiliki izin untuk mengakses aplikasi {$appLabel}.",
                'required_app' => $this->requiredApp,
                'your_role' => $unionKeys[0] ?? '',
                'your_roles' => $unionKeys,
            ], JSON_UNESCAPED_UNICODE));
            return $response
                ->withStatus(403)
                ->withHeader('Content-Type', 'application/json; charset=utf-8');
        }

        return $handler->handle($request);
    }
}


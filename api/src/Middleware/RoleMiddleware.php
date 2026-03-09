<?php

namespace App\Middleware;

use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Psr\Http\Server\MiddlewareInterface;
use Psr\Http\Server\RequestHandlerInterface;
use Nyholm\Psr7\Response;
use App\Helpers\RoleHelper;

class RoleMiddleware implements MiddlewareInterface
{
    private $allowedRoles;

    public function __construct(array $allowedRoles = [])
    {
        $this->allowedRoles = $allowedRoles;
    }

    public function process(ServerRequestInterface $request, RequestHandlerInterface $handler): ResponseInterface
    {
        // Ambil user data dari request (dari AuthMiddleware)
        $user = $request->getAttribute('user');

        if (!$user || !is_array($user)) {
            error_log("RoleMiddleware: User data tidak ditemukan atau bukan array. User: " . json_encode($user));
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
        // Urutan fallback: role_key -> user_role -> level -> role
        // Catatan: role_key adalah field utama untuk sistem role baru
        // Fallback ke field lain hanya untuk backward compatibility
        $userRole = $user['role_key'] ?? $user['user_role'] ?? $user['level'] ?? $user['role'] ?? null;

        if (!$userRole) {
            error_log("RoleMiddleware: Role tidak ditemukan. User data: " . json_encode($user));
            $response = new Response();
            $response->getBody()->write(json_encode([
                'success' => false,
                'message' => 'Role user tidak ditemukan',
                'debug' => ['user_keys' => array_keys($user)]
            ], JSON_UNESCAPED_UNICODE));
            return $response
                ->withStatus(403)
                ->withHeader('Content-Type', 'application/json; charset=utf-8');
        }

        // Normalize untuk perbandingan dan log
        $userRole = str_replace(' ', '_', strtolower(trim((string) $userRole)));
        $allowedRoles = array_map(function ($r) {
            return str_replace(' ', '_', strtolower(trim((string) $r)));
        }, $this->allowedRoles);

        $hasAllowedRole = false;
        $dbRolesChecked = false;
        $dbRoleKeys = [];

        // 1) Prioritas: cek role dari database berdasarkan pengurus_id (untuk aplikasi uwaba pakai pengurus id, bukan user id)
        $pengurusId = RoleHelper::getPengurusIdFromPayload($user);
        if ($pengurusId !== null && $pengurusId > 0 && !empty($this->allowedRoles)) {
            try {
                $userRoles = RoleHelper::getUserRoles($pengurusId);
                $dbRolesChecked = true;
                foreach ($userRoles as $role) {
                    $roleKey = str_replace(' ', '_', strtolower(trim($role['role_key'] ?? '')));
                    $dbRoleKeys[] = $roleKey;
                    if (in_array($roleKey, $allowedRoles)) {
                        $hasAllowedRole = true;
                        break;
                    }
                }
            } catch (\Exception $e) {
                error_log("RoleMiddleware: Error checking multiple roles: " . $e->getMessage());
            }
        }

        // 2) Fallback: role dari token (role_key, all_roles)
        if (!$hasAllowedRole) {
            $hasAllowedRole = in_array($userRole, $allowedRoles);
        }
        if (!$hasAllowedRole && !empty($user['all_roles']) && is_array($user['all_roles'])) {
            foreach ($user['all_roles'] as $r) {
                $rNorm = str_replace(' ', '_', strtolower(trim((string) $r)));
                if (in_array($rNorm, $allowedRoles)) {
                    $hasAllowedRole = true;
                    break;
                }
            }
        }

        // 2b) Untuk akses santri: jika token punya santri_id, anggap punya role santri
        if (!$hasAllowedRole && in_array('santri', $allowedRoles) && isset($user['santri_id']) && (int)$user['santri_id'] > 0) {
            $hasAllowedRole = true;
        }

        // 2c) Untuk akses toko (Mybeddian): jika token punya toko_id, anggap punya role toko
        if (!$hasAllowedRole && in_array('toko', $allowedRoles) && isset($user['toko_id']) && (int)$user['toko_id'] > 0) {
            $hasAllowedRole = true;
        }

        if (!empty($this->allowedRoles) && !$hasAllowedRole) {
            $pengurusIdForLog = RoleHelper::getPengurusIdFromPayload($user);
            error_log("RoleMiddleware: Akses ditolak. user_id=" . ($user['user_id'] ?? $user['id'] ?? '') . ", pengurus_id=" . ($pengurusIdForLog ?? '') . ", role_from_token=$userRole, required=" . json_encode($allowedRoles) . ", db_checked=" . ($dbRolesChecked ? '1' : '0') . ", db_roles=" . json_encode($dbRoleKeys));
            $response = new Response();
            $response->getBody()->write(json_encode([
                'success' => false,
                'message' => 'Akses ditolak. Role Anda tidak memiliki izin untuk mengakses endpoint ini.',
                'required_roles' => $this->allowedRoles,
                'your_role' => $userRole
            ], JSON_UNESCAPED_UNICODE));
            return $response
                ->withStatus(403)
                ->withHeader('Content-Type', 'application/json; charset=utf-8');
        }

        return $handler->handle($request);
    }
}


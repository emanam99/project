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

        // Normalize role (case insensitive)
        $userRole = strtolower($userRole);
        $allowedRoles = array_map('strtolower', $this->allowedRoles);

        // Cek apakah user memiliki role yang diizinkan
        // 1) role_key utama
        $hasAllowedRole = in_array($userRole, $allowedRoles);

        // 2) all_roles dari token (satu user bisa pengurus + santri)
        if (!$hasAllowedRole && !empty($user['all_roles']) && is_array($user['all_roles'])) {
            foreach ($user['all_roles'] as $r) {
                if (in_array(strtolower(trim((string)$r)), $allowedRoles)) {
                    $hasAllowedRole = true;
                    break;
                }
            }
        }

        // 2b) Untuk akses santri: jika token punya santri_id, anggap punya role santri (user gabungan pengurus+santri)
        if (!$hasAllowedRole && in_array('santri', $allowedRoles) && isset($user['santri_id']) && (int)$user['santri_id'] > 0) {
            $hasAllowedRole = true;
        }

        // 2c) Untuk akses toko (Mybeddian): jika token punya toko_id, anggap punya role toko
        if (!$hasAllowedRole && in_array('toko', $allowedRoles) && isset($user['toko_id']) && (int)$user['toko_id'] > 0) {
            $hasAllowedRole = true;
        }

        // 3) Jika belum match dan user punya user_id (pengurus), cek role dari database
        if (!$hasAllowedRole && !empty($this->allowedRoles) && (isset($user['user_id']) || isset($user['id']))) {
            $userId = $user['user_id'] ?? $user['id'];
            try {
                $userRoles = RoleHelper::getUserRoles((int)$userId);
                foreach ($userRoles as $role) {
                    $roleKey = strtolower(trim($role['role_key'] ?? ''));
                    if (in_array($roleKey, $allowedRoles)) {
                        $hasAllowedRole = true;
                        break;
                    }
                }
            } catch (\Exception $e) {
                error_log("RoleMiddleware: Error checking multiple roles: " . $e->getMessage());
            }
        }

        if (!empty($this->allowedRoles) && !$hasAllowedRole) {
            error_log("RoleMiddleware: Akses ditolak. User role: $userRole, Required: " . json_encode($allowedRoles));
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


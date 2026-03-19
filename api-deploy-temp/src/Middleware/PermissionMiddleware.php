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
 * Middleware untuk mengecek permission user
 * 
 * Middleware ini akan mengecek apakah user memiliki permission tertentu
 * untuk mengakses endpoint.
 * 
 * Usage:
 * $app->get('/api/endpoint', ...)
 *     ->add(new PermissionMiddleware('manage_users'));
 */
class PermissionMiddleware implements MiddlewareInterface
{
    private $requiredPermission;

    /**
     * @param string $requiredPermission Key permission yang diperlukan
     */
    public function __construct(string $requiredPermission)
    {
        $this->requiredPermission = strtolower($requiredPermission);
    }

    public function process(ServerRequestInterface $request, RequestHandlerInterface $handler): ResponseInterface
    {
        // Ambil user data dari request (dari AuthMiddleware)
        $user = $request->getAttribute('user');

        if (!$user || !is_array($user)) {
            error_log("PermissionMiddleware: User data tidak ditemukan atau bukan array");
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
            error_log("PermissionMiddleware: Role tidak ditemukan. User data: " . json_encode($user));
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

        // Cek permission - prioritaskan permissions array dari token (sudah digabungkan dari semua roles)
        // Jika permissions array ada, gunakan itu. Jika tidak, gunakan RoleHelper untuk cek semua roles user
        $hasPermission = false;
        
        if (isset($user['permissions']) && is_array($user['permissions'])) {
            // Gunakan permissions array dari token (sudah digabungkan dari semua roles)
            $hasPermission = in_array(strtolower($this->requiredPermission), array_map('strtolower', $user['permissions']));
            
            error_log("PermissionMiddleware: Checking permission from token. Required: {$this->requiredPermission}, User permissions: " . json_encode($user['permissions']) . ", Has permission: " . ($hasPermission ? 'true' : 'false'));
        } else {
            // Fallback: gunakan RoleHelper untuk cek semua roles user (jika user_id tersedia)
            if (isset($user['user_id']) || isset($user['id'])) {
                $userId = $user['user_id'] ?? $user['id'];
                $hasPermission = RoleHelper::hasPermission($userId, $this->requiredPermission);
                
                error_log("PermissionMiddleware: Checking permission via RoleHelper for user ID: $userId, Required: {$this->requiredPermission}, Has permission: " . ($hasPermission ? 'true' : 'false'));
            } else {
                // Fallback terakhir: cek permission dari role_key tunggal (untuk backward compatibility)
                $hasPermission = RoleConfig::hasPermission($roleKey, $this->requiredPermission);
                
                error_log("PermissionMiddleware: Checking permission from single role. Role: $roleKey, Required: {$this->requiredPermission}, Has permission: " . ($hasPermission ? 'true' : 'false'));
            }
        }

        if (!$hasPermission) {
            error_log("PermissionMiddleware: Permission ditolak. User role: $roleKey, Required permission: {$this->requiredPermission}, User permissions: " . json_encode($user['permissions'] ?? []));
            
            $response = new Response();
            $response->getBody()->write(json_encode([
                'success' => false,
                'message' => "Akses ditolak. Anda tidak memiliki permission untuk melakukan aksi ini.",
                'required_permission' => $this->requiredPermission,
                'your_role' => $roleKey,
                'your_permissions' => $user['permissions'] ?? []
            ], JSON_UNESCAPED_UNICODE));
            return $response
                ->withStatus(403)
                ->withHeader('Content-Type', 'application/json; charset=utf-8');
        }

        return $handler->handle($request);
    }
}


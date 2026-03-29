<?php

namespace App\Middleware;

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

        $unionKeys = RoleHelper::normalizeTokenRoleKeysUnion($user);
        $roleKeyForLog = $unionKeys !== [] ? implode(',', $unionKeys) : '';

        $permsArr = $user['permissions'] ?? null;
        $hasPermsArray = is_array($permsArr) && count($permsArr) > 0;
        $hasAllRoles = !empty($user['all_roles']) && is_array($user['all_roles']);
        $pengurusId = RoleHelper::getPengurusIdFromPayload($user);

        if ($unionKeys === [] && !$hasPermsArray && !$hasAllRoles && ($pengurusId === null || $pengurusId <= 0)) {
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

        $hasPermission = false;
        if ($hasPermsArray) {
            $hasPermission = in_array($this->requiredPermission, array_map('strtolower', $permsArr), true);
        }
        if (!$hasPermission && $pengurusId !== null && $pengurusId > 0) {
            $hasPermission = RoleHelper::hasPermission($pengurusId, $this->requiredPermission);
        }
        if (!$hasPermission) {
            $hasPermission = RoleHelper::tokenHasPermissionFromRolePolicy($user, $this->requiredPermission);
        }

        if (!$hasPermission) {
            error_log("PermissionMiddleware: Permission ditolak. User roles: $roleKeyForLog, Required permission: {$this->requiredPermission}, User permissions: " . json_encode($user['permissions'] ?? []));
            
            $response = new Response();
            $response->getBody()->write(json_encode([
                'success' => false,
                'message' => "Akses ditolak. Anda tidak memiliki permission untuk melakukan aksi ini.",
                'required_permission' => $this->requiredPermission,
                'your_role' => $unionKeys[0] ?? '',
                'your_roles' => $unionKeys,
                'your_permissions' => $user['permissions'] ?? []
            ], JSON_UNESCAPED_UNICODE));
            return $response
                ->withStatus(403)
                ->withHeader('Content-Type', 'application/json; charset=utf-8');
        }

        return $handler->handle($request);
    }
}


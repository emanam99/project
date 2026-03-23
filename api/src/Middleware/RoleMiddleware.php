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

        $allowedRoles = array_map(function ($r) {
            return str_replace(' ', '_', strtolower(trim((string) $r)));
        }, $this->allowedRoles);

        $hasAllowedRole = false;
        $dbRolesChecked = false;
        $dbRoleKeys = [];

        // 1) Prioritas: cek role dari database berdasarkan pengurus_id (semua baris pengurus___role, urutan tidak penting)
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

        // 2) Token: gabungan role_key / user_role / level / role / all_roles (sama dengan RoleHelper)
        if (!$hasAllowedRole && !empty($this->allowedRoles)) {
            $hasAllowedRole = RoleHelper::tokenHasAnyRoleKey($user, $this->allowedRoles);
        }

        $userRole = '';
        $userRoleRaw = $user['role_key'] ?? $user['user_role'] ?? $user['level'] ?? $user['role'] ?? null;
        if ($userRoleRaw !== null && $userRoleRaw !== '') {
            $userRole = str_replace(' ', '_', strtolower(trim((string) $userRoleRaw)));
        }

        $union = RoleHelper::normalizeTokenRoleKeysUnion($user);

        // 2b) Santri / toko: sebelum cek "role tidak ditemukan" (token bisa minim field)
        if (!$hasAllowedRole && in_array('santri', $allowedRoles, true) && isset($user['santri_id']) && (int) $user['santri_id'] > 0) {
            $hasAllowedRole = true;
        }
        if (!$hasAllowedRole && in_array('toko', $allowedRoles, true) && isset($user['toko_id']) && (int) $user['toko_id'] > 0) {
            $hasAllowedRole = true;
        }

        // Tidak ada petunjuk role di token & tidak bisa cek DB pengurus → tolak
        if ($union === []
            && ($pengurusId === null || $pengurusId <= 0)
            && (!isset($user['santri_id']) || (int) $user['santri_id'] <= 0)
            && (!isset($user['toko_id']) || (int) $user['toko_id'] <= 0)) {
            error_log("RoleMiddleware: Role tidak ditemukan (tanpa union role, pengurus_id, santri_id, atau toko_id). User keys: " . implode(',', array_keys($user)));
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

        if (!empty($this->allowedRoles) && !$hasAllowedRole) {
            $pengurusIdForLog = RoleHelper::getPengurusIdFromPayload($user);
            error_log("RoleMiddleware: Akses ditolak. user_id=" . ($user['user_id'] ?? $user['id'] ?? '') . ", pengurus_id=" . ($pengurusIdForLog ?? '') . ", role_from_token=$userRole, required=" . json_encode($allowedRoles) . ", db_checked=" . ($dbRolesChecked ? '1' : '0') . ", db_roles=" . json_encode($dbRoleKeys));
            $response = new Response();
            $response->getBody()->write(json_encode([
                'success' => false,
                'message' => 'Akses ditolak. Role Anda tidak memiliki izin untuk mengakses endpoint ini.',
                'required_roles' => $this->allowedRoles,
                'your_role' => $userRole !== '' ? $userRole : ($union[0] ?? ''),
                'your_roles' => $union,
            ], JSON_UNESCAPED_UNICODE));
            return $response
                ->withStatus(403)
                ->withHeader('Content-Type', 'application/json; charset=utf-8');
        }

        return $handler->handle($request);
    }
}


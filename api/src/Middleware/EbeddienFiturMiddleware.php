<?php

declare(strict_types=1);

namespace App\Middleware;

use App\Database;
use App\Helpers\RoleHelper;
use Nyholm\Psr7\Response;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Psr\Http\Server\MiddlewareInterface;
use Psr\Http\Server\RequestHandlerInterface;

/**
 * Akses endpoint staff eBeddien: utama lewat role___fitur + app___fitur (selector kode menu/aksi).
 * Tanpa assignment fitur → fallback daftar role dari tabel ebeddien_legacy_route_role (LegacyRouteRoles).
 * Punya assignment tapi tidak cocok selector → fallback legacy yang sama (mis. santri daftar punya fitur lain saja).
 * Santri/toko (tanpa union role staff) tetap memakai legacy bila termasuk daftar.
 */
class EbeddienFiturMiddleware implements MiddlewareInterface
{
    /** @var list<string> */
    private array $selectors;

    /** @var list<string> */
    private array $legacyRoles;

    /**
     * @param list<string> $selectors Kode persis atau PREFIX:awalan (lihat RoleHelper::tokenMatchesAnyEbeddienFiturSelector)
     * @param list<string> $legacyRoles Fallback dari LegacyRouteRoles::forKey(...) / tabel ebeddien_legacy_route_role
     */
    public function __construct(array $selectors, array $legacyRoles)
    {
        $this->selectors = $selectors;
        $this->legacyRoles = $legacyRoles;
    }

    private function json403(ServerRequestInterface $request, string $message, array $extra = []): ResponseInterface
    {
        $response = new Response();
        $payload = array_merge([
            'success' => false,
            'message' => $message,
        ], $extra);
        $response->getBody()->write(json_encode($payload, JSON_UNESCAPED_UNICODE));

        return $response
            ->withStatus(403)
            ->withHeader('Content-Type', 'application/json; charset=utf-8');
    }

    private function legacyMatches(array $user): bool
    {
        if ($this->legacyRoles === []) {
            return false;
        }
        $allowed = array_map(static function ($r) {
            return str_replace(' ', '_', strtolower(trim((string) $r)));
        }, $this->legacyRoles);

        $pengurusId = RoleHelper::getPengurusIdFromPayload($user);
        if ($pengurusId !== null && $pengurusId > 0) {
            try {
                foreach (RoleHelper::getUserRoles($pengurusId) as $role) {
                    $rk = str_replace(' ', '_', strtolower(trim((string) ($role['role_key'] ?? ''))));
                    if (in_array($rk, $allowed, true)) {
                        return true;
                    }
                }
            } catch (\Throwable $e) {
                error_log('EbeddienFiturMiddleware legacy roles: ' . $e->getMessage());
            }
        }

        if (RoleHelper::tokenHasAnyRoleKey($user, $this->legacyRoles)) {
            return true;
        }
        if (in_array('santri', $allowed, true) && isset($user['santri_id']) && (int) $user['santri_id'] > 0) {
            return true;
        }
        if (in_array('toko', $allowed, true) && isset($user['toko_id']) && (int) $user['toko_id'] > 0) {
            return true;
        }

        return false;
    }

    public function process(ServerRequestInterface $request, RequestHandlerInterface $handler): ResponseInterface
    {
        $user = $request->getAttribute('user');
        if (!$user || !is_array($user)) {
            $response = new Response();
            $response->getBody()->write(json_encode([
                'success' => false,
                'message' => 'User tidak terautentikasi',
            ], JSON_UNESCAPED_UNICODE));

            return $response
                ->withStatus(401)
                ->withHeader('Content-Type', 'application/json; charset=utf-8');
        }

        $union = RoleHelper::normalizeTokenRoleKeysUnion($user);
        $pengurusId = RoleHelper::getPengurusIdFromPayload($user);
        if ($union === []
            && ($pengurusId === null || $pengurusId <= 0)
            && (!isset($user['santri_id']) || (int) $user['santri_id'] <= 0)
            && (!isset($user['toko_id']) || (int) $user['toko_id'] <= 0)) {
            return $this->json403($request, 'Role user tidak ditemukan', ['debug' => ['user_keys' => array_keys($user)]]);
        }

        $db = Database::getInstance()->getConnection();
        $hasFiturAssign = RoleHelper::tokenUnionHasAnyEbeddienFiturAssignment($db, $user);

        if (!$hasFiturAssign) {
            if ($this->legacyMatches($user)) {
                return $handler->handle($request);
            }
            $userRoleRaw = $user['role_key'] ?? $user['user_role'] ?? $user['level'] ?? $user['role'] ?? null;
            $userRole = $userRoleRaw !== null && $userRoleRaw !== ''
                ? str_replace(' ', '_', strtolower(trim((string) $userRoleRaw)))
                : '';

            return $this->json403($request, 'Akses ditolak. Role Anda tidak memiliki izin untuk mengakses endpoint ini.', [
                'required_roles' => $this->legacyRoles,
                'your_role' => $userRole !== '' ? $userRole : ($union[0] ?? ''),
                'your_roles' => $union,
            ]);
        }

        if ($this->selectors === []) {
            return $this->json403($request, 'Akses ditolak. Konfigurasi fitur endpoint tidak valid.');
        }

        if (RoleHelper::tokenMatchesAnyEbeddienFiturSelector($db, $user, $this->selectors)) {
            return $handler->handle($request);
        }

        // User sudah punya baris role___fitur eBeddien (mis. hanya menu umum) tapi belum punya kode selector
        // endpoint ini — tetap izinkan bila token masuk daftar legacy route (santri daftar, staff PSB, super_admin).
        // Controller tetap menegakkan IDOR (santri hanya data sendiri).
        if ($this->legacyMatches($user)) {
            return $handler->handle($request);
        }

        return $this->json403($request, 'Akses ditolak. Role Anda tidak memiliki izin untuk mengakses endpoint ini (fitur menu/aksi).', [
            'your_roles' => $union,
        ]);
    }
}

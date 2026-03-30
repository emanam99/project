<?php

namespace App\Middleware;

use App\Auth\JwtAuth;
use App\Database;
use App\Helpers\RoleHelper;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Psr\Http\Server\MiddlewareInterface;
use Psr\Http\Server\RequestHandlerInterface;
/**
 * Jika Bearer token valid (dan session V2 valid bila ada), set attribute user — jika tidak, lanjut tanpa user.
 * Dipakai GET publik yang perilakunya berbeda untuk pengguna login vs anonim.
 */
class OptionalAuthMiddleware implements MiddlewareInterface
{
    private $jwt;
    private $db;

    public function __construct()
    {
        $this->jwt = new JwtAuth();
        $this->db = Database::getInstance()->getConnection();
    }

    public function process(ServerRequestInterface $request, RequestHandlerInterface $handler): ResponseInterface
    {
        $authHeader = $request->getHeaderLine('Authorization');
        if (empty($authHeader) || !preg_match('/Bearer\s+(.*)$/i', $authHeader, $matches)) {
            return $handler->handle($request);
        }

        $token = $matches[1];
        $payload = $this->jwt->validateToken($token);
        if (!$payload || !is_array($payload)) {
            return $handler->handle($request);
        }

        $isSantriDaftarOnly = RoleHelper::tokenIsSantriDaftarContext($payload);
        $jti = $payload['jti'] ?? null;
        if ($jti !== null && !$isSantriDaftarOnly) {
            $sessionHash = hash('sha256', $jti);
            $userIdFromToken = (int) ($payload['user_id'] ?? 0);
            $usersId = isset($payload['users_id']) && (int) $payload['users_id'] > 0
                ? (int) $payload['users_id']
                : null;
            if ($usersId === null && $userIdFromToken > 0) {
                try {
                    $stmt = $this->db->prepare('SELECT id_user FROM pengurus WHERE id = ? LIMIT 1');
                    $stmt->execute([$userIdFromToken]);
                    $row = $stmt->fetch(\PDO::FETCH_ASSOC);
                    $usersId = $row && !empty($row['id_user']) ? (int) $row['id_user'] : $userIdFromToken;
                } catch (\Throwable $e) {
                    $usersId = $userIdFromToken;
                }
            }
            if ($usersId === null || $usersId <= 0) {
                return $handler->handle($request);
            }
            try {
                $stmt = $this->db->prepare('SELECT id FROM user___sessions WHERE session_token_hash = ? AND user_id = ? LIMIT 1');
                $stmt->execute([$sessionHash, $usersId]);
                $sessionRow = $stmt->fetch(\PDO::FETCH_ASSOC);
                if (!$sessionRow) {
                    return $handler->handle($request);
                }
                $this->db->prepare('UPDATE user___sessions SET last_activity_at = NOW() WHERE id = ?')->execute([$sessionRow['id']]);
            } catch (\Throwable $e) {
                // Tabel session belum ada: anggap token sah
            }
        }

        if (!isset($payload['is_real_super_admin'])) {
            $pid = RoleHelper::getPengurusIdFromPayload($payload);
            if ($pid !== null && $pid > 0) {
                $payload['is_real_super_admin'] = RoleHelper::pengurusHasSuperAdminRole($pid);
            } else {
                $payload['is_real_super_admin'] = false;
            }
        }

        $request = $request->withAttribute('user', $payload);

        return $handler->handle($request);
    }
}

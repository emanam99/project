<?php

namespace App\Middleware;

use App\Auth\JwtAuth;
use App\Database;
use App\Helpers\RoleHelper;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Psr\Http\Server\MiddlewareInterface;
use Psr\Http\Server\RequestHandlerInterface;
use Nyholm\Psr7\Response;

class AuthMiddleware implements MiddlewareInterface
{
    private $jwt;
    private $db;

    public function __construct()
    {
        $this->jwt = new JwtAuth();
        $this->db = Database::getInstance()->getConnection();
    }

    private function isVerboseAuthLogEnabled(): bool
    {
        return filter_var((string) (getenv('API_VERBOSE_AUTH_LOG') ?: 'false'), FILTER_VALIDATE_BOOLEAN);
    }

    public function process(ServerRequestInterface $request, RequestHandlerInterface $handler): ResponseInterface
    {
        $authHeader = $request->getHeaderLine('Authorization');
        
        if (empty($authHeader) || !preg_match('/Bearer\s+(.*)$/i', $authHeader, $matches)) {
            $response = new Response();
            $response->getBody()->write(json_encode([
                'success' => false,
                'message' => 'Token tidak ditemukan. Silakan login terlebih dahulu.'
            ], JSON_UNESCAPED_UNICODE));
            return $response
                ->withStatus(401)
                ->withHeader('Content-Type', 'application/json; charset=utf-8');
        }

        $token = $matches[1];

        // Validasi dengan JWT (mode demo telah dihapus)
        $payload = $this->jwt->validateToken($token);

        if (!$payload) {
            error_log("AuthMiddleware: Token validation failed");
            $response = new Response();
            $response->getBody()->write(json_encode([
                'success' => false,
                'message' => 'Token tidak valid atau sudah kadaluarsa. Silakan login kembali.'
            ], JSON_UNESCAPED_UNICODE));
            return $response
                ->withStatus(401)
                ->withHeader('Content-Type', 'application/json; charset=utf-8');
        }

        // Session V2 (jika token punya jti): cek session masih ada & update last_activity. Jika tidak ada = revoked/pruned (limit 3 device) → 401.
        // Pengecualian: konteks app daftar (santri saja, tanpa staff di token) — tidak cek session; multi_role dengan staff tetap cek session.
        $payloadArr = is_array($payload) ? $payload : [];
        $isSantriDaftarOnly = RoleHelper::tokenIsSantriDaftarContext($payloadArr);
        $jti = $payload['jti'] ?? null;
        if ($jti !== null && !$isSantriDaftarOnly) {
            $sessionHash = hash('sha256', $jti);
            $userIdFromToken = (int)($payload['user_id'] ?? 0);
            $usersId = isset($payload['users_id']) && (int)$payload['users_id'] > 0
                ? (int)$payload['users_id']
                : null;
            if ($usersId === null && $userIdFromToken > 0) {
                $stmt = $this->db->prepare("SELECT id_user FROM pengurus WHERE id = ? LIMIT 1");
                $stmt->execute([$userIdFromToken]);
                $row = $stmt->fetch(\PDO::FETCH_ASSOC);
                $usersId = $row && !empty($row['id_user']) ? (int)$row['id_user'] : $userIdFromToken;
            }
            try {
                $stmt = $this->db->prepare("SELECT id FROM user___sessions WHERE session_token_hash = ? AND user_id = ? LIMIT 1");
                $stmt->execute([$sessionHash, $usersId]);
                $sessionRow = $stmt->fetch(\PDO::FETCH_ASSOC);
                if (!$sessionRow) {
                    $response = new Response();
                    $response->getBody()->write(json_encode([
                        'success' => false,
                        'message' => 'Session tidak valid atau sudah logout (maks. 3 perangkat). Silakan login kembali.'
                    ], JSON_UNESCAPED_UNICODE));
                    return $response->withStatus(401)->withHeader('Content-Type', 'application/json; charset=utf-8');
                }
                $this->db->prepare("UPDATE user___sessions SET last_activity_at = NOW() WHERE id = ?")->execute([$sessionRow['id']]);
            } catch (\Throwable $e) {
                // Tabel session belum ada / error: izinkan request agar login tidak tertolak
            }
        }

        // Jangan log full payload (berisi role, user_id, dll). Cukup user_id jika perlu debug.
        if (getenv('APP_ENV') !== 'production' && $this->isVerboseAuthLogEnabled()) {
            $uid = $payload['user_id'] ?? '?';
            error_log("AuthMiddleware: token valid user_id=" . $uid);
        }

        // Token lama mungkin belum berisi is_real_super_admin — isi dari DB agar middleware/controller konsisten.
        if (!isset($payload['is_real_super_admin'])) {
            $pid = RoleHelper::getPengurusIdFromPayload($payload);
            if ($pid !== null && $pid > 0) {
                $payload['is_real_super_admin'] = RoleHelper::pengurusHasSuperAdminRole($pid);
            } else {
                $payload['is_real_super_admin'] = false;
            }
        }

        // Attach user data ke request untuk digunakan di controller
        $request = $request->withAttribute('user', $payload);
        
        return $handler->handle($request);
    }
}


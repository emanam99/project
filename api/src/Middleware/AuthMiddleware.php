<?php

namespace App\Middleware;

use App\Auth\JwtAuth;
use App\Database;
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
        // Pengecualian: role santri (aplikasi mybeddian) tidak cek session — cukup JWT valid, data dari tabel santri.
        $roleKey = strtolower(trim($payload['role_key'] ?? $payload['user_role'] ?? ''));
        $isSantri = ($roleKey === 'santri' || isset($payload['santri_id']));
        $jti = $payload['jti'] ?? null;
        if ($jti !== null && !$isSantri) {
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
        if (getenv('APP_ENV') !== 'production') {
            $uid = $payload['user_id'] ?? '?';
            error_log("AuthMiddleware: token valid user_id=" . $uid);
        }

        // Attach user data ke request untuk digunakan di controller
        $request = $request->withAttribute('user', $payload);
        
        return $handler->handle($request);
    }
}


<?php

declare(strict_types=1);

namespace App\Middleware;

use App\Auth\JwtAuth;
use App\Database;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Psr\Http\Server\MiddlewareInterface;
use Psr\Http\Server\RequestHandlerInterface;

/**
 * Mencatat akses HTTP ke api___access_log (untuk Super Admin → Aktivitas User).
 * Fail-soft: gagal tulis log tidak boleh mengganggu response.
 */
class AccessLogMiddleware implements MiddlewareInterface
{
    /** @var list<string> */
    private const SKIP_PREFIXES = [
        '/api/wa/',
        '/api/watzap/webhook',
        '/api/evolution/',
        '/api/app-install-activity/track',
        '/api/iclock/',
        '/api/payment-transaction/callback',
        '/api/public/',
    ];

    public function process(ServerRequestInterface $request, RequestHandlerInterface $handler): ResponseInterface
    {
        $started = hrtime(true);
        $response = $handler->handle($request);

        try {
            $this->writeLog($request, $response, $started);
        } catch (\Throwable $e) {
            error_log('AccessLogMiddleware: ' . $e->getMessage());
        }

        return $response;
    }

    private function writeLog(ServerRequestInterface $request, ResponseInterface $response, int $startedNs): void
    {
        $method = strtoupper($request->getMethod());
        if ($method === 'OPTIONS' || $method === 'HEAD') {
            return;
        }

        $path = $request->getUri()->getPath();
        if ($path === '' || $path === '/') {
            return;
        }
        // Normalisasi base path /api/public/api → tetap path relatif app
        if (strpos($path, '/api/') === false && strpos($path, 'api/') === false) {
            // tetap log jika ada
        }
        foreach (self::SKIP_PREFIXES as $prefix) {
            if (strpos($path, $prefix) !== false) {
                return;
            }
        }

        $durationMs = (int) max(0, (hrtime(true) - $startedNs) / 1_000_000);
        $status = $response->getStatusCode();
        $routeKey = self::normalizeRouteKey($path);

        $userId = null;
        $pengurusId = null;
        $auth = $request->getHeaderLine('Authorization');
        if ($auth !== '' && preg_match('/Bearer\s+(\S+)/i', $auth, $m)) {
            try {
                $payload = (new JwtAuth())->validateToken($m[1]);
                if (is_array($payload)) {
                    if (!empty($payload['users_id'])) {
                        $userId = (int) $payload['users_id'];
                    }
                    $pid = 0;
                    if (!empty($payload['id_pengurus'])) {
                        $pid = (int) $payload['id_pengurus'];
                    } elseif (!empty($payload['user_id'])) {
                        $pid = (int) $payload['user_id'];
                    }
                    if ($pid > 0) {
                        $pengurusId = $pid;
                    }
                    if ($userId === null && $pengurusId !== null) {
                        try {
                            $pdoTmp = Database::getInstance()->getConnection();
                            $st = $pdoTmp->prepare('SELECT id_user FROM pengurus WHERE id = ? LIMIT 1');
                            $st->execute([$pengurusId]);
                            $row = $st->fetch(\PDO::FETCH_ASSOC);
                            if ($row && !empty($row['id_user'])) {
                                $userId = (int) $row['id_user'];
                            }
                        } catch (\Throwable $e) {
                            // ignore
                        }
                    }
                }
            } catch (\Throwable $e) {
                // ignore invalid token
            }
        }

        // GET tanpa login tidak dilog (kurangi noise publik); mutasi & error tetap dilog
        if ($method === 'GET' && $userId === null && $pengurusId === null && $status < 400) {
            return;
        }

        $server = $request->getServerParams();
        $ip = $server['REMOTE_ADDR'] ?? 'unknown';
        if (!empty($server['HTTP_X_FORWARDED_FOR'])) {
            $ips = explode(',', (string) $server['HTTP_X_FORWARDED_FOR']);
            $ip = trim($ips[0]);
        }
        $ua = $request->getHeaderLine('User-Agent');
        if (strlen($ua) > 500) {
            $ua = substr($ua, 0, 500);
        }

        $pdo = Database::getInstance()->getConnection();
        $stmt = $pdo->prepare(
            'INSERT INTO `api___access_log`
                (`user_id`, `pengurus_id`, `method`, `path`, `route_key`, `status_code`, `duration_ms`, `ip_address`, `user_agent`)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
        );
        $stmt->execute([
            $userId,
            $pengurusId,
            $method,
            mb_substr($path, 0, 255),
            mb_substr($routeKey, 0, 255),
            $status,
            $durationMs,
            mb_substr((string) $ip, 0, 45),
            $ua !== '' ? $ua : null,
        ]);
    }

    public static function normalizeRouteKey(string $path): string
    {
        $path = preg_replace('#/+#', '/', $path) ?: $path;
        // UUID
        $path = preg_replace(
            '#[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}#i',
            ':id',
            $path
        ) ?: $path;
        // Angka murni di segmen
        $path = preg_replace('#/\d+(?=/|$)#', '/:id', $path) ?: $path;

        return $path;
    }
}

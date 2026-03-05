<?php

namespace App\Middleware;

use App\Database;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Psr\Http\Server\MiddlewareInterface;
use Psr\Http\Server\RequestHandlerInterface;
use Nyholm\Psr7\Response;

class RateLimitMiddleware implements MiddlewareInterface
{
    private $db;
    private $maxAttempts;
    private $lockoutDuration;
    private $maxDaftarAttemptsPerNip;
    private $maxDaftarAttempts;
    private $lockoutDaftarSeconds;
    private $disableLocalhost;

    public function __construct()
    {
        $this->db = Database::getInstance()->getConnection();
        $config = require __DIR__ . '/../../config.php';
        $security = $config['security'];
        
        $this->maxAttempts = $security['max_login_attempts'];
        $this->lockoutDuration = $security['lockout_duration'];
        $this->maxDaftarAttemptsPerNip = $security['max_daftar_attempts_per_nip'] ?? 5;
        $this->maxDaftarAttempts = $security['max_daftar_attempts'] ?? 25;
        $this->lockoutDaftarSeconds = $security['lockout_daftar_seconds'] ?? 900;
        $this->disableLocalhost = $security['disable_rate_limit_localhost'] ?? true;

        // Buat tabel rate_limits jika belum ada
        $this->createTableIfNotExists();
    }

    private function createTableIfNotExists(): void
    {
        try {
            $sql = "CREATE TABLE IF NOT EXISTS rate_limits (
                id INT AUTO_INCREMENT PRIMARY KEY,
                ip_address VARCHAR(45) NOT NULL,
                endpoint VARCHAR(255) NOT NULL,
                attempt_count INT DEFAULT 1,
                first_attempt_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                last_attempt_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                locked_until TIMESTAMP NULL,
                INDEX idx_ip_endpoint (ip_address, endpoint),
                INDEX idx_locked_until (locked_until)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci";
            
            $this->db->exec($sql);
        } catch (\Exception $e) {
            error_log("Error creating rate_limits table: " . $e->getMessage());
        }
    }

    public function process(ServerRequestInterface $request, RequestHandlerInterface $handler): ResponseInterface
    {
        $path = $request->getUri()->getPath();
        $ip = $this->getClientIp($request);
        $skipRateLimit = $this->disableLocalhost && $this->isLocalhost($ip);

        // Rate limit daftar UWABA: per NIP (pengurus); Mybeddian: per NIS (santri) — beda orang beda batas
        $isDaftarUwaba = (strpos($path, '/api/v2/auth/daftar') !== false);
        $isDaftarMybeddian = (strpos($path, '/api/mybeddian/v2/auth/daftar') !== false);
        if ($isDaftarUwaba || $isDaftarMybeddian) {
            if (!$skipRateLimit) {
                $daftarInfo = $this->getDaftarRateLimitKey($request, $ip, $path);
                $maxAttempts = $daftarInfo['per_identifier'] ? $this->maxDaftarAttemptsPerNip : $this->maxDaftarAttempts;
                $lockout = $this->checkLockoutWithLimit($daftarInfo['key'], $daftarInfo['endpoint'], $maxAttempts, $this->lockoutDaftarSeconds);
                if ($lockout !== null) {
                    $response = new Response();
                    $response->getBody()->write(json_encode([
                        'success' => false,
                        'message' => "Terlalu banyak percobaan daftar. Coba lagi dalam " . ceil($lockout / 60) . " menit."
                    ], JSON_UNESCAPED_UNICODE));
                    return $this->withCorsHeaders($request, $response->withStatus(429)->withHeader('Content-Type', 'application/json; charset=utf-8'));
                }
            }
        }

        // Rate limit request-ubah-password (cegah spam WA)
        if (strpos($path, '/api/v2/auth/request-ubah-password') !== false) {
            if (!$skipRateLimit) {
                $lockout = $this->checkLockoutWithLimit($ip, '/api/v2/auth/request-ubah-password', 3, 900);
                if ($lockout !== null) {
                    $response = new Response();
                    $response->getBody()->write(json_encode([
                        'success' => false,
                        'message' => 'Terlalu banyak permintaan. Coba lagi dalam ' . ceil($lockout / 60) . ' menit.'
                    ], JSON_UNESCAPED_UNICODE));
                    return $this->withCorsHeaders($request, $response->withStatus(429)->withHeader('Content-Type', 'application/json; charset=utf-8'));
                }
            }
        }

        // Rate limit lupa-password-request (public, cegah spam WA)
        if (strpos($path, '/api/v2/auth/lupa-password-request') !== false) {
            if (!$skipRateLimit) {
                $lockout = $this->checkLockoutWithLimit($ip, '/api/v2/auth/lupa-password-request', 3, 900);
                if ($lockout !== null) {
                    $response = new Response();
                    $response->getBody()->write(json_encode([
                        'success' => false,
                        'message' => 'Terlalu banyak permintaan. Coba lagi dalam ' . ceil($lockout / 60) . ' menit.'
                    ], JSON_UNESCAPED_UNICODE));
                    return $this->withCorsHeaders($request, $response->withStatus(429)->withHeader('Content-Type', 'application/json; charset=utf-8'));
                }
            }
        }

        // Rate limit ubah-password (public, cegah brute force token)
        if (strpos($path, '/api/v2/auth/ubah-password') !== false) {
            if (!$skipRateLimit) {
                $lockout = $this->checkLockoutWithLimit($ip, '/api/v2/auth/ubah-password', 10, 900);
                if ($lockout !== null) {
                    $response = new Response();
                    $response->getBody()->write(json_encode([
                        'success' => false,
                        'message' => 'Terlalu banyak percobaan. Coba lagi dalam ' . ceil($lockout / 60) . ' menit.'
                    ], JSON_UNESCAPED_UNICODE));
                    return $this->withCorsHeaders($request, $response->withStatus(429)->withHeader('Content-Type', 'application/json; charset=utf-8'));
                }
            }
        }

        // Rate limit login
        if (strpos($path, '/api/auth/login') !== false || strpos($path, '/api/v2/auth/login') !== false) {
            if (!$skipRateLimit) {
                $endpoint = strpos($path, '/api/v2/auth/login') !== false ? '/api/v2/auth/login' : '/api/auth/login';
                $lockout = $this->checkLockout($ip, $endpoint);
                if ($lockout !== null) {
                    $response = new Response();
                    $response->getBody()->write(json_encode([
                        'success' => false,
                        'message' => "Terlalu banyak percobaan login. Coba lagi dalam " . ceil($lockout / 60) . " menit."
                    ], JSON_UNESCAPED_UNICODE));
                    return $this->withCorsHeaders($request, $response->withStatus(429)->withHeader('Content-Type', 'application/json; charset=utf-8'));
                }
            }
        }

        // Rate limit get-all-pendaftar (load list Data Pendaftar): 60 request per 5 menit per IP — BUKAN export
        $isGetAllPendaftar = (strpos($path, '/api/pendaftaran/get-all-pendaftar') !== false);
        if ($isGetAllPendaftar && !$skipRateLimit) {
            $lockout = $this->checkLockoutWithLimit($ip, '/api/pendaftaran/get-all-pendaftar', 60, 300);
            if ($lockout !== null) {
                $response = new Response();
                $response->getBody()->write(json_encode([
                    'success' => false,
                    'message' => 'Terlalu banyak permintaan. Coba lagi dalam ' . ceil($lockout / 60) . ' menit.'
                ], JSON_UNESCAPED_UNICODE));
                return $this->withCorsHeaders($request, $response->withStatus(429)->withHeader('Content-Type', 'application/json; charset=utf-8'));
            }
        }

        // Rate limit export (registrasi-by-kondisi): 30 request per 5 menit per IP
        $isExport = (strpos($path, '/api/pendaftaran/registrasi-by-kondisi') !== false);
        if ($isExport && !$skipRateLimit) {
            $lockout = $this->checkLockoutWithLimit($ip, '/api/pendaftaran/export', 30, 300);
            if ($lockout !== null) {
                $response = new Response();
                $response->getBody()->write(json_encode([
                    'success' => false,
                    'message' => 'Terlalu banyak permintaan export. Coba lagi dalam ' . ceil($lockout / 60) . ' menit.'
                ], JSON_UNESCAPED_UNICODE));
                return $this->withCorsHeaders($request, $response->withStatus(429)->withHeader('Content-Type', 'application/json; charset=utf-8'));
            }
        }

        $response = $handler->handle($request);

        // Track daftar attempts: UWABA per NIP, Mybeddian per NIS (atau fallback per IP)
        if (($isDaftarUwaba ?? false) || ($isDaftarMybeddian ?? false)) {
            if (!$skipRateLimit) {
                $daftarInfo = $this->getDaftarRateLimitKey($request, $ip, $path);
                $maxAttempts = $daftarInfo['per_identifier'] ? $this->maxDaftarAttemptsPerNip : $this->maxDaftarAttempts;
                $this->recordAttemptWithLimit($daftarInfo['key'], $daftarInfo['endpoint'], $maxAttempts, $this->lockoutDaftarSeconds);
            }
        }

        // Track request-ubah-password (setiap POST dihitung)
        if (strpos($path, '/api/v2/auth/request-ubah-password') !== false && !$skipRateLimit) {
            $this->recordAttemptWithLimit($ip, '/api/v2/auth/request-ubah-password', 3, 900);
        }

        // Track lupa-password-request (setiap POST dihitung)
        if (strpos($path, '/api/v2/auth/lupa-password-request') !== false && !$skipRateLimit) {
            $this->recordAttemptWithLimit($ip, '/api/v2/auth/lupa-password-request', 3, 900);
        }

        // Track ubah-password (POST saja, untuk limit brute force)
        if ($request->getMethod() === 'POST' && strpos($path, '/api/v2/auth/ubah-password') !== false && !$skipRateLimit) {
            $this->recordAttemptWithLimit($ip, '/api/v2/auth/ubah-password', 10, 900);
        }

        // Track failed login attempts
        if ((strpos($path, '/api/auth/login') !== false || strpos($path, '/api/v2/auth/login') !== false) && !$skipRateLimit) {
            $endpoint = strpos($path, '/api/v2/auth/login') !== false ? '/api/v2/auth/login' : '/api/auth/login';
            if ($response->getStatusCode() === 401) {
                $this->recordFailedAttempt($ip, $endpoint);
            } elseif ($response->getStatusCode() === 200) {
                $this->resetAttempts($ip, $endpoint);
            }
        }

        // Track get-all-pendaftar (load list)
        if ($isGetAllPendaftar && !$skipRateLimit) {
            $this->recordAttemptWithLimit($ip, '/api/pendaftaran/get-all-pendaftar', 60, 300);
        }
        // Track export attempts (registrasi-by-kondisi)
        if ($isExport && !$skipRateLimit) {
            $this->recordAttemptWithLimit($ip, '/api/pendaftaran/export', 30, 300);
        }

        return $response;
    }

    private function checkLockout(string $ip, string $endpoint): ?int
    {
        try {
            $stmt = $this->db->prepare("
                SELECT attempt_count, first_attempt_at, locked_until 
                FROM rate_limits 
                WHERE ip_address = ? AND endpoint = ?
            ");
            $stmt->execute([$ip, $endpoint]);
            $record = $stmt->fetch(\PDO::FETCH_ASSOC);

            if (!$record) {
                return null;
            }

            // Cek apakah masih dalam lockout period
            if ($record['locked_until']) {
                $lockedUntil = strtotime($record['locked_until']);
                $now = time();
                
                if ($now < $lockedUntil) {
                    return $lockedUntil - $now; // Return seconds remaining
                } else {
                    // Lockout period sudah berakhir, reset
                    $this->resetAttempts($ip, $endpoint);
                    return null;
                }
            }

            // Cek apakah sudah mencapai max attempts
            if ($record['attempt_count'] >= $this->maxAttempts) {
                $firstAttempt = strtotime($record['first_attempt_at']);
                $timeSinceFirst = time() - $firstAttempt;
                
                if ($timeSinceFirst < $this->lockoutDuration) {
                    // Set locked_until jika belum ada
                    if (!$record['locked_until']) {
                        $lockedUntil = date('Y-m-d H:i:s', time() + ($this->lockoutDuration - $timeSinceFirst));
                        $updateStmt = $this->db->prepare("
                            UPDATE rate_limits 
                            SET locked_until = ? 
                            WHERE ip_address = ? AND endpoint = ?
                        ");
                        $updateStmt->execute([$lockedUntil, $ip, $endpoint]);
                    }
                    
                    return $this->lockoutDuration - $timeSinceFirst;
                } else {
                    // Lockout duration sudah lewat, reset
                    $this->resetAttempts($ip, $endpoint);
                    return null;
                }
            }

            return null;
        } catch (\Exception $e) {
            error_log("Error checking lockout: " . $e->getMessage());
            return null; // Fail open - allow request if database error
        }
    }

    private function recordFailedAttempt(string $ip, string $endpoint): void
    {
        try {
            $stmt = $this->db->prepare("
                SELECT id, attempt_count, first_attempt_at 
                FROM rate_limits 
                WHERE ip_address = ? AND endpoint = ?
            ");
            $stmt->execute([$ip, $endpoint]);
            $record = $stmt->fetch(\PDO::FETCH_ASSOC);

            $now = date('Y-m-d H:i:s');

            if ($record) {
                // Update existing record
                $newCount = $record['attempt_count'] + 1;
                
                // Jika sudah melewati lockout duration, reset counter
                $firstAttempt = strtotime($record['first_attempt_at']);
                $timeSinceFirst = time() - $firstAttempt;
                
                if ($timeSinceFirst >= $this->lockoutDuration) {
                    // Reset counter
                    $updateStmt = $this->db->prepare("
                        UPDATE rate_limits 
                        SET attempt_count = 1, 
                            first_attempt_at = ?, 
                            last_attempt_at = ?,
                            locked_until = NULL
                        WHERE ip_address = ? AND endpoint = ?
                    ");
                    $updateStmt->execute([$now, $now, $ip, $endpoint]);
                } else {
                    // Increment counter
                    $updateStmt = $this->db->prepare("
                        UPDATE rate_limits 
                        SET attempt_count = ?, 
                            last_attempt_at = ?
                        WHERE ip_address = ? AND endpoint = ?
                    ");
                    $updateStmt->execute([$newCount, $now, $ip, $endpoint]);

                    // Jika mencapai max attempts, set locked_until
                    if ($newCount >= $this->maxAttempts) {
                        $lockedUntil = date('Y-m-d H:i:s', time() + $this->lockoutDuration);
                        $lockStmt = $this->db->prepare("
                            UPDATE rate_limits 
                            SET locked_until = ? 
                            WHERE ip_address = ? AND endpoint = ?
                        ");
                        $lockStmt->execute([$lockedUntil, $ip, $endpoint]);
                    }
                }
            } else {
                // Insert new record
                $insertStmt = $this->db->prepare("
                    INSERT INTO rate_limits (ip_address, endpoint, attempt_count, first_attempt_at, last_attempt_at)
                    VALUES (?, ?, 1, ?, ?)
                ");
                $insertStmt->execute([$ip, $endpoint, $now, $now]);
            }
        } catch (\Exception $e) {
            error_log("Error recording failed attempt: " . $e->getMessage());
        }
    }

    private function resetAttempts(string $ip, string $endpoint): void
    {
        try {
            $stmt = $this->db->prepare("
                DELETE FROM rate_limits 
                WHERE ip_address = ? AND endpoint = ?
            ");
            $stmt->execute([$ip, $endpoint]);
        } catch (\Exception $e) {
            error_log("Error resetting attempts: " . $e->getMessage());
        }
    }

    /** Rate limit dengan max attempts dan window (detik) kustom - untuk daftar */
    private function checkLockoutWithLimit(string $ip, string $endpoint, int $maxAttempts, int $lockoutSeconds): ?int
    {
        try {
            $stmt = $this->db->prepare("
                SELECT attempt_count, first_attempt_at, locked_until 
                FROM rate_limits 
                WHERE ip_address = ? AND endpoint = ?
            ");
            $stmt->execute([$ip, $endpoint]);
            $record = $stmt->fetch(\PDO::FETCH_ASSOC);
            if (!$record) {
                return null;
            }
            if ($record['locked_until']) {
                $lockedUntil = strtotime($record['locked_until']);
                $now = time();
                if ($now < $lockedUntil) {
                    return $lockedUntil - $now;
                }
                $this->resetAttempts($ip, $endpoint);
                return null;
            }
            if ($record['attempt_count'] >= $maxAttempts) {
                $firstAttempt = strtotime($record['first_attempt_at']);
                $timeSinceFirst = time() - $firstAttempt;
                if ($timeSinceFirst < $lockoutSeconds) {
                    if (!$record['locked_until']) {
                        $lockedUntil = date('Y-m-d H:i:s', time() + ($lockoutSeconds - $timeSinceFirst));
                        $this->db->prepare("UPDATE rate_limits SET locked_until = ? WHERE ip_address = ? AND endpoint = ?")
                            ->execute([$lockedUntil, $ip, $endpoint]);
                    }
                    return $lockoutSeconds - $timeSinceFirst;
                }
                $this->resetAttempts($ip, $endpoint);
            }
            return null;
        } catch (\Exception $e) {
            error_log("Error checkLockoutWithLimit: " . $e->getMessage());
            return null;
        }
    }

    private function recordAttemptWithLimit(string $ip, string $endpoint, int $maxAttempts, int $lockoutSeconds): void
    {
        try {
            $stmt = $this->db->prepare("SELECT id, attempt_count, first_attempt_at FROM rate_limits WHERE ip_address = ? AND endpoint = ?");
            $stmt->execute([$ip, $endpoint]);
            $record = $stmt->fetch(\PDO::FETCH_ASSOC);
            $now = date('Y-m-d H:i:s');
            if ($record) {
                $firstAttempt = strtotime($record['first_attempt_at']);
                $timeSinceFirst = time() - $firstAttempt;
                if ($timeSinceFirst >= $lockoutSeconds) {
                    $this->db->prepare("UPDATE rate_limits SET attempt_count = 1, first_attempt_at = ?, last_attempt_at = ?, locked_until = NULL WHERE ip_address = ? AND endpoint = ?")
                        ->execute([$now, $now, $ip, $endpoint]);
                } else {
                    $newCount = $record['attempt_count'] + 1;
                    $this->db->prepare("UPDATE rate_limits SET attempt_count = ?, last_attempt_at = ? WHERE ip_address = ? AND endpoint = ?")
                        ->execute([$newCount, $now, $ip, $endpoint]);
                    if ($newCount >= $maxAttempts) {
                        $lockedUntil = date('Y-m-d H:i:s', time() + $lockoutSeconds);
                        $this->db->prepare("UPDATE rate_limits SET locked_until = ? WHERE ip_address = ? AND endpoint = ?")
                            ->execute([$lockedUntil, $ip, $endpoint]);
                    }
                }
            } else {
                $this->db->prepare("INSERT INTO rate_limits (ip_address, endpoint, attempt_count, first_attempt_at, last_attempt_at) VALUES (?, ?, 1, ?, ?)")
                    ->execute([$ip, $endpoint, $now, $now]);
            }
        } catch (\Exception $e) {
            error_log("Error recordAttemptWithLimit: " . $e->getMessage());
        }
    }

    /**
     * Tambah header CORS pada response (untuk 429 dll) agar browser bisa baca body error.
     * Tanpa ini, respons 429 tampil sebagai "CORS policy: No 'Access-Control-Allow-Origin'".
     */
    private function withCorsHeaders(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $origin = $request->getHeaderLine('Origin');
        $allowOrigin = '*';
        if ($origin !== '' && (cors_origin_is_alutsmani_id($origin) || strpos($origin, 'localhost') !== false
                || strpos($origin, '127.0.0.1') !== false || strpos($origin, ':5173') !== false || strpos($origin, ':5174') !== false || strpos($origin, ':5175') !== false)) {
            $allowOrigin = $origin;
        }
        $headers = [
            'Access-Control-Allow-Origin' => $allowOrigin,
            'Access-Control-Allow-Headers' => 'Content-Type, Authorization, X-Requested-With, X-CSRF-Token, X-Frontend-Base-URL, X-App-Source, Cache-Control, Pragma',
            'Access-Control-Allow-Methods' => 'GET, POST, PUT, DELETE, OPTIONS',
        ];
        if ($allowOrigin !== '*') {
            $headers['Access-Control-Allow-Credentials'] = 'true';
        }
        foreach ($headers as $name => $value) {
            $response = $response->withHeader($name, $value);
        }
        return $response;
    }

    /**
     * Key rate limit daftar: UWABA = per NIP (id_pengurus), Mybeddian = per NIS (nis); fallback per IP.
     * Return ['key' => string, 'per_identifier' => bool, 'endpoint' => string].
     */
    private function getDaftarRateLimitKey(ServerRequestInterface $request, string $ip, string $path): array
    {
        $isMybeddian = (strpos($path, '/api/mybeddian/v2/auth/daftar') !== false);
        $endpoint = $isMybeddian ? '/api/mybeddian/v2/auth/daftar' : '/api/v2/auth/daftar';

        $data = $request->getParsedBody();
        if (!is_array($data)) {
            return ['key' => $ip, 'per_identifier' => false, 'endpoint' => $endpoint];
        }

        if ($isMybeddian) {
            // Mybeddian: NIS santri (body: nis, nik, no_wa)
            $nis = isset($data['nis']) ? trim((string) $data['nis']) : '';
            $nis = preg_replace('/\D/', '', $nis);
            $nis = substr($nis, 0, 41);
            if ($nis === '') {
                return ['key' => $ip, 'per_identifier' => false, 'endpoint' => $endpoint];
            }
            return ['key' => 'nis:' . $nis, 'per_identifier' => true, 'endpoint' => $endpoint];
        }

        // UWABA: NIP pengurus (body: id_pengurus, nik, no_wa)
        $idPengurus = isset($data['id_pengurus']) ? trim((string) $data['id_pengurus']) : '';
        $nip = preg_replace('/\D/', '', $idPengurus);
        $nip = substr($nip, 0, 41);
        if ($nip === '') {
            return ['key' => $ip, 'per_identifier' => false, 'endpoint' => $endpoint];
        }
        return ['key' => 'nip:' . $nip, 'per_identifier' => true, 'endpoint' => $endpoint];
    }

    private function getClientIp(ServerRequestInterface $request): string
    {
        $serverParams = $request->getServerParams();
        
        if (isset($serverParams['HTTP_X_FORWARDED_FOR'])) {
            $ips = explode(',', $serverParams['HTTP_X_FORWARDED_FOR']);
            return trim($ips[0]);
        }
        
        return $serverParams['REMOTE_ADDR'] ?? 'unknown';
    }
    
    /**
     * Cek apakah IP adalah localhost atau IP lokal
     * 
     * @param string $ip IP address
     * @return bool
     */
    private function isLocalhost(string $ip): bool
    {
        // Cek localhost
        if ($ip === '127.0.0.1' || $ip === 'localhost' || $ip === '::1') {
            return true;
        }
        
        // Cek IP lokal (192.168.x.x, 10.x.x.x, 172.16-31.x.x)
        if (preg_match('/^(192\.168\.|10\.|172\.(1[6-9]|2[0-9]|3[01])\.)/', $ip)) {
            return true;
        }
        
        return false;
    }
}


<?php

namespace App\Middleware;

use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Psr\Http\Server\MiddlewareInterface;
use Psr\Http\Server\RequestHandlerInterface;
use Nyholm\Psr7\Response;

class CsrfMiddleware implements MiddlewareInterface
{
    private $excludedMethods = ['GET', 'HEAD', 'OPTIONS'];
    private $tokenName = 'X-CSRF-Token';
    private $sessionKey = 'csrf_token';

    /** Endpoint yang state-less / tidak pakai session browser → skip CSRF */
    private $excludedPaths = [
        'api/auth/login',
        'api/auth/login-nik',
        'api/auth/verify',
        'api/auth/csrf-token',
        'api/v2/auth/login',
        'api/v2/auth/daftar-check',
        'api/v2/auth/daftar-konfirmasi',
        'api/v2/auth/lupa-password-request',
        'api/v2/auth/setup-token',
        'api/v2/auth/setup-akun',
        // Mybeddian (prefix /api/mybeddian)
        'api/mybeddian/v2/auth/login',
        'api/mybeddian/v2/auth/daftar-check',
        'api/mybeddian/v2/auth/daftar-konfirmasi',
        'api/mybeddian/v2/auth/setup-token',
        'api/mybeddian/v2/auth/setup-akun',
        'api/mybeddian/v2/auth/logout',
        'api/mybeddian/v2/profil',
        'api/mybeddian/v2/barang',  // GET/POST/PUT/DELETE dilindungi Bearer token
        'api/v2/auth/request-ubah-password',
        'api/v2/auth/ubah-password-token',
        'api/v2/auth/ubah-password',
        'api/v2/auth/ubah-username-langsung',
        'api/v2/auth/send-otp-ganti-wa',
        'api/v2/auth/verify-otp-ganti-wa',
        'api/v2/auth/request-ubah-username',
        'api/v2/auth/ubah-username-token',
        'api/v2/auth/ubah-username',
        'api/v2/profil/foto',
        'api/v2/auth/sessions', // DELETE revoke session dilindungi Bearer token
        'api/v2/auth/logout',    // POST logout dilindungi Bearer token
        'api/v2/auth/logout-all', // POST logout-all dilindungi Bearer token
        'api/payment-transaction/callback', // POST dari payment gateway eksternal
        'api/payment-transaction/create',   // POST dilindungi Bearer (mybeddian/uwaba dari mybeddian2/uwaba2)
        'api/payment-transaction/',         // PUT/POST cancel, update dilindungi Bearer
        'api/wa/check',   // POST cek nomor WA — dilindungi Bearer (fetch di frontend tanpa CSRF)
        'api/wa/send',    // POST kirim WA — dilindungi Bearer
        'api/wa/edit-message', // POST edit pesan WA — dilindungi Bearer
        'api/wa/incoming', // POST webhook pesan masuk dari server WA (tanpa session browser)
        'api/wa/message-status', // POST update status pesan (sent/delivered/read) dari server WA
    ];

    public function process(ServerRequestInterface $request, RequestHandlerInterface $handler): ResponseInterface
    {
        $method = $request->getMethod();

        // Skip CSRF check untuk method yang aman
        if (in_array($method, $this->excludedMethods)) {
            return $handler->handle($request);
        }

        $path = $request->getUri()->getPath();
        foreach ($this->excludedPaths as $excluded) {
            if (strpos($path, $excluded) !== false) {
                return $handler->handle($request);
            }
        }

        // Start session jika belum ada
        if (session_status() === PHP_SESSION_NONE) {
            session_start();
        }

        // Generate token jika belum ada
        if (!isset($_SESSION[$this->sessionKey])) {
            $_SESSION[$this->sessionKey] = $this->generateToken();
        }

        // Validasi token untuk method yang memerlukan CSRF protection
        $token = $this->getTokenFromRequest($request);
        $sessionToken = $_SESSION[$this->sessionKey] ?? null;

        if (!$token || !$sessionToken || !hash_equals($sessionToken, $token)) {
            $response = new Response();
            $response->getBody()->write(json_encode([
                'success' => false,
                'message' => 'CSRF token tidak valid atau tidak ditemukan'
            ], JSON_UNESCAPED_UNICODE));
            return $response
                ->withStatus(403)
                ->withHeader('Content-Type', 'application/json; charset=utf-8');
        }

        // Regenerate token setelah validasi berhasil (optional, untuk security tambahan)
        // $_SESSION[$this->sessionKey] = $this->generateToken();

        return $handler->handle($request);
    }

    /**
     * Generate CSRF token
     */
    private function generateToken(): string
    {
        return bin2hex(random_bytes(32));
    }

    /**
     * Get token dari request (dari header atau body)
     */
    private function getTokenFromRequest(ServerRequestInterface $request): ?string
    {
        // Cek dari header
        $headerToken = $request->getHeaderLine($this->tokenName);
        if (!empty($headerToken)) {
            return $headerToken;
        }

        // Cek dari body (untuk form data)
        $body = $request->getParsedBody();
        if (is_array($body) && isset($body['csrf_token'])) {
            return $body['csrf_token'];
        }

        // Cek dari query params (untuk GET dengan token, meskipun tidak recommended)
        $queryParams = $request->getQueryParams();
        if (isset($queryParams['csrf_token'])) {
            return $queryParams['csrf_token'];
        }

        return null;
    }

    /**
     * Get current CSRF token (untuk digunakan di frontend)
     */
    public static function getToken(): ?string
    {
        if (session_status() === PHP_SESSION_NONE) {
            session_start();
        }
        
        if (!isset($_SESSION['csrf_token'])) {
            $_SESSION['csrf_token'] = bin2hex(random_bytes(32));
        }
        
        return $_SESSION['csrf_token'];
    }
}


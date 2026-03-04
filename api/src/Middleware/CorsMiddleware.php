<?php

namespace App\Middleware;

use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Psr\Http\Server\MiddlewareInterface;
use Psr\Http\Server\RequestHandlerInterface;
use Nyholm\Psr7\Response;

class CorsMiddleware implements MiddlewareInterface
{
    private $allowedOrigins;
    private $allowAll;

    public function __construct()
    {
        $config = require __DIR__ . '/../../config.php';
        $corsConfig = $config['cors'];
        
        // Parse allowed origins dari string yang dipisahkan koma
        $this->allowedOrigins = array_map('trim', explode(',', $corsConfig['allowed_origins']));
        $this->allowAll = $corsConfig['allow_all'];
    }

    private function getAllowedOrigin(ServerRequestInterface $request): ?string
    {
        // Jika allow_all aktif (hanya untuk development), izinkan semua
        if ($this->allowAll) {
            $origin = $request->getHeaderLine('Origin');
            // Jika ada origin, return origin tersebut (akan digunakan dengan credentials)
            // Jika tidak ada origin, return '*' untuk allow all
            return $origin ?: '*';
        }

        // Ambil origin dari request
        $origin = $request->getHeaderLine('Origin');
        
        // Jika tidak ada origin header, return null (tidak perlu CORS untuk same-origin)
        if (empty($origin)) {
            return null;
        }

        // Cek apakah origin ada dalam daftar yang diizinkan
        if (in_array($origin, $this->allowedOrigins, true)) {
            return $origin;
        }

        // Izinkan semua domain alutsmani.id dan subdomain (uwaba, uwaba2, daftar, api2, dll.) — tidak perlu atur ulang tiap nambah subdomain
        if (cors_origin_is_alutsmani_id($origin)) {
            return $origin;
        }

        // Fallback: izinkan localhost dan port dev (5173, 5174, 5175) untuk development
        if (strpos($origin, 'localhost') !== false ||
            strpos($origin, '127.0.0.1') !== false ||
            strpos($origin, ':5173') !== false ||
            strpos($origin, ':5174') !== false ||
            strpos($origin, ':5175') !== false) {
            return $origin;
        }

        // Izinkan origin dari IP privat (LAN: 10.x, 192.168.x, 172.16–31.x) agar login dari IP (mis. 10.224.65.123:5173) tidak kena CORS
        $host = parse_url($origin, PHP_URL_HOST);
        if ($host && filter_var($host, FILTER_VALIDATE_IP)) {
            $ip = $host;
            if ((strpos($ip, '10.') === 0) || (strpos($ip, '192.168.') === 0) || (preg_match('/^172\.(1[6-9]|2[0-9]|3[0-1])\./', $ip) === 1)) {
                return $origin;
            }
        }

        // Origin tidak diizinkan
        return null;
    }

    public function process(ServerRequestInterface $request, RequestHandlerInterface $handler): ResponseInterface
    {
        $allowedOrigin = $this->getAllowedOrigin($request);

        // Handle preflight OPTIONS request — harus return 200 agar browser tidak blokir (CORS)
        if ($request->getMethod() === 'OPTIONS') {
            $response = new Response();
            $origin = $request->getHeaderLine('Origin');
            // Pastikan origin alutsmani.id / localhost / IP privat (LAN) selalu diizinkan untuk preflight
            if ($allowedOrigin === null && $origin !== '') {
                $host = parse_url($origin, PHP_URL_HOST);
                $isPrivateIp = ($host && filter_var($host, FILTER_VALIDATE_IP) && (
                    strpos($host, '10.') === 0 || strpos($host, '192.168.') === 0 || preg_match('/^172\.(1[6-9]|2[0-9]|3[0-1])\./', $host) === 1
                ));
                if (cors_origin_is_alutsmani_id($origin) ||
                    strpos($origin, 'localhost') !== false ||
                    strpos($origin, '127.0.0.1') !== false ||
                    strpos($origin, ':5173') !== false ||
                    strpos($origin, ':5174') !== false ||
                    strpos($origin, ':5175') !== false ||
                    $isPrivateIp) {
                    $allowedOrigin = $origin;
                }
            }
            // Jangan pernah return 403 untuk OPTIONS dari localhost/127 — browser butuh 200
            if ($allowedOrigin === null && !$this->allowAll) {
                $allowedOrigin = $origin ?: '*';
            }
            if ($allowedOrigin === null || ($allowedOrigin === '*' && $origin !== '')) {
                $allowedOrigin = $origin;
            }

            $allowHeaders = 'Content-Type, Authorization, X-Requested-With, X-CSRF-Token, X-Frontend-Base-URL, X-Frontend-Env, X-App-Source, Cache-Control, Pragma';
            $response = $response
                ->withStatus(200)
                ->withHeader('Access-Control-Allow-Headers', $allowHeaders)
                ->withHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
                ->withHeader('Access-Control-Max-Age', '3600');

            // Set origin header agar preflight lulus CORS
            if ($allowedOrigin !== null && $allowedOrigin !== '*') {
                $response = $response
                    ->withHeader('Access-Control-Allow-Origin', $allowedOrigin)
                    ->withHeader('Access-Control-Allow-Credentials', 'true');
            } elseif ($this->allowAll || $origin !== '') {
                $response = $response
                    ->withHeader('Access-Control-Allow-Origin', $origin ?: '*')
                    ->withHeader('Access-Control-Allow-Credentials', 'true');
            } else {
                $response = $response->withHeader('Access-Control-Allow-Origin', '*');
            }

            return $response;
        }

        try {
            $response = $handler->handle($request);
        } catch (\Throwable $e) {
            // Jika terjadi error, tetap buat response dengan CORS header
            error_log("CORS Middleware caught exception: " . $e->getMessage());
            $response = new Response(500);
        }

        // Set CORS headers untuk response - SELALU tambahkan header CORS
        // Ini penting untuk memastikan browser bisa membaca error response
        if ($this->allowAll) {
            // Jika allowAll aktif, selalu set CORS header
            // Cek origin dari request langsung untuk memastikan kita menggunakan origin spesifik jika ada
            $origin = $request->getHeaderLine('Origin');
            if ($origin && $origin !== '*') {
                // Jika ada origin spesifik dari request, gunakan dengan credentials
                $response = $response
                    ->withHeader('Access-Control-Allow-Origin', $origin)
                    ->withHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, X-CSRF-Token, X-Frontend-Base-URL, X-Frontend-Env, X-App-Source, Cache-Control, Pragma')
                    ->withHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
                    ->withHeader('Access-Control-Allow-Credentials', 'true');
            } elseif ($allowedOrigin && $allowedOrigin !== '*') {
                // Fallback: jika allowedOrigin adalah origin spesifik
                $response = $response
                    ->withHeader('Access-Control-Allow-Origin', $allowedOrigin)
                    ->withHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, X-CSRF-Token, X-Frontend-Base-URL, X-Frontend-Env, X-App-Source')
                    ->withHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
                    ->withHeader('Access-Control-Allow-Credentials', 'true');
            } else {
                // Jika tidak ada origin, gunakan '*' (tidak bisa pakai credentials dengan '*')
                $response = $response
                    ->withHeader('Access-Control-Allow-Origin', '*')
                    ->withHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, X-CSRF-Token, X-Frontend-Base-URL, X-Frontend-Env, X-App-Source, Cache-Control, Pragma')
                    ->withHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
            }
        } elseif ($allowedOrigin !== null) {
            // Jika allowAll tidak aktif, hanya set jika origin diizinkan
            $response = $response
                ->withHeader('Access-Control-Allow-Origin', $allowedOrigin)
                ->withHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, X-CSRF-Token, X-Frontend-Base-URL, X-Frontend-Env, X-App-Source, Cache-Control, Pragma')
                ->withHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
                ->withHeader('Access-Control-Allow-Credentials', 'true');
        } else {
            // Fallback: jika tidak ada origin yang diizinkan tapi allowAll false,
            // Tetap tambahkan CORS header untuk development (localhost) dan production (alutsmani.id + semua subdomain)
            $origin = $request->getHeaderLine('Origin');
            $host = parse_url($origin, PHP_URL_HOST);
            $isPrivateIp = ($host && filter_var($host, FILTER_VALIDATE_IP) && (
                strpos($host, '10.') === 0 || strpos($host, '192.168.') === 0 || preg_match('/^172\.(1[6-9]|2[0-9]|3[0-1])\./', $host) === 1
            ));
            if (cors_origin_is_alutsmani_id($origin) ||
                strpos($origin, 'localhost') !== false ||
                strpos($origin, '127.0.0.1') !== false ||
                strpos($origin, ':5173') !== false ||
                strpos($origin, ':5174') !== false ||
                strpos($origin, ':5175') !== false ||
                $isPrivateIp) {
                $response = $response
                    ->withHeader('Access-Control-Allow-Origin', $origin ?: '*')
                    ->withHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, X-CSRF-Token, X-Frontend-Base-URL, X-Frontend-Env, X-App-Source, Cache-Control, Pragma')
                    ->withHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
                    ->withHeader('Access-Control-Allow-Credentials', 'true');
            } else {
                // Respons 4xx/5xx tanpa CORS = browser blokir (tampil CORS error). Pastikan error tetap terbaca.
                $status = $response->getStatusCode();
                if ($status >= 400) {
                    $response = $response
                        ->withHeader('Access-Control-Allow-Origin', '*')
                        ->withHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, X-CSRF-Token, X-Frontend-Base-URL, X-Frontend-Env, X-App-Source, Cache-Control, Pragma')
                        ->withHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
                }
            }
        }

        return $response;
    }
}

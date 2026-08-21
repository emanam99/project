<?php

namespace App\Middleware;

use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Psr\Http\Server\MiddlewareInterface;
use Psr\Http\Server\RequestHandlerInterface;
use Nyholm\Psr7\Response;

class CorsMiddleware implements MiddlewareInterface
{
    private const ALLOW_HEADERS = 'Content-Type, Authorization, X-Requested-With, X-CSRF-Token, X-Frontend-Base-URL, X-Frontend-Env, X-App-Source, X-Public-Payment-Token, Cache-Control, Pragma, X-Client-App';

    private const ALLOW_METHODS = 'GET, POST, PUT, PATCH, DELETE, OPTIONS';

    private $allowedOrigins;
    private $allowAll;

    public function __construct()
    {
        $config = require __DIR__ . '/../../config.php';
        $corsConfig = $config['cors'];
        
        // Parse allowed origins dari string yang dipisahkan koma
        $this->allowedOrigins = array_map('trim', explode(',', $corsConfig['allowed_origins']));
        // CORS_ALLOW_ALL hanya efektif di APP_ENV local/development
        $this->allowAll = $corsConfig['allow_all'] && app_env_is_local();
    }

    private function isOriginAllowed(string $origin): bool
    {
        return cors_origin_is_allowed($origin, $this->allowAll, $this->allowedOrigins);
    }

    private function getAllowedOrigin(ServerRequestInterface $request): ?string
    {
        // Jika allowAll aktif (hanya development), izinkan semua
        if ($this->allowAll) {
            $origin = trim($request->getHeaderLine('Origin'));
            return $origin ?: '*';
        }

        $origin = trim($request->getHeaderLine('Origin'));
        if ($origin === '') {
            return null;
        }

        return $this->isOriginAllowed($origin) ? $origin : null;
    }

    public function process(ServerRequestInterface $request, RequestHandlerInterface $handler): ResponseInterface
    {
        $allowedOrigin = $this->getAllowedOrigin($request);

        // Handle preflight OPTIONS request — harus return 200 agar browser tidak blokir (CORS)
        if ($request->getMethod() === 'OPTIONS') {
            $response = new Response();
            $origin = trim($request->getHeaderLine('Origin'));
            if ($allowedOrigin === null && $origin !== '' && $this->isOriginAllowed($origin)) {
                $allowedOrigin = $origin;
            }
            // Jangan pernah return 403 untuk OPTIONS dari localhost/127 — browser butuh 200 (hanya dev)
            if ($allowedOrigin === null && !$this->allowAll && app_env_is_local()) {
                $allowedOrigin = $origin ?: '*';
            }
            if ($allowedOrigin === null || ($allowedOrigin === '*' && $origin !== '')) {
                $allowedOrigin = $origin;
            }

            $response = $response
                ->withStatus(200)
                ->withHeader('Access-Control-Allow-Headers', self::ALLOW_HEADERS)
                ->withHeader('Access-Control-Allow-Methods', self::ALLOW_METHODS)
                ->withHeader('Access-Control-Max-Age', '3600');

            $originToSend = ($origin !== '' && $origin !== '*') ? $origin : null;
            if ($allowedOrigin !== null && $allowedOrigin !== '*') {
                $response = $response
                    ->withHeader('Access-Control-Allow-Origin', $originToSend ?? $allowedOrigin)
                    ->withHeader('Access-Control-Allow-Credentials', 'true');
            } elseif ($this->allowAll || ($origin !== '' && $this->isOriginAllowed($origin))) {
                $response = $response
                    ->withHeader('Access-Control-Allow-Origin', $originToSend ?? $origin ?: '*')
                    ->withHeader('Access-Control-Allow-Credentials', 'true');
            } else {
                $response = $response->withHeader('Access-Control-Allow-Origin', '*');
            }

            return $response;
        }

        try {
            $response = $handler->handle($request);
        } catch (\Throwable $e) {
            error_log("CORS Middleware caught exception: " . $e->getMessage());
            $response = new Response(500);
        }

        if ($this->allowAll) {
            $origin = trim($request->getHeaderLine('Origin'));
            if ($origin !== '' && $origin !== '*') {
                $response = $response
                    ->withHeader('Access-Control-Allow-Origin', $origin)
                    ->withHeader('Access-Control-Allow-Headers', self::ALLOW_HEADERS)
                    ->withHeader('Access-Control-Allow-Methods', self::ALLOW_METHODS)
                    ->withHeader('Access-Control-Allow-Credentials', 'true');
            } elseif ($allowedOrigin && $allowedOrigin !== '*') {
                $response = $response
                    ->withHeader('Access-Control-Allow-Origin', $allowedOrigin)
                    ->withHeader('Access-Control-Allow-Headers', self::ALLOW_HEADERS)
                    ->withHeader('Access-Control-Allow-Methods', self::ALLOW_METHODS)
                    ->withHeader('Access-Control-Allow-Credentials', 'true');
            } else {
                $response = $response
                    ->withHeader('Access-Control-Allow-Origin', '*')
                    ->withHeader('Access-Control-Allow-Headers', self::ALLOW_HEADERS)
                    ->withHeader('Access-Control-Allow-Methods', self::ALLOW_METHODS);
            }
        } elseif ($allowedOrigin !== null) {
            $originFromRequest = trim($request->getHeaderLine('Origin'));
            $valueToSet = ($originFromRequest !== '' && $originFromRequest !== '*') ? $originFromRequest : $allowedOrigin;
            $response = $response
                ->withHeader('Access-Control-Allow-Origin', $valueToSet)
                ->withHeader('Access-Control-Allow-Headers', self::ALLOW_HEADERS)
                ->withHeader('Access-Control-Allow-Methods', self::ALLOW_METHODS)
                ->withHeader('Access-Control-Allow-Credentials', 'true');
        } else {
            $origin = trim($request->getHeaderLine('Origin'));
            if ($origin !== '' && $this->isOriginAllowed($origin)) {
                $response = $response
                    ->withHeader('Access-Control-Allow-Origin', $origin)
                    ->withHeader('Access-Control-Allow-Headers', self::ALLOW_HEADERS)
                    ->withHeader('Access-Control-Allow-Methods', self::ALLOW_METHODS)
                    ->withHeader('Access-Control-Allow-Credentials', 'true');
            } else {
                $status = $response->getStatusCode();
                if ($status >= 400) {
                    $response = $response
                        ->withHeader('Access-Control-Allow-Origin', '*')
                        ->withHeader('Access-Control-Allow-Headers', self::ALLOW_HEADERS)
                        ->withHeader('Access-Control-Allow-Methods', self::ALLOW_METHODS);
                }
            }
        }

        // Jaring pengaman: origin sah tapi belum ada ACAO
        $originSafe = trim($request->getHeaderLine('Origin'));
        if ($originSafe !== '' && !$response->hasHeader('Access-Control-Allow-Origin')) {
            if ($this->isOriginAllowed($originSafe)) {
                $response = $response
                    ->withHeader('Access-Control-Allow-Origin', $originSafe)
                    ->withHeader('Access-Control-Allow-Headers', self::ALLOW_HEADERS)
                    ->withHeader('Access-Control-Allow-Methods', self::ALLOW_METHODS)
                    ->withHeader('Access-Control-Allow-Credentials', 'true');
            } elseif ($response->getStatusCode() >= 400) {
                $response = $response
                    ->withHeader('Access-Control-Allow-Origin', '*')
                    ->withHeader('Access-Control-Allow-Headers', self::ALLOW_HEADERS)
                    ->withHeader('Access-Control-Allow-Methods', self::ALLOW_METHODS);
            }
        }

        return $response;
    }
}

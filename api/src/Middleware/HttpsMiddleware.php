<?php

namespace App\Middleware;

use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Psr\Http\Server\MiddlewareInterface;
use Psr\Http\Server\RequestHandlerInterface;
use Nyholm\Psr7\Response;

class HttpsMiddleware implements MiddlewareInterface
{
    private $forceHttps;

    /** Hindari false positive (mis. VITE_APP_ENV=production). */
    public static function envFileHasExactKeyValue(string $path, string $key, string $value): bool
    {
        $content = @file_get_contents($path);
        if ($content === false) {
            return false;
        }
        foreach (preg_split('/\r\n|\r|\n/', $content) as $line) {
            $line = trim($line);
            if ($line === '' || $line[0] === '#') {
                continue;
            }
            if (preg_match('/^' . preg_quote($key, '/') . '\s*=\s*(.+)$/i', $line, $m)) {
                return strcasecmp(trim($m[1], " \t\"'"), $value) === 0;
            }
        }
        return false;
    }

    public function __construct()
    {
        $isProduction = getenv('APP_ENV') === 'production';
        if (!$isProduction && file_exists(__DIR__ . '/../../.env')) {
            $isProduction = self::envFileHasExactKeyValue(__DIR__ . '/../../.env', 'APP_ENV', 'production');
        }
        $forceHttpsEnv = getenv('FORCE_HTTPS');
        if ($forceHttpsEnv === false || $forceHttpsEnv === '') {
            $this->forceHttps = $isProduction;
        } else {
            $this->forceHttps = filter_var($forceHttpsEnv, FILTER_VALIDATE_BOOLEAN);
        }
    }

    public function process(ServerRequestInterface $request, RequestHandlerInterface $handler): ResponseInterface
    {
        if (!$this->forceHttps) {
            return $handler->handle($request);
        }

        if ($this->isHttpsRequest($request)) {
            return $handler->handle($request);
        }

        $uri = $request->getUri();
        $httpsUri = $uri->withScheme('https')->withPort(443);
        $response = new Response();
        $response = $response
            ->withStatus(301)
            ->withHeader('Location', (string) $httpsUri);
        $origin = trim($request->getHeaderLine('Origin'));
        if ($origin !== '' && function_exists('cors_origin_is_trusted') && cors_origin_is_trusted($origin)) {
            $response = $response
                ->withHeader('Access-Control-Allow-Origin', $origin)
                ->withHeader('Access-Control-Allow-Credentials', 'true')
                ->withHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, X-CSRF-Token, X-Frontend-Base-URL, X-Frontend-Env, X-App-Source, X-Public-Payment-Token, Cache-Control, Pragma, X-Client-App')
                ->withHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
        }

        return $response;
    }

    /**
     * Deteksi HTTPS — termasuk di belakang reverse proxy (shared hosting).
     * X-Forwarded-Proto / X-Forwarded-Ssl dipercaya saat forceHttps aktif (production).
     */
    private function isHttpsRequest(ServerRequestInterface $request): bool
    {
        $uri = $request->getUri();
        if (strtolower($uri->getScheme()) === 'https') {
            return true;
        }

        $serverParams = $request->getServerParams();

        if (!empty($serverParams['HTTPS']) && strtolower((string) $serverParams['HTTPS']) !== 'off') {
            return true;
        }

        if (!$this->forceHttps) {
            return false;
        }

        $xfp = strtolower(trim($request->getHeaderLine('X-Forwarded-Proto')));
        if ($xfp === '') {
            $xfp = strtolower(trim((string) ($serverParams['HTTP_X_FORWARDED_PROTO'] ?? '')));
        }
        if ($xfp === 'https') {
            return true;
        }

        $xfs = strtolower(trim($request->getHeaderLine('X-Forwarded-Ssl')));
        if ($xfs === '') {
            $xfs = strtolower(trim((string) ($serverParams['HTTP_X_FORWARDED_SSL'] ?? '')));
        }
        if ($xfs === 'on') {
            return true;
        }

        return false;
    }
}

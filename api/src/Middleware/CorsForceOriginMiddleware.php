<?php

namespace App\Middleware;

use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Psr\Http\Server\MiddlewareInterface;
use Psr\Http\Server\RequestHandlerInterface;

/**
 * Dipasang sebagai middleware PERTAMA (outermost) agar jalan TERAKHIR saat response kembali.
 * Memaksa header Access-Control-Allow-Origin ke origin request yang diizinkan,
 * sehingga nilai yang salah (mis. uwaba2 dari cache/env) tidak pernah sampai ke browser.
 */
class CorsForceOriginMiddleware implements MiddlewareInterface
{
    private static function isOriginAllowed(string $origin): bool
    {
        if ($origin === '') {
            return false;
        }
        $host = parse_url($origin, PHP_URL_HOST);
        if (!$host || $host === '') {
            return false;
        }
        $host = strtolower($host);
        if ($host === 'localhost' || $host === '127.0.0.1') {
            return true;
        }
        if (strpos($origin, ':5173') !== false || strpos($origin, ':5174') !== false || strpos($origin, ':5175') !== false) {
            return true;
        }
        if ($host === 'alutsmani.id' || (strlen($host) > 13 && substr($host, -13) === '.alutsmani.id')) {
            return true;
        }
        if ($host === 'alutsmani.my.id' || (strlen($host) > 16 && substr($host, -16) === '.alutsmani.my.id')) {
            return true;
        }
        if (filter_var($host, FILTER_VALIDATE_IP)) {
            if (strpos($host, '10.') === 0 || strpos($host, '192.168.') === 0 ||
                preg_match('/^172\.(1[6-9]|2[0-9]|3[0-1])\./', $host)) {
                return true;
            }
        }
        return false;
    }

    public function process(ServerRequestInterface $request, RequestHandlerInterface $handler): ResponseInterface
    {
        $response = $handler->handle($request);

        $origin = $request->getHeaderLine('Origin');
        if ($origin === '' || !self::isOriginAllowed($origin)) {
            return $response;
        }

        $response = $response->withoutHeader('Access-Control-Allow-Origin');
        return $response
            ->withHeader('Access-Control-Allow-Origin', $origin)
            ->withHeader('Access-Control-Allow-Credentials', 'true');
    }
}

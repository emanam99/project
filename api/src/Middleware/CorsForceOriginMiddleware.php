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
        return cors_origin_is_allowed($origin, false, []);
    }

    public function process(ServerRequestInterface $request, RequestHandlerInterface $handler): ResponseInterface
    {
        $response = $handler->handle($request);

        $origin = trim($request->getHeaderLine('Origin'));
        if ($origin === '' || !self::isOriginAllowed($origin)) {
            return $response;
        }

        $response = $response->withoutHeader('Access-Control-Allow-Origin');
        return $response
            ->withHeader('Access-Control-Allow-Origin', $origin)
            ->withHeader('Access-Control-Allow-Credentials', 'true');
    }
}

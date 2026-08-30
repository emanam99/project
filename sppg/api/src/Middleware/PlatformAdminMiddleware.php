<?php

namespace App\Middleware;

use App\Helpers\AuthHelper;
use App\Helpers\PlatformAdminHelper;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;
use Psr\Http\Server\MiddlewareInterface;
use Psr\Http\Server\RequestHandlerInterface as RequestHandler;
use Slim\Psr7\Response as SlimResponse;

class PlatformAdminMiddleware implements MiddlewareInterface
{
    public function process(Request $request, RequestHandler $handler): Response
    {
        if (!PlatformAdminHelper::isPlatformAdminHost()) {
            $response = new SlimResponse();
            $response->getBody()->write(json_encode([
                'success' => false,
                'message' => 'Panel admin hanya dapat diakses dari host admin platform',
            ], JSON_UNESCAPED_UNICODE));
            return $response->withHeader('Content-Type', 'application/json')->withStatus(403);
        }

        $user = AuthHelper::getUserFromRequest($request);
        if (!$user || !PlatformAdminHelper::isPlatformAdminRole($user['role'] ?? null)) {
            $response = new SlimResponse();
            $response->getBody()->write(json_encode([
                'success' => false,
                'message' => 'Akses admin platform ditolak',
            ], JSON_UNESCAPED_UNICODE));
            return $response->withHeader('Content-Type', 'application/json')->withStatus(403);
        }

        return $handler->handle($request->withAttribute('user', $user));
    }
}

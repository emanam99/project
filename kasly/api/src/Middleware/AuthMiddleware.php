<?php

namespace App\Middleware;

use App\Helpers\AuthHelper;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;
use Psr\Http\Server\MiddlewareInterface;
use Psr\Http\Server\RequestHandlerInterface as RequestHandler;
use Slim\Psr7\Response as SlimResponse;
use Slim\Routing\RouteContext;

class AuthMiddleware implements MiddlewareInterface
{
    /** Route pattern yang tetap boleh diakses user role pending. */
    private const PENDING_ALLOWED = ['/auth/me', '/auth/logout'];

    public function process(Request $request, RequestHandler $handler): Response
    {
        $user = AuthHelper::getUserFromRequest($request);
        if (!$user) {
            $response = new SlimResponse();
            $response->getBody()->write(json_encode([
                'success' => false,
                'message' => 'Unauthorized',
            ], JSON_UNESCAPED_UNICODE));
            return $response
                ->withHeader('Content-Type', 'application/json')
                ->withStatus(401);
        }

        if (AuthHelper::isPendingRole($user['role'] ?? null)) {
            $pattern = '';
            try {
                $route = RouteContext::fromRequest($request)->getRoute();
                $pattern = $route ? (string) $route->getPattern() : '';
            } catch (\Throwable $e) {
                $pattern = '';
            }

            if (!in_array($pattern, self::PENDING_ALLOWED, true)) {
                $response = new SlimResponse();
                $response->getBody()->write(json_encode([
                    'success' => false,
                    'message' => 'Akun Anda belum memiliki akses. Silakan hubungi admin.',
                    'code' => 'pending_access',
                ], JSON_UNESCAPED_UNICODE));
                return $response
                    ->withHeader('Content-Type', 'application/json')
                    ->withStatus(403);
            }
        }

        return $handler->handle($request->withAttribute('user', $user));
    }
}

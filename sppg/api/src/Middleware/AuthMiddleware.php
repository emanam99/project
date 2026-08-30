<?php

namespace App\Middleware;

use App\Helpers\AuthHelper;
use App\Helpers\TenantHelper;
use App\Services\SppgService;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;
use Psr\Http\Server\MiddlewareInterface;
use Psr\Http\Server\RequestHandlerInterface as RequestHandler;
use Slim\Psr7\Response as SlimResponse;
use Slim\Routing\RouteContext;

class AuthMiddleware implements MiddlewareInterface
{
    /** Route pattern yang tetap boleh diakses user role pending. */
    private const PENDING_ALLOWED = ['/auth/me', '/auth/logout', '/auth/complete-pick'];

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

        $pattern = '';
        try {
            $route = RouteContext::fromRequest($request)->getRoute();
            $pattern = $route ? (string) $route->getPattern() : '';
        } catch (\Throwable $e) {
            $pattern = '';
        }

        if (\App\Helpers\PlatformAdminHelper::isPlatformAdminRole($user['role'] ?? null)) {
            return $handler->handle($request->withAttribute('user', $user));
        }

        if (AuthHelper::isPendingRole($user['role'] ?? null)) {
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

        if (!in_array($pattern, TenantHelper::SUBSCRIPTION_BYPASS, true)) {
            $sppgService = new SppgService();
            $sppgId = (int) ($user['sppg_id'] ?? 0);
            $sppg = $sppgService->findById($sppgId);
            $sub = $sppgService->getActiveSubscription($sppgId);
            if (!TenantHelper::subscriptionAllowsAppAccess($sppg, $sub)) {
                $response = new SlimResponse();
                $response->getBody()->write(json_encode([
                    'success' => false,
                    'message' => 'Langganan belum aktif. Selesaikan pembayaran untuk melanjutkan.',
                    'code' => 'subscription_inactive',
                ], JSON_UNESCAPED_UNICODE));
                return $response
                    ->withHeader('Content-Type', 'application/json')
                    ->withStatus(402);
            }
        }

        return $handler->handle($request->withAttribute('user', $user));
    }
}

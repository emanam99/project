<?php

declare(strict_types=1);

use Psr\Http\Message\ServerRequestInterface as Request;
use Psr\Http\Message\ResponseInterface as Response;
use App\Controllers\AuthController;
use App\Middleware\AuthMiddleware;

return function (\Slim\App $app): void {
    // Debug path — hanya local/dev (jangan buka struktur deploy di prod/staging).
    $appEnv = strtolower((string) (getenv('APP_ENV') ?: ''));
    $allowTestEndpoint = in_array($appEnv, ['local', 'development', 'dev', 'test'], true);
    if ($allowTestEndpoint) {
        $app->get('/api/test', function (Request $request, Response $response) {
            $response->getBody()->write(json_encode([
                'success' => true,
                'message' => 'Backend API is working!',
                'base_path' => $request->getUri()->getBasePath(),
                'path' => $request->getUri()->getPath(),
                'script_name' => $_SERVER['SCRIPT_NAME'] ?? 'not set',
                'request_uri' => $_SERVER['REQUEST_URI'] ?? 'not set'
            ], JSON_PRETTY_PRINT));
            return $response->withHeader('Content-Type', 'application/json');
        });
    }

    $app->post('/api/auth/login', [AuthController::class, 'login']);
    $app->post('/api/auth/login-nik', [AuthController::class, 'loginNik']);
    $app->post('/api/auth/daftar-wa-prepare', [AuthController::class, 'prepareDaftarWa']);
    $app->post('/api/auth/daftar-wa-consume', [AuthController::class, 'consumeDaftarWaToken']);
    $app->get('/api/auth/verify', [AuthController::class, 'verify']);
    $app->get('/api/auth/csrf-token', [AuthController::class, 'getCsrfToken']);
};

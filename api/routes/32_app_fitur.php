<?php

declare(strict_types=1);

use App\Middleware\AuthMiddleware;
use App\Controllers\AppFiturController;

return function (\Slim\App $app): void {
    $app->get('/api/v2/me/fitur-menu', [AppFiturController::class, 'getMyMenu'])->add(new AuthMiddleware());
    $app->get('/api/v2/me/fitur-favorit', [AppFiturController::class, 'getMyFiturFavorit'])->add(new AuthMiddleware());
    $app->put('/api/v2/me/fitur-favorit', [AppFiturController::class, 'putMyFiturFavorit'])->add(new AuthMiddleware());
    $app->get('/api/v2/fitur/ebeddien/menu-catalog', [AppFiturController::class, 'getEbeddienMenuCatalog'])->add(new AuthMiddleware());
};

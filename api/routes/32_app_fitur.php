<?php

declare(strict_types=1);

use App\Middleware\AuthMiddleware;
use App\Controllers\AppFiturController;

return function (\Slim\App $app): void {
    $app->get('/api/v2/me/fitur-menu', [AppFiturController::class, 'getMyMenu'])->add(new AuthMiddleware());
};

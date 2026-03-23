<?php

declare(strict_types=1);

use App\Middleware\AuthMiddleware;
use App\Middleware\RoleMiddleware;
use App\Controllers\LembagaKitabController;

return function (\Slim\App $app): void {
    $app->group('/api/mapel', function ($group) {
        $group->get('', [LembagaKitabController::class, 'getAll']);
        $group->get('/{id}', [LembagaKitabController::class, 'getById']);
        $group->post('', [LembagaKitabController::class, 'create']);
        $group->put('/{id}', [LembagaKitabController::class, 'update']);
        $group->delete('/{id}', [LembagaKitabController::class, 'delete']);
    })->add(new RoleMiddleware(['super_admin', 'tarbiyah']))->add(new AuthMiddleware());
};
